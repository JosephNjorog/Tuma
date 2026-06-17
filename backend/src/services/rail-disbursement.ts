import { eq } from "drizzle-orm";
import { db } from "../db";
import { transactions } from "../db/schema";
import { scheduleSettlementPoll, type RailDisburseJob } from "../lib/queue";
import { recordSettlementStep } from "./settlement";
import { disburseToRail, type DisburseResult } from "./rails";

export async function processRailDisbursement(
  job: RailDisburseJob
): Promise<DisburseResult> {
  const result = await disburseToRail({
    recipientPhone: job.recipientPhone,
    amountLocal: job.amountLocal,
    localCurrency: job.localCurrency,
    reference: job.reference,
  });

  await db
    .update(transactions)
    .set({
      railReference: result.railReference,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, job.transactionId));

  await recordSettlementStep(job.transactionId, "routed", {
    ...(job.metadata ?? {}),
    rail: result.rail,
    railReference: result.railReference,
  });

  if (result.status === "settled") {
    await recordSettlementStep(job.transactionId, "settled", {
      ...(job.metadata ?? {}),
      rail: result.rail,
      railReference: result.railReference,
      note: "Rail reported immediate settlement",
    });
  } else if (result.rail !== "mpesa") {
    await scheduleSettlementPoll(
      job.transactionId,
      result.rail,
      result.railReference,
      15_000
    );
  }

  return result;
}
