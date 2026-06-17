import { Hono } from "hono";
import { db } from "../db";
import { transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { getSettlementTimeline } from "../services/settlement";
import { reconcilePaystackFunding } from "./fund";
import { NotFoundError, AuthError } from "../lib/errors";
import { explorerUrl } from "../services/avalanche";

export const trackRouter = new Hono();
trackRouter.use("*", authMiddleware);

// GET /api/track/:id
trackRouter.get("/:id", async (c) => {
  const { id } = c.req.param();
  const { sub: userId } = c.get("user");

  let tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });

  if (!tx) throw new NotFoundError("Transaction");

  // Only sender or recipient can view
  if (tx.senderId !== userId && tx.recipientUserId !== userId) {
    throw new AuthError("Access denied");
  }

  // Backstop for missed/delayed Paystack webhooks — check directly with
  // Paystack on every poll while a funding transaction is still pending, so
  // it resolves within a poll cycle or two instead of waiting indefinitely
  // on a webhook that may never arrive.
  if (tx.status === "initiated" && tx.rail === "paystack") {
    await reconcilePaystackFunding(tx.id);
    tx = (await db.query.transactions.findFirst({ where: eq(transactions.id, id) })) ?? tx;
  }

  const timeline = await getSettlementTimeline(id);

  return c.json({
    ok: true,
    data: {
      transaction: {
        id: tx.id,
        reference: tx.reference,
        amountUsd: parseFloat(tx.amountUsdc),
        amountLocal: parseFloat(tx.amountLocal),
        localCurrency: tx.localCurrency,
        fxRate: parseFloat(tx.fxRate),
        token: tx.token,
        rail: tx.rail,
        status: tx.status,
        txHash: tx.txHash,
        txExplorerUrl: tx.txHash ? explorerUrl(tx.txHash) : null,
        railReference: tx.railReference,
        note: tx.note,
        failureStage: tx.failureStage,
        failureReason: tx.failureReason,
        failedAt: tx.failedAt?.toISOString() ?? null,
        isEscrow: tx.isEscrow,
        escrowRef: tx.escrowRef,
        recipientPhone: tx.recipientPhone,
        createdAt: tx.createdAt.toISOString(),
        settledAt: tx.settledAt?.toISOString() ?? null,
      },
      timeline,
    },
  });
});
