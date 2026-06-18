import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { escrowPayments, settlementEvents, transactions } from "../db/schema";
import {
  enqueueRailDisburse,
  type RailDisburseJob,
} from "../lib/queue";
import { delIfValue, setnxTtl } from "../lib/redis";
import { recordSettlementStep } from "./settlement";
import {
  processRailDisbursement,
  railProviderIdempotencyKey,
} from "./rail-disbursement";

export type EscrowClaimContext = {
  ref: string;
  transactionId: string;
  recipientUserId: string;
  recipientPhone: string;
  recipientWalletAddress: string;
  claimTxHash: string;
  amountUsdc: string;
  amountLocal: number;
  localCurrency: string;
  rail: string;
  reference: string;
};

export type ClaimRailHandoffResult = {
  rail: string;
  railReference: string | null;
  railQueued: boolean;
  status: "onchain" | "routed" | "settled" | "requires_review";
};

export type ClaimReconciliationResult = {
  scanned: number;
  reconciled: number;
  skipped: number;
  failed: number;
};

export type ClaimReviewReconciliation = {
  ctx: EscrowClaimContext;
  handoff: ClaimRailHandoffResult;
};

const CLAIM_REVIEW_LOCK_TTL_SECONDS = 180;

type ClaimReviewLock = {
  key: string;
  token: string;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function acquireClaimReviewLock(
  transactionId: string
): Promise<ClaimReviewLock | null> {
  const key = `lock:escrow-claim-review:${transactionId}`;
  const token = randomUUID();
  const acquired = await setnxTtl(key, CLAIM_REVIEW_LOCK_TTL_SECONDS, token);
  return acquired ? { key, token } : null;
}

async function releaseClaimReviewLock(lock: ClaimReviewLock | null): Promise<void> {
  if (!lock) return;

  try {
    await delIfValue(lock.key, lock.token);
  } catch (err) {
    console.error(
      `[EscrowClaim] Failed to release review lock ${lock.key}:`,
      errorMessage(err)
    );
  }
}

function claimMetadata(ctx: EscrowClaimContext, source: string) {
  return {
    stage: "escrow_claim_db_update",
    escrowRef: ctx.ref,
    recipientUserId: ctx.recipientUserId,
    recipientPhone: ctx.recipientPhone,
    recipientWalletAddress: ctx.recipientWalletAddress,
    claimTxHash: ctx.claimTxHash,
    amountUsdc: ctx.amountUsdc,
    amountLocal: ctx.amountLocal,
    localCurrency: ctx.localCurrency,
    rail: ctx.rail,
    reference: ctx.reference,
    source,
  };
}

function contextFromMetadata(metadata: unknown): EscrowClaimContext | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata as Record<string, unknown>;
  if (value.stage !== "escrow_claim_db_update") return null;

  const ref = value.escrowRef;
  const recipientUserId = value.recipientUserId;
  const recipientPhone = value.recipientPhone;
  const recipientWalletAddress = value.recipientWalletAddress;
  const claimTxHash = value.claimTxHash;
  const amountUsdc = value.amountUsdc;
  const amountLocal = value.amountLocal;
  const localCurrency = value.localCurrency;
  const rail = value.rail;
  const reference = value.reference;

  if (
    typeof ref !== "string" ||
    typeof recipientUserId !== "string" ||
    typeof recipientPhone !== "string" ||
    typeof recipientWalletAddress !== "string" ||
    typeof claimTxHash !== "string" ||
    typeof amountUsdc !== "string" ||
    typeof amountLocal !== "number" ||
    typeof localCurrency !== "string" ||
    typeof rail !== "string" ||
    typeof reference !== "string"
  ) {
    return null;
  }

  return {
    ref,
    transactionId: "",
    recipientUserId,
    recipientPhone,
    recipientWalletAddress,
    claimTxHash,
    amountUsdc,
    amountLocal,
    localCurrency,
    rail,
    reference,
  };
}

async function contextFromLatestClaimReview(
  transactionId: string
): Promise<EscrowClaimContext | null> {
  const event = await db.query.settlementEvents.findFirst({
    where: and(
      eq(settlementEvents.transactionId, transactionId),
      eq(settlementEvents.step, "requires_review")
    ),
    orderBy: [desc(settlementEvents.createdAt)],
  });

  const ctx = contextFromMetadata(event?.metadata);
  if (!ctx) return null;

  ctx.transactionId = transactionId;
  return ctx;
}

export async function markEscrowClaimDbUpdateRequiresReview(
  ctx: EscrowClaimContext,
  err: unknown,
  source: string
): Promise<void> {
  await recordSettlementStep(ctx.transactionId, "requires_review", {
    ...claimMetadata(ctx, source),
    error: errorMessage(err),
  });
}

