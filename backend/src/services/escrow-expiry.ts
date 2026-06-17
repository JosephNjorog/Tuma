import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../db";
import { escrowPayments, transactions, users } from "../db/schema";
import {
  scheduleEscrowExpiry,
  type EscrowExpireJob,
} from "../lib/queue";
import { refundEscrowOnChain } from "./avalanche";
import { recordSettlementStep } from "./settlement";

type ExpiredEscrowScanRow = {
  escrowRef: string;
  transactionId: string;
  senderWallet: string | null;
  amountUsdc: string;
  onchainRef: string | null;
  expiresAt: Date;
  transactionStatus: string | null;
  failureStage: string | null;
};

export type ExpiredEscrowScanResult = {
  scanned: number;
  enqueued: number;
  processedInline: number;
  skipped: number;
  failed: number;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildExpiryJob(row: ExpiredEscrowScanRow): EscrowExpireJob | null {
  if (!row.senderWallet) return null;

  return {
    escrowRef: row.escrowRef,
    transactionId: row.transactionId,
    senderWallet: row.senderWallet,
    amountUsdc: row.amountUsdc,
    onchainRef: row.onchainRef ?? row.escrowRef,
  };
}

export async function markEscrowRefundRequiresReview(
  job: EscrowExpireJob,
  err: unknown,
  source: string
): Promise<void> {
  await recordSettlementStep(job.transactionId, "requires_review", {
    stage: "escrow_refund",
    error: errorMessage(err),
    escrowRef: job.escrowRef,
    onchainRef: job.onchainRef,
    source,
  });
}

export async function processEscrowExpiry(
  job: EscrowExpireJob,
  source = "queue"
): Promise<"refunded" | "skipped"> {
  const escrow = await db.query.escrowPayments.findFirst({
    where: eq(escrowPayments.ref, job.escrowRef),
  });

  if (!escrow) {
    console.warn(`[EscrowExpiry] ${job.escrowRef} not found - skipping`);
    return "skipped";
  }

  if (escrow.status !== "pending") {
    console.log(`[EscrowExpiry] ${job.escrowRef} already ${escrow.status} - skipping`);
    return "skipped";
  }

  if (new Date() < escrow.expiresAt) {
    console.warn(`[EscrowExpiry] ${job.escrowRef} not expired yet - skipping`);
    return "skipped";
  }

  const onchainRef = job.onchainRef || escrow.onchainRef || escrow.ref;
  const refundTxHash = await refundEscrowOnChain(onchainRef);

  await db
    .update(escrowPayments)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(eq(escrowPayments.ref, escrow.ref));

  await recordSettlementStep(escrow.transactionId, "expired", {
    reason: "Unclaimed after expiry window",
    refundTxHash,
    refundedTo: job.senderWallet,
    escrowRef: escrow.ref,
    onchainRef,
    source,
  });

  return "refunded";
}

export async function scanExpiredEscrows(
  limit = 100
): Promise<ExpiredEscrowScanResult> {
  const rows = await db
    .select({
      escrowRef: escrowPayments.ref,
      transactionId: escrowPayments.transactionId,
      senderWallet: users.walletAddress,
      amountUsdc: escrowPayments.amountUsdc,
      onchainRef: escrowPayments.onchainRef,
      expiresAt: escrowPayments.expiresAt,
      transactionStatus: transactions.status,
      failureStage: transactions.failureStage,
    })
    .from(escrowPayments)
    .innerJoin(users, eq(escrowPayments.senderId, users.id))
    .innerJoin(transactions, eq(escrowPayments.transactionId, transactions.id))
    .where(
      and(
        eq(escrowPayments.status, "pending"),
        lte(escrowPayments.expiresAt, new Date())
      )
    )
    .orderBy(asc(escrowPayments.expiresAt))
    .limit(limit);

  const result: ExpiredEscrowScanResult = {
    scanned: rows.length,
    enqueued: 0,
    processedInline: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of rows) {
    if (
      row.transactionStatus === "requires_review" &&
      row.failureStage === "escrow_refund"
    ) {
      result.skipped += 1;
      continue;
    }

    const job = buildExpiryJob(row);
    if (!job) {
      result.failed += 1;
      await recordSettlementStep(row.transactionId, "requires_review", {
        stage: "escrow_refund",
        reason: "Sender wallet is missing; cannot refund expired escrow",
        escrowRef: row.escrowRef,
        onchainRef: row.onchainRef ?? row.escrowRef,
        source: "scanner",
      });
      continue;
    }

    let enqueued = false;
    try {
      enqueued = await scheduleEscrowExpiry(job, new Date());
    } catch (err) {
      console.error(
        `[EscrowExpiry] Failed to enqueue ${job.escrowRef}; falling back inline:`,
        errorMessage(err)
      );
    }

    if (enqueued) {
      result.enqueued += 1;
      continue;
    }

    try {
      const status = await processEscrowExpiry(job, "scanner_inline");
      if (status === "refunded") result.processedInline += 1;
      else result.skipped += 1;
    } catch (err) {
      result.failed += 1;
      await markEscrowRefundRequiresReview(job, err, "scanner_inline");
    }
  }

  return result;
}
