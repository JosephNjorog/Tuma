/**
 * Settlement polling worker.
 * Runs as a separate Bun process: `bun run src/workers/settlement.worker.ts`
 * Polls M-Pesa / MoMo / Paystack / Wave for pending transaction status.
 */

import { Worker, type Job } from "bullmq";
import { queueConnection, QUEUE_NAMES, type SettlementPollJob } from "../lib/queue";
import { db } from "../db";
import { transactions } from "../db/schema";
import { eq } from "drizzle-orm";
import { recordSettlementStep } from "../services/settlement";
import { pollRailStatus } from "../services/rails";
import type { Rail } from "@tuma/shared";
import {
  recordHeartbeat,
  startHeartbeatLoop,
} from "../services/worker-heartbeat";

const MAX_POLL_ATTEMPTS = 20;
const stopHeartbeat = startHeartbeatLoop("settlement.worker");

const worker = new Worker<SettlementPollJob>(
  QUEUE_NAMES.SETTLEMENT_POLL,
  async (job: Job<SettlementPollJob>) => {
    const { transactionId, rail, railReference, attempt } = job.data;

    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
    });

    if (!tx) {
      console.warn(`[SettlementWorker] TX ${transactionId} not found — skipping`);
      return;
    }

    if (tx.status === "settled" || tx.status === "failed") {
      console.log(`[SettlementWorker] TX ${transactionId} already terminal (${tx.status})`);
      return;
    }

    const status = await pollRailStatus(rail as Rail, railReference);

    console.log(`[SettlementWorker] TX ${transactionId} rail=${rail} attempt=${attempt} status=${status}`);

    if (status === "settled") {
      await recordSettlementStep(transactionId, "settled", {
        rail,
        railReference,
        polledAt: new Date().toISOString(),
      });
      console.log(`[SettlementWorker] ✓ TX ${transactionId} settled`);
      return;
    }

    if (status === "failed") {
      await recordSettlementStep(transactionId, "failed", {
        rail,
        railReference,
        reason: "Rail reported failure",
      });
      console.error(`[SettlementWorker] ✗ TX ${transactionId} failed on ${rail}`);
      return;
    }

    // Still pending — job will be retried automatically by BullMQ backoff
    if (attempt >= MAX_POLL_ATTEMPTS) {
      await recordSettlementStep(transactionId, "failed", {
        reason: `Max poll attempts (${MAX_POLL_ATTEMPTS}) reached`,
      });
      return;
    }

    // Update attempt count in job data for next retry
    await job.updateData({ ...job.data, attempt: attempt + 1 });
    throw new Error("PENDING"); // triggers BullMQ retry with backoff
  },
  {
    connection: queueConnection,
    concurrency: 10,
  }
);

worker.on("failed", (job, err) => {
  if (err.message !== "PENDING") {
    console.error(`[SettlementWorker] Job ${job?.id} failed permanently:`, err.message);
    void recordHeartbeat({
      component: "settlement.worker",
      kind: "worker",
      status: "error",
      error: err.message,
      metadata: { jobId: job?.id },
    });
  }
});

worker.on("ready", () => {
  console.log("[SettlementWorker] Ready — polling settlement statuses");
  void recordHeartbeat({
    component: "settlement.worker",
    kind: "worker",
    metadata: { state: "ready" },
  });
});

process.on("SIGTERM", async () => {
  stopHeartbeat();
  await worker.close();
  process.exit(0);
});
