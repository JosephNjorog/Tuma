/**
 * Inbound webhook handlers for external payment rails.
 * All endpoints are public (no JWT) but verified via
 * body parsing / header signatures.
 *
 * Mounted at:
 *   /webhooks/mpesa/result   ← M-Pesa B2C disbursement result
 *   /webhooks/mpesa/timeout  ← M-Pesa B2C queue timeout
 *   /webhooks/mpesa/stk      ← M-Pesa STK Push (fund) callback
 *   /webhooks/momo           ← MTN MoMo disbursement callback
 */

import { Hono } from "hono";
import { db } from "../db";
import { transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordSettlementStep } from "../services/settlement";
import { getJson } from "../lib/redis";
import { keys } from "../lib/redis";
import { creditFromFloat } from "../services/avalanche";
import type { Address } from "viem";

// ── M-Pesa ────────────────────────────────────────────────────────────────────

export const mpesaWebhookRouter = new Hono();

// POST /webhooks/mpesa/result — B2C disbursement async result
mpesaWebhookRouter.post("/result", async (c) => {
  const body = await c.req.json() as {
    Result: {
      ResultCode: number;
      ResultDesc: string;
      ConversationID: string;
      TransactionID?: string;
      ResultParameters?: {
        ResultParameter: Array<{ Key: string; Value: string | number }>;
      };
    };
  };

  const { ResultCode, ConversationID, TransactionID, ResultDesc } = body.Result;

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, ConversationID),
  });

  if (!tx) {
    console.warn(`[Webhook:Mpesa] No TX found for ConversationID=${ConversationID}`);
    return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (tx.status === "settled" || tx.status === "failed") {
    return c.json({ ResultCode: 0, ResultDesc: "Already processed" });
  }

  if (ResultCode === 0) {
    await recordSettlementStep(tx.id, "settled", {
      mpesaTransactionId: TransactionID,
      resultDesc: ResultDesc,
    });
    console.log(`[Webhook:Mpesa] ✓ B2C settled TX=${tx.id} MPESA=${TransactionID}`);
  } else {
    await recordSettlementStep(tx.id, "failed", {
      resultCode: ResultCode,
      resultDesc: ResultDesc,
    });
    console.error(`[Webhook:Mpesa] ✗ B2C failed TX=${tx.id} code=${ResultCode}: ${ResultDesc}`);
  }

  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// POST /webhooks/mpesa/timeout — B2C queue timeout (treat as pending, let poller handle)
mpesaWebhookRouter.post("/timeout", async (c) => {
  const body = await c.req.json() as { ConversationID?: string };
  console.warn(`[Webhook:Mpesa] B2C timeout ConversationID=${body.ConversationID ?? "unknown"}`);
  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// POST /webhooks/mpesa/stk — STK Push fund callback
mpesaWebhookRouter.post("/stk", async (c) => {
  const body = await c.req.json() as {
    Body: {
      stkCallback: {
        MerchantRequestID: string;
        CheckoutRequestID: string;
        ResultCode: number;
        ResultDesc: string;
        CallbackMetadata?: {
          Item: Array<{ Name: string; Value?: string | number }>;
        };
      };
    };
  };

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } =
    body.Body.stkCallback;

  // Resolve internal reference stored in Redis at STK initiation
  const reference = await getJson<string>(keys.stkRef(CheckoutRequestID));

  if (!reference) {
    console.warn(`[Webhook:Mpesa:STK] No reference for CheckoutRequestID=${CheckoutRequestID}`);
    return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.reference, reference),
    with: { recipientUser: true },
  });

  if (!tx) {
    return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (ResultCode === 0 && CallbackMetadata) {
    const meta = Object.fromEntries(
      CallbackMetadata.Item.map((i) => [i.Name, i.Value])
    );

    await recordSettlementStep(tx.id, "settled", {
      mpesaRef: meta["MpesaReceiptNumber"],
      amountKes: meta["Amount"],
    });

    // Credit USDC from TUMA float to the user's smart wallet (non-blocking)
    const walletAddress = (tx as unknown as { recipientUser?: { walletAddress?: string } })
      ?.recipientUser?.walletAddress;

    if (walletAddress) {
      creditFromFloat(walletAddress as Address, parseFloat(tx.amountUsdc)).catch(
        (err: Error) =>
          console.error(`[Webhook:Mpesa:STK] USDC credit failed ref=${reference}:`, err.message)
      );
    }

    console.log(`[Webhook:Mpesa:STK] ✓ Funded ref=${reference}`);
  } else {
    await recordSettlementStep(tx.id, "failed", {
      resultCode: ResultCode,
      resultDesc: ResultDesc,
    });
    console.error(`[Webhook:Mpesa:STK] ✗ Failed ref=${reference} code=${ResultCode}: ${ResultDesc}`);
  }

  return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ── MTN MoMo ─────────────────────────────────────────────────────────────────

export const momoWebhookRouter = new Hono();

// POST /webhooks/momo — MoMo disbursement callback
momoWebhookRouter.post("/", async (c) => {
  const body = await c.req.json() as {
    externalId?: string;
    status?: string;
    financialTransactionId?: string;
    reason?: string;
  };

  const { externalId, status, financialTransactionId } = body;

  if (!externalId) {
    console.warn("[Webhook:MoMo] Missing externalId in callback");
    return c.json({ received: true });
  }

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.railReference, externalId),
  });

  if (!tx) {
    console.warn(`[Webhook:MoMo] No TX for externalId=${externalId}`);
    return c.json({ received: true });
  }

  if (tx.status === "settled" || tx.status === "failed") {
    return c.json({ received: true });
  }

  if (status === "SUCCESSFUL") {
    await recordSettlementStep(tx.id, "settled", {
      financialTransactionId,
      momoStatus: status,
    });
    console.log(`[Webhook:MoMo] ✓ Settled TX=${tx.id} MoMo=${financialTransactionId}`);
  } else if (status === "FAILED" || status === "REJECTED") {
    await recordSettlementStep(tx.id, "failed", {
      momoStatus: status,
      reason: body.reason,
    });
    console.error(`[Webhook:MoMo] ✗ Failed TX=${tx.id} status=${status}`);
  }
  // PENDING: no action, let the settlement poller handle it

  return c.json({ received: true });
});
