/**
 * WhatsApp notification worker.
 * Consumes the WHATSAPP_NOTIFY queue so notification sends are
 * decoupled from the request path and automatically retried on failure.
 *
 * Run as: bun run src/workers/notify.worker.ts
 */

import { Worker, type Job } from "bullmq";
import { queueConnection, QUEUE_NAMES, type WhatsAppNotifyJob } from "../lib/queue";
import {
  sendOtpWhatsApp,
  sendClaimLink,
  sendReceivedNotification,
} from "../services/whatsapp";
import { recordSettlementStep } from "../services/settlement";
import {
  recordHeartbeat,
  startHeartbeatLoop,
} from "../services/worker-heartbeat";

const stopHeartbeat = startHeartbeatLoop("notify.worker");

const worker = new Worker<WhatsAppNotifyJob>(
  QUEUE_NAMES.WHATSAPP_NOTIFY,
  async (job: Job<WhatsAppNotifyJob>) => {
    const { to, templateName, params } = job.data;

    switch (templateName) {
      case "tuma_otp":
        await sendOtpWhatsApp(to, params[0]);
        break;

      case "tuma_claim_link":
        // params: [senderName, amount, currency, claimUrl]
        await sendClaimLink(to, params[0], params[1], params[2], params[3]);
        break;

      case "tuma_received":
        // params: [amount, currency, senderDisplay]
        await sendReceivedNotification(to, params[0], params[1], params[2]);
        break;

      default:
        console.warn(`[NotifyWorker] Unknown template "${templateName}" for ${to}`);
    }
  },
  {
    connection: queueConnection,
    concurrency: 10,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    },
  }
);

worker.on("ready", () => {
  console.log("[NotifyWorker] Ready — consuming WhatsApp notification queue");
  void recordHeartbeat({
    component: "notify.worker",
    kind: "worker",
    metadata: { state: "ready" },
  });
});

worker.on("completed", (job) => {
  console.log(`[NotifyWorker] ✓ Sent ${job.data.templateName} to ${job.data.to}`);
});

worker.on("failed", async (job, err) => {
  console.error(`[NotifyWorker] ✗ Job ${job?.id} failed:`, err.message);
  await recordHeartbeat({
    component: "notify.worker",
    kind: "worker",
    status: "error",
    error: err.message,
    metadata: {
      jobId: job?.id,
      templateName: job?.data.templateName,
      transactionId: job?.data.transactionId,
    },
  });

  const attempts = job?.opts.attempts ?? 1;
  if (
    job?.data.transactionId &&
    job.attemptsMade >= attempts
  ) {
    await recordSettlementStep(job.data.transactionId, "requires_review", {
      stage: job.data.failureStage ?? "whatsapp_notify",
      error: err.message,
    });
  }
});

process.on("SIGTERM", async () => {
  stopHeartbeat();
  await worker.close();
  process.exit(0);
});
