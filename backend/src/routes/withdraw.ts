import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { WithdrawSchema, dialCodeToCountry, type Rail } from "@tuma/shared";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { withdrawLimiter } from "../middleware/rateLimit";
import { getMidRate, computeCashoutFeeUsd } from "../services/fx";
import { transferUsdc, getUsdcBalance } from "../services/avalanche";
import { disburseToRail } from "../services/rails";
import { railProviderIdempotencyKey } from "../services/rail-disbursement";
import { startSettlementFlow, recordSettlementStep } from "../services/settlement";
import { generateTxRef } from "../lib/crypto";
import { InsufficientFundsError, NotFoundError, ValidationError, BlockchainError } from "../lib/errors";
import { parseUnits } from "viem";
import type { Address } from "viem";

export const withdrawRouter = new Hono();
withdrawRouter.use("*", authMiddleware);

// POST /api/withdraw — cash out USDC to mobile money / bank in the user's home country.
withdrawRouter.post(
  "/",
  withdrawLimiter,
  zValidator("json", WithdrawSchema),
  async (c) => {
    const { amountUsd } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const country = dialCodeToCountry(phone);
    if (!country) throw new ValidationError("Withdrawals are not yet available for your country");

    const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;
    if (!treasuryAddress) throw new BlockchainError("TREASURY_ADDRESS is not configured");

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.walletAddress) throw new NotFoundError("Wallet");

    const feeUsd = computeCashoutFeeUsd(amountUsd);
    const netUsd = parseFloat((amountUsd - feeUsd).toFixed(6));
    if (netUsd <= 0) throw new ValidationError("Amount too small to cover the network fee");

    const balanceRaw = await getUsdcBalance(user.walletAddress as Address);
    const requiredRaw = parseUnits(amountUsd.toFixed(6), 6);
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    const midRate = await getMidRate(country.currency);
    const amountLocal = parseFloat((netUsd * midRate).toFixed(2));
    const reference = generateTxRef();

    // Pull the full withdrawn amount out of the user's wallet into the TUMA treasury —
    // the fee portion stays there, the rest backs the fiat payout below.
    const txHash = await transferUsdc(
      user.phoneHash,
      user.walletAddress as Address,
      treasuryAddress,
      amountUsd
    );

    const [tx] = await db
      .insert(transactions)
      .values({
        reference,
        senderId: userId,
        recipientPhone: phone,
        recipientUserId: userId,
        recipientWalletAddress: user.walletAddress,
        amountUsdc: amountUsd.toFixed(6),
        amountLocal: amountLocal.toFixed(2),
        localCurrency: country.currency,
        fxRate: midRate.toFixed(8),
        fxLockedAt: new Date(),
        token: "USDC",
        rail: country.primaryRail,
        feeUsdc: feeUsd.toFixed(6),
        txHash,
        note: "Cash-out withdrawal",
      })
      .returning();

    await recordSettlementStep(tx.id, "onchain", { txHash });

    const { railReference } = await disburseToRail({
      recipientPhone: phone,
      amountLocal,
      localCurrency: country.currency,
      reference,
      providerIdempotencyKey: railProviderIdempotencyKey(
        tx.id,
        "withdraw_rail_disbursement"
      ),
    });

    await startSettlementFlow(tx.id, txHash, country.primaryRail as Rail, railReference);

    return c.json({
      ok: true,
      data: {
        transactionId: tx.id,
        reference,
        txHash,
        amountLocal,
        localCurrency: country.currency,
        feeUsd,
        rail: country.primaryRail,
        status: "routed",
      },
    });
  }
);
