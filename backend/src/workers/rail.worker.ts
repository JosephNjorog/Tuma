/**
 * Rail disbursement worker.
 * Runs as a separate Bun process: `bun run src/workers/rail.worker.ts`
 * Sends accepted on-chain transfers to the recipient's local rail.
 */

import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { transactions } from "../db/schema";
import { queueConnection, QUEUE_NAMES, type RailDisburseJob } from "../lib/queue";
import { recordSettlementStep } from "../services/settlement";
import {
  processRailDisbursement,
  railJobWithProviderIdempotency,
} from "../services/rail-disbursement";
import {
  recordHeartbeat,
  startHeartbeatLoop,
} from "../services/worker-heartbeat";

const stopHeartbeat = startHeartbeatLoop("rail.worker");

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const worker = new Worker<RailDisburseJob>(
  QUEUE_NAMES.RAIL_DISBURSE,
  async (job: Job<RailDisburseJob>) => {
    const data = railJobWithProviderIdempotency(job.data);
    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, data.transactionId),
    });

    if (!tx) {
      console.warn(`[RailWorker] TX ${data.transactionId} not found — skipping`);
      return;
    }

    if (tx.status === "settled" || tx.status === "failed" || tx.status === "expired") {
      console.log(`[RailWorker] TX ${tx.id} already terminal (${tx.status})`);
      return;
    }

    if (tx.railReference && tx.status === "routed") {
      console.log(`[RailWorker] TX ${tx.id} already routed (${tx.railReference})`);
      return;
    }

    try {
      const result = await processRailDisbursement(data);
      console.log(
        `[RailWorker] ✓ TX ${tx.id} routed via ${result.rail} ref=${result.railReference}`
      );
    } catch (err) {
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= attempts) {
        await recordSettlementStep(tx.id, "requires_review", {
          ...(data.metadata ?? {}),
          stage: data.failureStage ?? "rail_disbursement",
          error: errorMessage(err),
          rail: data.rail,
          recipientPhone: data.recipientPhone,
          amountLocal: data.amountLocal,
          localCurrency: data.localCurrency,
          reference: data.reference,
          providerIdempotencyKey: data.providerIdempotencyKey,
          bullJobId: job.id,
          attemptsMade: job.attemptsMade + 1,
          attempts,
        });
      }
      throw err;
    }
  },
  {
    connection: queueConnection,
    concurrency: 5,
  }
);

worker.on("ready", () => {
  console.log("[RailWorker] Ready — consuming rail disbursements");
  void recordHeartbeat({
    component: "rail.worker",
    kind: "worker",
    metadata: { state: "ready" },
  });
});

worker.on("failed", (job, err) => {
  console.error(`[RailWorker] Job ${job?.id} failed:`, err.message);
  void recordHeartbeat({
    component: "rail.worker",
    kind: "worker",
    status: "error",
    error: err.message,
    metadata: { jobId: job?.id },
  });
});

process.on("SIGTERM", async () => {
  stopHeartbeat();
  await worker.close();
  process.exit(0);
});
