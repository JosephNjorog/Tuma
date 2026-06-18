/**
 * Escrow resilience worker.
 * Consumes delayed expiry jobs and periodically scans for expired pending
 * escrows whose delayed jobs were missed or lost. It also retries local
 * reconciliation for claims that succeeded on-chain but failed during the
 * post-chain database update.
 */

import { Worker, type Job } from "bullmq";
import { queueConnection, QUEUE_NAMES, type EscrowExpireJob } from "../lib/queue";
import {
  markEscrowRefundRequiresReview,
  processEscrowExpiry,
  scanExpiredEscrows,
} from "../services/escrow-expiry";
import { scanEscrowClaimReconciliations } from "../services/escrow-claim";

function intEnv(name: string, fallback: number): number {
  const value = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const SCAN_INTERVAL_MS = Math.max(
  intEnv("ESCROW_EXPIRY_SCAN_INTERVAL_MS", 300_000),
  30_000
);
const SCAN_LIMIT = intEnv("ESCROW_EXPIRY_SCAN_LIMIT", 100);

let scannerRunning = false;
let claimScannerRunning = false;

const worker = queueConnection
  ? new Worker<EscrowExpireJob>(
      QUEUE_NAMES.ESCROW_EXPIRE,
      async (job: Job<EscrowExpireJob>) => {
        const status = await processEscrowExpiry(job.data);
        if (status === "refunded") {
          console.log(
            `[EscrowWorker] ✓ Refunded ${job.data.amountUsdc} USDC to ${job.data.senderWallet} for ${job.data.escrowRef}`
          );
        }
      },
      {
        connection: queueConnection,
        concurrency: 5,
      }
    )
  : null;

if (worker) {
  worker.on("ready", () => {
    console.log("[EscrowWorker] Ready — monitoring escrow expiries");
  });

  worker.on("failed", async (job, err) => {
    console.error(`[EscrowWorker] Job ${job?.id} failed:`, err.message);

    const attempts = job?.opts.attempts ?? 1;
    if (job && job.attemptsMade >= attempts) {
      await markEscrowRefundRequiresReview(job.data, err, "queue");
    }
  });
} else {
  console.warn("[EscrowWorker] REDIS_URL not set — scanner will process expiries inline");
}

async function runExpiredEscrowScan(): Promise<void> {
  if (scannerRunning) return;
  scannerRunning = true;

  try {
    const result = await scanExpiredEscrows(SCAN_LIMIT);
    if (result.scanned > 0) {
      console.log(
        `[EscrowWorker] Scan expired escrows: scanned=${result.scanned} enqueued=${result.enqueued} inline=${result.processedInline} skipped=${result.skipped} failed=${result.failed}`
      );
    }
  } catch (err) {
    console.error("[EscrowWorker] Expired escrow scan failed:", (err as Error).message);
  } finally {
    scannerRunning = false;
  }
}

async function runClaimReconciliationScan(): Promise<void> {
  if (claimScannerRunning) return;
  claimScannerRunning = true;

  try {
    const result = await scanEscrowClaimReconciliations(SCAN_LIMIT);
    if (result.reconciled > 0 || result.failed > 0) {
      console.log(
        `[EscrowWorker] Scan claim reconciliations: scanned=${result.scanned} reconciled=${result.reconciled} skipped=${result.skipped} failed=${result.failed}`
      );
    }
  } catch (err) {
    console.error("[EscrowWorker] Claim reconciliation scan failed:", (err as Error).message);
  } finally {
    claimScannerRunning = false;
  }
}

void runExpiredEscrowScan();
void runClaimReconciliationScan();
const scannerTimer = setInterval(() => {
  void runExpiredEscrowScan();
  void runClaimReconciliationScan();
}, SCAN_INTERVAL_MS);

process.on("SIGTERM", async () => {
  clearInterval(scannerTimer);
  await worker?.close();
  process.exit(0);
});