export async function persistEscrowClaim(
  ctx: EscrowClaimContext,
  source: string
): Promise<void> {
  const escrow = await db.query.escrowPayments.findFirst({
    where: eq(escrowPayments.ref, ctx.ref),
  });

  if (!escrow) throw new Error(`Escrow ${ctx.ref} not found`);
  if (escrow.status === "claimed") {
    if (
      escrow.claimedByWallet &&
      escrow.claimedByWallet !== ctx.recipientWalletAddress
    ) {
      throw new Error(`Escrow ${ctx.ref} already claimed by a different wallet`);
    }

    if (
      escrow.claimTxHash &&
      escrow.claimTxHash !== ctx.claimTxHash
    ) {
      throw new Error(`Escrow ${ctx.ref} already claimed with a different tx hash`);
    }
  } else if (escrow.status !== "pending") {
    throw new Error(`Escrow ${ctx.ref} is ${escrow.status}, cannot persist claim`);
  }

  await db.transaction(async (txDb) => {
    await txDb
      .update(escrowPayments)
      .set({
        status: "claimed",
        claimTxHash: ctx.claimTxHash,
        claimedByWallet: ctx.recipientWalletAddress,
        claimedAt: escrow.claimedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(escrowPayments.ref, ctx.ref));

    await txDb
      .update(transactions)
      .set({
        recipientUserId: ctx.recipientUserId,
        recipientWalletAddress: ctx.recipientWalletAddress,
        status: "onchain",
        failureStage: null,
        failureReason: null,
        failedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, ctx.transactionId));

    await txDb.insert(settlementEvents).values({
      transactionId: ctx.transactionId,
      step: "onchain",
      metadata: {
        escrowRef: ctx.ref,
        claimedBy: ctx.recipientPhone,
        claimTxHash: ctx.claimTxHash,
        source,
      },
    });
  });
}

export function buildClaimRailJob(ctx: EscrowClaimContext): RailDisburseJob {
  return {
    transactionId: ctx.transactionId,
    rail: ctx.rail,
    recipientPhone: ctx.recipientPhone,
    amountLocal: ctx.amountLocal,
    localCurrency: ctx.localCurrency,
    reference: ctx.reference,
    providerIdempotencyKey: railProviderIdempotencyKey(
      ctx.transactionId,
      "claim_rail_disbursement"
    ),
    failureStage: "claim_rail_disbursement",
    metadata: {
      escrowRef: ctx.ref,
      claimedBy: ctx.recipientPhone,
      claimTxHash: ctx.claimTxHash,
    },
  };
}

export async function handoffClaimRailPayout(
  ctx: EscrowClaimContext
): Promise<ClaimRailHandoffResult> {
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, ctx.transactionId),
  });

  if (tx?.railReference && (tx.status === "routed" || tx.status === "settled")) {
    return {
      rail: tx.rail,
      railReference: tx.railReference,
      railQueued: false,
      status: tx.status,
    };
  }

  const railJob = buildClaimRailJob(ctx);
  const railQueued = await enqueueRailDisburse(railJob);

  if (railQueued) {
    return {
      rail: railJob.rail,
      railReference: null,
      railQueued,
      status: "onchain",
    };
  }

  const result = await processRailDisbursement(railJob);
  return {
    rail: result.rail,
    railReference: result.railReference,
    railQueued,
    status: result.status === "settled" ? "settled" : "routed",
  };
}

export async function reconcileEscrowClaim(
  ctx: EscrowClaimContext,
  source: string
): Promise<ClaimRailHandoffResult> {
  await persistEscrowClaim(ctx, source);

  try {
    return await handoffClaimRailPayout(ctx);
  } catch (err) {
    await recordSettlementStep(ctx.transactionId, "requires_review", {
      stage: "claim_rail_disbursement",
      error: errorMessage(err),
      escrowRef: ctx.ref,
      claimedBy: ctx.recipientPhone,
      claimTxHash: ctx.claimTxHash,
      source,
    });

    return {
      rail: ctx.rail,
      railReference: null,
      railQueued: false,
      status: "requires_review",
    };
  }
}

export async function reconcileEscrowClaimReview(
  transactionId: string,
  source: string
): Promise<ClaimReviewReconciliation | null> {
  const lock = await acquireClaimReviewLock(transactionId);
  if (!lock) return null;

  try {
    const ctx = await contextFromLatestClaimReview(transactionId);
    if (!ctx) return null;

    const handoff = await reconcileEscrowClaim(ctx, source);
    return { ctx, handoff };
  } finally {
    await releaseClaimReviewLock(lock);
  }
}

export async function scanEscrowClaimReconciliations(
  limit = 100
): Promise<ClaimReconciliationResult> {
  const candidates = await db.query.transactions.findMany({
    where: and(
      eq(transactions.status, "requires_review"),
      eq(transactions.failureStage, "escrow_claim_db_update")
    ),
    orderBy: [desc(transactions.failedAt), desc(transactions.createdAt)],
    limit,
  });

  const result: ClaimReconciliationResult = {
    scanned: candidates.length,
    reconciled: 0,
    skipped: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    try {
      const replay = await reconcileEscrowClaimReview(
        candidate.id,
        "claim_reconciliation_scan"
      );
      if (!replay) {
        result.skipped += 1;
        continue;
      }

      result.reconciled += 1;
    } catch (err) {
      result.failed += 1;
      console.error(
        `[EscrowClaim] Failed to reconcile claim transaction ${candidate.id}:`,
        errorMessage(err)
      );
    }
  }

  return result;
}
