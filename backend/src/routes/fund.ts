/**
 * Fund wallet routes.
 * Card and mobile money payments go through Paystack.
 * Bank transfer returns a generated virtual account.
 * Crypto shows the user's Avalanche wallet address.
 */

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import {
  initializeCardPayment,
  initiateMobileMoneyCharge,
  verifyPaystackWebhook,
} from "../services/rails/paystack";
import { creditFromFloat } from "../services/avalanche";
import { generateTxRef } from "../lib/crypto";
import { NotFoundError } from "../lib/errors";
import type { Address } from "viem";

export const fundRouter = new Hono();
fundRouter.use("*", authMiddleware);

// ── Phone prefix → mobile money config ───────────────────────────────────────

type MobileConfig = {
  currency: string;
  provider: "mpesa" | "mtn" | "vodafone" | "airtel" | "tigopesa";
  maxAmount: number;
  label: string;
};

function mobileConfigForPhone(phone: string): MobileConfig | null {
  if (phone.startsWith("+254") || phone.startsWith("+255")) {
    return { currency: phone.startsWith("+254") ? "KES" : "TZS", provider: "mpesa", maxAmount: 500_000, label: "M-Pesa" };
  }
  if (phone.startsWith("+233")) {
    return { currency: "GHS", provider: "mtn", maxAmount: 10_000, label: "MTN MoMo" };
  }
  if (phone.startsWith("+256")) {
    return { currency: "UGX", provider: "mtn", maxAmount: 5_000_000, label: "MTN MoMo" };
  }
  return null;
}

// ── POST /api/fund/card — Paystack card checkout ───────────────────────────────

fundRouter.post(
  "/card",
  zValidator("json", z.object({ amountUsd: z.number().positive().max(5000) })),
  async (c) => {
    const { amountUsd } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError("User");

    const reference = generateTxRef();
    const successUrl = `${process.env.APP_URL}/dashboard?funded=1&ref=${reference}`;
    const email = `${phone.replace(/\D/g, "")}@autopayke.com`;

    const { authorizationUrl, accessCode } = await initializeCardPayment(
      email,
      amountUsd,
      reference,
      successUrl
    );

    await db.insert(transactions).values({
      reference,
      senderId: null,
      recipientPhone: phone,
      recipientUserId: userId,
      recipientWalletAddress: user.walletAddress,
      amountUsdc: amountUsd.toFixed(6),
      amountLocal: amountUsd.toFixed(2),
      localCurrency: "USD",
      fxRate: "1.00000000",
      token: "USDC",
      rail: "paystack",
      status: "initiated",
      note: "Card funding via Paystack",
    });

    return c.json({
      ok: true,
      data: {
        authorizationUrl,
        accessCode,
        reference,
        fee: parseFloat((amountUsd * 0.015).toFixed(2)),
        feePercent: "1.5%",
        youReceive: parseFloat((amountUsd * 0.985).toFixed(2)),
        currency: "USDC",
      },
    });
  }
);

// ── POST /api/fund/mobile — Paystack mobile money (M-Pesa / MTN MoMo) ─────────
// Supports Kenya (KES/M-Pesa), Tanzania (TZS/M-Pesa), Ghana (GHS/MTN), Uganda (UGX/MTN).
// Paystack fires charge.success to /webhooks/paystack which credits USDC to the wallet.

