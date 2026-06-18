/**
 * Escrow resilience worker.
 * Consumes delayed expiry jobs and periodically scans for expired pending
 * escrows whose delayed jobs were missed or lost. It also retries local
 * reconciliation for claims that succeeded on-chain but failed during the
 * post-chain database update, including chain-event repairs when review
 * metadata could not be written.
 */

import { Worker, type Job } from "bullmq";
import { queueConnection, QUEUE_NAMES, type EscrowExpireJob } from "../lib/queue";
import {
  markEscrowRefundRequiresReview,
  processEscrowExpiry,
  scanExpiredEscrows,
} from "../services/escrow-expiry";
import { scanEscrowClaimReconciliations } from "../services/escrow-claim";
import { scanEscrowChainEvents } from "../services/chain-event-scan";
import {
  recordHeartbeat,
  startHeartbeatLoop,
} from "../services/worker-heartbeat";

function intEnv(name: string, fallback: number): number {
  const value = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const SCAN_INTERVAL_MS = Math.max(
  intEnv("ESCROW_EXPIRY_SCAN_INTERVAL_MS", 300_000),
  30_000
);
const SCAN_LIMIT = intEnv("ESCROW_EXPIRY_SCAN_LIMIT", 100);
const stopHeartbeat = startHeartbeatLoop("escrow.worker");

let scannerRunning = false;
let claimScannerRunning = false;
let chainEventScannerRunning = false;

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
    void recordHeartbeat({
      component: "escrow.worker",
      kind: "worker",
      metadata: { state: "ready" },
    });
  });

  worker.on("failed", async (job, err) => {
    console.error(`[EscrowWorker] Job ${job?.id} failed:`, err.message);
    await recordHeartbeat({
      component: "escrow.worker",
      kind: "worker",
      status: "error",
      error: err.message,
      metadata: { jobId: job?.id, escrowRef: job?.data.escrowRef },
    });

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
    await recordHeartbeat({
      component: "scanner.expired_escrows",
      kind: "scanner",
      metadata: { state: "running", limit: SCAN_LIMIT },
    });
    const result = await scanExpiredEscrows(SCAN_LIMIT);
    await recordHeartbeat({
      component: "scanner.expired_escrows",
      kind: "scanner",
      metadata: { state: "ok", ...result },
    });
    if (result.scanned > 0) {
      console.log(
        `[EscrowWorker] Scan expired escrows: scanned=${result.scanned} enqueued=${result.enqueued} inline=${result.processedInline} skipped=${result.skipped} failed=${result.failed}`
      );
    }
  } catch (err) {
    await recordHeartbeat({
      component: "scanner.expired_escrows",
      kind: "scanner",
      status: "error",
      error: (err as Error).message,
      metadata: { state: "failed", limit: SCAN_LIMIT },
    });
    console.error("[EscrowWorker] Expired escrow scan failed:", (err as Error).message);
  } finally {
    scannerRunning = false;
  }
}

async function runClaimReconciliationScan(): Promise<void> {
  if (claimScannerRunning) return;
  claimScannerRunning = true;

  try {
    await recordHeartbeat({
      component: "scanner.claim_reconciliation",
      kind: "scanner",
      metadata: { state: "running", limit: SCAN_LIMIT },
    });
    const result = await scanEscrowClaimReconciliations(SCAN_LIMIT);
    await recordHeartbeat({
      component: "scanner.claim_reconciliation",
      kind: "scanner",
      metadata: { state: "ok", ...result },
    });
    if (result.reconciled > 0 || result.failed > 0) {
      console.log(
        `[EscrowWorker] Scan claim reconciliations: scanned=${result.scanned} reconciled=${result.reconciled} skipped=${result.skipped} failed=${result.failed}`
      );
    }
  } catch (err) {
    await recordHeartbeat({
      component: "scanner.claim_reconciliation",
      kind: "scanner",
      status: "error",
      error: (err as Error).message,
      metadata: { state: "failed", limit: SCAN_LIMIT },
    });
    console.error("[EscrowWorker] Claim reconciliation scan failed:", (err as Error).message);
  } finally {
    claimScannerRunning = false;
  }
}

async function runChainEventScan(): Promise<void> {
  if (chainEventScannerRunning) return;
  chainEventScannerRunning = true;

  try {
    await recordHeartbeat({
      component: "scanner.escrow_chain_events",
      kind: "scanner",
      metadata: { state: "running" },
    });
    const result = await scanEscrowChainEvents();
    await recordHeartbeat({
      component: "scanner.escrow_chain_events",
      kind: "scanner",
      metadata: { state: "ok", ...result },
    });
    if (
      result.scanned > 0 ||
      result.depositsReconciled > 0 ||
      result.claimsReconciled > 0 ||
      result.refundsReconciled > 0 ||
      result.failed > 0
    ) {
      console.log(
        `[EscrowWorker] Scan escrow chain events: from=${result.fromBlock ?? "-"} to=${result.toBlock ?? "-"} scanned=${result.scanned} deposits=${result.depositsReconciled} claims=${result.claimsReconciled} refunds=${result.refundsReconciled} skipped=${result.skipped} failed=${result.failed}`
      );
    }
  } catch (err) {
    await recordHeartbeat({
      component: "scanner.escrow_chain_events",
      kind: "scanner",
      status: "error",
      error: (err as Error).message,
      metadata: { state: "failed" },
    });
    console.error("[EscrowWorker] Chain event scan failed:", (err as Error).message);
  } finally {
    chainEventScannerRunning = false;
  }
}

void runExpiredEscrowScan();
void runClaimReconciliationScan();
void runChainEventScan();
const scannerTimer = setInterval(() => {
  void runExpiredEscrowScan();
  void runClaimReconciliationScan();
  void runChainEventScan();
}, SCAN_INTERVAL_MS);

process.on("SIGTERM", async () => {
  stopHeartbeat();
  clearInterval(scannerTimer);
  await worker?.close();
  process.exit(0);
});
