import { db } from "../db";
import { transactions, settlementEvents } from "../db/schema";
import { eq } from "drizzle-orm";
import { scheduleSettlementPoll } from "../lib/queue";
import type { TransactionStatus, SettlementStep } from "@tuma/shared";

const STEP_META: Record<TransactionStatus, { label: string; description: string }> = {
  initiated: {
    label: "Initiated",
    description: "Signed and broadcast to Avalanche",
  },
  onchain: {
    label: "On-chain confirmed",
    description: "Avalanche finality achieved (~1.2s)",
  },
  routed: {
    label: "Routed to rail",
    description: "Handed off to local payment network",
  },
  settled: {
    label: "Settled",
    description: "Credited to recipient's mobile money or bank",
  },
  requires_review: {
    label: "Needs review",
    description: "The outcome is unclear and needs operator review",
  },
  failed: {
    label: "Failed",
    description: "Transaction could not be completed",
  },
  expired: {
    label: "Expired",
    description: "Unclaimed payment returned to sender",
  },
};

const STATUS_ORDER: TransactionStatus[] = [
  "initiated",
  "onchain",
  "routed",
  "settled",
];

export async function recordSettlementStep(
  transactionId: string,
  step: TransactionStatus,
  metadata?: Record<string, unknown>
): Promise<void> {
  const needsAttention = step === "failed" || step === "requires_review";
  const failureStage = typeof metadata?.stage === "string" ? metadata.stage : undefined;
  const failureReason =
    typeof metadata?.reason === "string"
      ? metadata.reason
      : typeof metadata?.error === "string"
        ? metadata.error
        : undefined;

  await Promise.all([
    db.insert(settlementEvents).values({
      transactionId,
      step,
      metadata: metadata ?? null,
    }),
    db
      .update(transactions)
      .set({
        status: step,
        updatedAt: new Date(),
        ...(needsAttention
          ? {
              failureStage: failureStage ?? null,
              failureReason: failureReason ?? null,
              failedAt: new Date(),
            }
          : {
              failureStage: null,
              failureReason: null,
              failedAt: null,
            }),
        ...(step === "settled" ? { settledAt: new Date() } : {}),
      })
      .where(eq(transactions.id, transactionId)),
  ]);
}

export async function getSettlementTimeline(
  transactionId: string
): Promise<SettlementStep[]> {
  const events = await db.query.settlementEvents.findMany({
    where: eq(settlementEvents.transactionId, transactionId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  const doneSteps = new Set(events.map((e) => e.step));

  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });

  const currentStatus = tx?.status ?? "initiated";
  const isTerminal = currentStatus === "failed" || currentStatus === "expired";

  return STATUS_ORDER.map((step) => {
    const event = events.find((e) => e.step === step);
    return {
      step,
      label: STEP_META[step].label,
      description: STEP_META[step].description,
      timestamp: event?.createdAt?.toISOString() ?? null,
      done: doneSteps.has(step),
    };
  });
}

/** Kicks off the full settlement flow after an on-chain transfer is confirmed. */
export async function startSettlementFlow(
  transactionId: string,
  txHash: string,
  rail: string,
  railReference: string
): Promise<void> {
  // Mark on-chain confirmed
  await recordSettlementStep(transactionId, "onchain", { txHash });

  // Update transaction with tx hash and rail reference
  await db
    .update(transactions)
    .set({ txHash, railReference, updatedAt: new Date() })
    .where(eq(transactions.id, transactionId));

  // Mark routed
  await recordSettlementStep(transactionId, "routed", { rail, railReference });

  // Enqueue polling job for settlement confirmation
  if (rail !== "mpesa") {
    // M-Pesa uses webhooks; others need polling
    await scheduleSettlementPoll(transactionId, rail, railReference, 15_000);
  }
}
