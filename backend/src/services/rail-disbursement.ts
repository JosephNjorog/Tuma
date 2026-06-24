import { eq } from "drizzle-orm";
import { db } from "../db";
import { transactions } from "../db/schema";
import { scheduleSettlementPoll, type RailDisburseJob } from "../lib/queue";
import { recordSettlementStep } from "./settlement";
import { disburseToRail, type DisburseResult } from "./rails";
import { railJobWithProviderIdempotency } from "./rail-idempotency";

export { railProviderIdempotencyKey, railJobWithProviderIdempotency } from "./rail-idempotency";

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
  } else {
    // All rails now disburse via Paystack — poll for settlement on all of them.
    // Paystack webhooks (transfer.success) are the primary signal; polling is the backstop.
    await scheduleSettlementPoll(
      idempotentJob.transactionId,
      result.rail,
      result.railReference,
      15_000
    );
  }

  return result;
}
