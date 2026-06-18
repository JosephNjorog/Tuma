import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../db";
import { transactions } from "../db/schema";
import { scheduleSettlementPoll, type RailDisburseJob } from "../lib/queue";
import { recordSettlementStep } from "./settlement";
import { disburseToRail, type DisburseResult } from "./rails";

function deterministicUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 32);
  const chars = hash.split("");
  chars[12] = "4";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function railProviderIdempotencyKey(
  transactionId: string,
  failureStage = "rail_disbursement"
): string {
  return deterministicUuid(`tuma:rail:${transactionId}:${failureStage}`);
}

export function railJobWithProviderIdempotency(
  job: RailDisburseJob
): RailDisburseJob {
  const providerIdempotencyKey =
    job.providerIdempotencyKey ??
    railProviderIdempotencyKey(job.transactionId, job.failureStage);

  return {
    ...job,
    providerIdempotencyKey,
    metadata: {
      ...(job.metadata ?? {}),
      providerIdempotencyKey,
    },
  };
}

export async function processRailDisbursement(
  job: RailDisburseJob
): Promise<DisburseResult> {
  const idempotentJob = railJobWithProviderIdempotency(job);

  const result = await disburseToRail({
    recipientPhone: idempotentJob.recipientPhone,
    amountLocal: idempotentJob.amountLocal,
    localCurrency: idempotentJob.localCurrency,
    reference: idempotentJob.reference,
    providerIdempotencyKey: idempotentJob.providerIdempotencyKey!,
  });

  await db
    .update(transactions)
    .set({
      railReference: result.railReference,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, idempotentJob.transactionId));

  await recordSettlementStep(idempotentJob.transactionId, "routed", {
    ...(idempotentJob.metadata ?? {}),
    rail: result.rail,
    railReference: result.railReference,
  });

  if (result.status === "settled") {
    await recordSettlementStep(idempotentJob.transactionId, "settled", {
      ...(idempotentJob.metadata ?? {}),
      rail: result.rail,
      railReference: result.railReference,
      note: "Rail reported immediate settlement",
    });
  } else if (result.rail !== "mpesa") {
    await scheduleSettlementPoll(
      idempotentJob.transactionId,
      result.rail,
      result.railReference,
      15_000
    );
  }

  return result;
}