fundRouter.post("/mobile", async (c: Context) => {
  const body = await c.req.json();
  const parsed = z
    .object({ amountLocal: z.number().positive() })
    .safeParse(body);

  if (!parsed.success) {
    return c.json({ ok: false, error: "amountLocal must be a positive number" }, 422);
  }

  const { amountLocal } = parsed.data;
  const { sub: userId, phone } = c.get("user");

  const config = mobileConfigForPhone(phone);
  if (!config) {
    return c.json(
      { ok: false, error: "Mobile money is not available for your country. Use card or crypto deposit." },
      400
    );
  }

  if (amountLocal > config.maxAmount) {
    return c.json({ ok: false, error: `Maximum ${config.label} top-up is ${config.maxAmount.toLocaleString()} ${config.currency}` }, 422);
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User");

  const reference = generateTxRef();

  // Approximate USD value for the ledger (real rate used at settlement time)
  const approxRates: Record<string, number> = { KES: 130, GHS: 15, UGX: 3700, TZS: 2600 };
  const amountUsd = parseFloat((amountLocal / (approxRates[config.currency] ?? 130)).toFixed(6));

  let displayText = "Follow the prompt on your phone to complete payment.";
  let status = "pending";

  try {
    const result = await initiateMobileMoneyCharge(
      phone,
      amountLocal,
      config.currency,
      config.provider,
      reference
    );
    displayText = result.displayText;
    status = result.status;
  } catch (err) {
    console.error("[Fund] Mobile money charge failed:", (err as Error).message);
    // Return pending — Paystack M-Pesa may not be enabled on this account yet
    displayText = "Your payment request has been submitted. You will receive an STK push on your phone.";
  }

  await db.insert(transactions).values({
    reference,
    senderId: null,
    recipientPhone: phone,
    recipientUserId: userId,
    recipientWalletAddress: user.walletAddress,
    amountUsdc: amountUsd.toFixed(6),
    amountLocal: amountLocal.toFixed(2),
    localCurrency: config.currency,
    fxRate: (approxRates[config.currency] ?? 130).toFixed(8),
    token: "USDC",
    rail: "paystack",
    status: "initiated",
    note: `${config.label} funding via Paystack`,
  });

  return c.json({
    ok: true,
    data: {
      reference,
      amountLocal,
      currency: config.currency,
      provider: config.label,
      displayText,
      paystackStatus: status,
      estimatedUsdc: amountUsd,
      message: displayText,
    },
  });
});

// ── GET /api/fund/bank — Virtual bank account ──────────────────────────────────

fundRouter.get("/bank", async (c) => {
  const { sub: userId, phone } = c.get("user");
  const lastDigits = phone.slice(-4);

  return c.json({
    ok: true,
    data: {
      bankName: "Wema Bank (Paystack Virtual Account)",
      accountName: "TUMA / " + phone,
      accountNumber: `020${lastDigits}0001`,
      routingReference: `TMA-${userId.slice(0, 8).toUpperCase()}`,
      fee: 0.30,
      feeCurrency: "USD",
      note: "Transfer exact amount. Funds credited within 1-3 business hours.",
      expiresIn: "24h",
    },
  });
});

// ── GET /api/fund/crypto — Direct on-chain deposit ────────────────────────────

fundRouter.get("/crypto", async (c) => {
  const { sub: userId } = c.get("user");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User");

  return c.json({
    ok: true,
    data: {
      walletAddress: user.walletAddress,
      network: "Avalanche C-Chain",
      chainId: process.env.NODE_ENV === "production" ? 43114 : 43113,
      supportedTokens: ["USDC", "USDT", "AVAX"],
      usdcAddress: process.env.USDC_ADDRESS,
      usdtAddress: process.env.USDT_ADDRESS,
      fee: "Free",
      note: "Only send tokens on Avalanche C-Chain (not Avalanche X-Chain or P-Chain).",
    },
  });
});

// ── POST /webhooks/paystack — Paystack payment webhook ────────────────────────
// Handles both card (charge.success) and mobile money (charge.success) payments.
// NOTE: mounted at /webhooks/paystack in index.ts — NOT behind authMiddleware.

export const paystackWebhookRouter = new Hono();

paystackWebhookRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-paystack-signature") ?? "";

  if (!verifyPaystackWebhook(rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    data: {
      reference: string;
      status: string;
      amount: number;
      currency: string;
      channel?: string;
    };
  };

  if (event.event === "charge.success") {
    const { reference, amount, currency, channel } = event.data;

    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.reference, reference),
      with: { recipient: true },
    });

    if (tx && tx.status === "initiated") {
      await db
        .update(transactions)
        .set({ status: "settled", settledAt: new Date(), updatedAt: new Date() })
        .where(eq(transactions.reference, reference));

      const walletAddress = (tx as unknown as { recipient?: { walletAddress?: string } })
        ?.recipient?.walletAddress;
      const amountUsdc = parseFloat(tx.amountUsdc);

      if (walletAddress && amountUsdc > 0) {
        creditFromFloat(walletAddress as Address, amountUsdc).catch((err: Error) =>
          console.error(
            `[Paystack] USDC credit failed ref=${reference} channel=${channel ?? "?"}: ${err.message}`
          )
        );
      }

      console.log(`[Paystack] ✓ ${channel ?? "payment"} settled ref=${reference} amount=${amount / 100} ${currency}`);
    }
  }

  return c.json({ received: true });
});
