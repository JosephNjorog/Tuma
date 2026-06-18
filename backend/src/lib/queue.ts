import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

// Queues are disabled when REDIS_URL is absent (demo/in-memory mode).
// Jobs enqueued without a connection are silently dropped.
const connection = redisUrl
  ? new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    })
  : null;

if (connection) {
  connection.on("error", () => {
    // Suppress — ioredis retries in background
  });
}

// ── Queue names ───────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  SETTLEMENT_POLL: "settlement_poll",
  ESCROW_EXPIRE: "escrow_expire",
  RAIL_DISBURSE: "rail_disburse",
  WHATSAPP_NOTIFY: "whatsapp_notify",
} as const;

// ── Job payload types ─────────────────────────────────────────────────────────

export type SettlementPollJob = {
  transactionId: string;
  rail: string;
  railReference: string;
  attempt: number;
};

export type EscrowExpireJob = {
  escrowRef: string;
  transactionId: string;
  senderWallet: string;
  amountUsdc: string;
  onchainRef: string;
};

export type RailDisburseJob = {
  transactionId: string;
  rail: string;
  recipientPhone: string;
  amountLocal: number;
  localCurrency: string;
  reference: string;
  providerIdempotencyKey?: string;
  failureStage?: string;
  metadata?: Record<string, unknown>;
};

export type WhatsAppNotifyJob = {
  to: string;
  templateName: string;
  params: string[];
  transactionId?: string;
  failureStage?: string;
};

type SettlementPollJobName = "poll";
type EscrowExpireJobName = "expire";
type RailDisburseJobName = "disburse";
type WhatsAppNotifyJobName = "notify";

// ── Queue instances ───────────────────────────────────────────────────────────

export const queueConnection = connection;
export const queueConnectionOptions = connection as unknown as ConnectionOptions | null;
const queueOpts = queueConnectionOptions ? { connection: queueConnectionOptions } : null;

export const settlementQueue = queueOpts
  ? new Queue<SettlementPollJob, unknown, SettlementPollJobName>(QUEUE_NAMES.SETTLEMENT_POLL, queueOpts)
  : null;
export const escrowQueue = queueOpts
  ? new Queue<EscrowExpireJob, unknown, EscrowExpireJobName>(QUEUE_NAMES.ESCROW_EXPIRE, queueOpts)
  : null;
export const railQueue = queueOpts
  ? new Queue<RailDisburseJob, unknown, RailDisburseJobName>(QUEUE_NAMES.RAIL_DISBURSE, queueOpts)
  : null;
export const notifyQueue = queueOpts
  ? new Queue<WhatsAppNotifyJob, unknown, WhatsAppNotifyJobName>(QUEUE_NAMES.WHATSAPP_NOTIFY, queueOpts)
  : null;

// ── Scheduling helpers ────────────────────────────────────────────────────────

export async function scheduleSettlementPoll(
  transactionId: string,
  rail: string,
  railReference: string,
  delayMs = 10_000
): Promise<boolean> {
  if (!settlementQueue) return false;
  await settlementQueue.add(
    "poll",
    { transactionId, rail, railReference, attempt: 0 },
    { delay: delayMs, attempts: 20, backoff: { type: "exponential", delay: 10_000 } }
  );
  return true;
}

export async function scheduleEscrowExpiry(
  job: EscrowExpireJob,
  expiresAt: Date
): Promise<boolean> {
  if (!escrowQueue) return false;
  const delay = expiresAt.getTime() - Date.now();
  await escrowQueue.add("expire", job, {
    jobId: `escrow-expire:${job.escrowRef}`,
    delay: Math.max(delay, 0),
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: true,
  });
  return true;
}

export async function enqueueRailDisburse(job: RailDisburseJob): Promise<boolean> {
  if (!railQueue) return false;
  await railQueue.add("disburse", job, {
    attempts: 3,
    backoff: { type: "fixed", delay: 30_000 },
  });
  return true;
}

export async function enqueueWhatsAppNotify(job: WhatsAppNotifyJob): Promise<boolean> {
  if (!notifyQueue) return false;
  await notifyQueue.add("notify", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  });
  return true;
}
