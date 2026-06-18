import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { settlementEvents, transactions } from "../db/schema";
import {
  enqueueRailDisburse,
  type RailDisburseJob,
} from "../lib/queue";
import { ConflictError, NotFoundError } from "../lib/errors";
import {
  processRailDisbursement,
  railProviderIdempotencyKey,
} from "./rail-disbursement";
import { recordSettlementStep } from "./settlement";

const RAIL_FAILURE_STAGES = [
  "direct_rail_disbursement",
  "claim_rail_disbursement",
  "rail_disbursement",
] as const;
const RAIL_FAILURE_STAGE_VALUES = [...RAIL_FAILURE_STAGES];

type RailFailureStage = (typeof RAIL_FAILURE_STAGES)[number];
type Transaction = typeof transactions.$inferSelect;

export type RailDeadLetterItem = {
  transactionId: string;
  reference: string;
  rail: string;
  recipientPhone: string;
  amountLocal: number;
  localCurrency: string;
  railReference: string | null;
  failureStage: string | null;
  failureReason: string | null;
  failedAt: string | null;
  providerIdempotencyKey: string;
  reviewMetadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type RailDeadLetterList = {
  items: RailDeadLetterItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
};

export type RailDeadLetterRetryResult = {
  transactionId: string;
  providerIdempotencyKey: string;
  mode: "queued" | "inline";
  railReference: string | null;
  status: "queued" | "routed" | "settled";
};

function isRailFailureStage(stage: string | null): stage is RailFailureStage {
  return RAIL_FAILURE_STAGES.includes(stage as RailFailureStage);
}

function asMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function latestRailReviewMetadata(
  transactionId: string
): Promise<Record<string, unknown> | null> {
  const events = await db.query.settlementEvents.findMany({
    where: and(
      eq(settlementEvents.transactionId, transactionId),
      eq(settlementEvents.step, "requires_review")
    ),
    orderBy: [desc(settlementEvents.createdAt)],
    limit: 10,
  });

  for (const event of events) {
    const metadata = asMetadata(event.metadata);
    if (!metadata) continue;
    const stage = typeof metadata.stage === "string" ? metadata.stage : null;
    if (isRailFailureStage(stage)) return metadata;
  }

  return asMetadata(events[0]?.metadata);
}

function metadataProviderKey(metadata: Record<string, unknown> | null): string | null {
  const value = metadata?.providerIdempotencyKey;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function buildRailJob(
  tx: Transaction,
  metadata: Record<string, unknown> | null,
  retryMetadata?: Record<string, unknown>
): RailDisburseJob {
  const failureStage = isRailFailureStage(tx.failureStage)
    ? tx.failureStage
    : "rail_disbursement";
  const providerIdempotencyKey =
    metadataProviderKey(metadata) ??
    railProviderIdempotencyKey(tx.id, failureStage);

  return {
    transactionId: tx.id,
    rail: tx.rail,
    recipientPhone: tx.recipientPhone,
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    reference: tx.reference,
    providerIdempotencyKey,
    failureStage,
    metadata: {
      ...(metadata ?? {}),
      ...(retryMetadata ?? {}),
      providerIdempotencyKey,
    },
  };
}

function toDeadLetterItem(
  tx: Transaction,
  metadata: Record<string, unknown> | null
): RailDeadLetterItem {
  const job = buildRailJob(tx, metadata);
  return {
    transactionId: tx.id,
    reference: tx.reference,
    rail: tx.rail,
    recipientPhone: tx.recipientPhone,
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    railReference: tx.railReference,
    failureStage: tx.failureStage,
    failureReason: tx.failureReason,
    failedAt: tx.failedAt?.toISOString() ?? null,
    providerIdempotencyKey: job.providerIdempotencyKey!,
    reviewMetadata: metadata,
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}

const railDeadLetterWhere = and(
  eq(transactions.status, "requires_review"),
  inArray(transactions.failureStage, RAIL_FAILURE_STAGE_VALUES)
);

export async function listRailDeadLetters(
  page: number,
  limit: number
): Promise<RailDeadLetterList> {
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db.query.transactions.findMany({
      where: railDeadLetterWhere,
      orderBy: [desc(transactions.failedAt), desc(transactions.updatedAt)],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(railDeadLetterWhere),
  ]);

  const items = await Promise.all(
    rows.map(async (tx) =>
      toDeadLetterItem(tx, await latestRailReviewMetadata(tx.id))
    )
  );
  const total = Number(countResult[0]?.count ?? 0);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function retryRailDeadLetter(
  transactionId: string,
  requestedBy: string
): Promise<RailDeadLetterRetryResult> {
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });

  if (!tx) throw new NotFoundError("Transaction");

  if (tx.railReference && (tx.status === "routed" || tx.status === "settled")) {
    throw new ConflictError("Rail payout is already routed.");
  }

  if (tx.status !== "requires_review" || !isRailFailureStage(tx.failureStage)) {
    throw new ConflictError("Transaction is not a rail dead-letter item.");
  }

  const reviewMetadata = await latestRailReviewMetadata(tx.id);
  const job = buildRailJob(tx, reviewMetadata, {
    retrySource: "ops",
    retryRequestedBy: requestedBy,
    retryRequestedAt: new Date().toISOString(),
  });

  const queued = await enqueueRailDisburse(job);
  if (queued) {
    return {
      transactionId: tx.id,
      providerIdempotencyKey: job.providerIdempotencyKey!,
      mode: "queued",
      railReference: null,
      status: "queued",
    };
  }

  try {
    const result = await processRailDisbursement(job);
    return {
      transactionId: tx.id,
      providerIdempotencyKey: job.providerIdempotencyKey!,
      mode: "inline",
      railReference: result.railReference,
      status: result.status === "settled" ? "settled" : "routed",
    };
  } catch (err) {
    await recordSettlementStep(tx.id, "requires_review", {
      ...(job.metadata ?? {}),
      stage: job.failureStage ?? "rail_disbursement",
      error: errorMessage(err),
      rail: job.rail,
      reference: job.reference,
      retrySource: "ops",
    });
    throw err;
  }
}
