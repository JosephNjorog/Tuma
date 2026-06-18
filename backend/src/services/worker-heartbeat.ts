import { db } from "../db";
import { workerHeartbeats } from "../db/schema";

type HeartbeatKind = "worker" | "scanner";
type HeartbeatStatus = "ok" | "error";

type HeartbeatDefinition = {
  component: string;
  kind: HeartbeatKind;
  staleAfterSeconds: number;
};

type HeartbeatRecordInput = {
  component: string;
  kind: HeartbeatKind;
  status?: HeartbeatStatus;
  staleAfterSeconds?: number;
  started?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type HeartbeatStatusItem = {
  component: string;
  kind: string;
  status: "ok" | "error" | "missing";
  stale: boolean;
  staleAfterSeconds: number;
  ageSeconds: number | null;
  lastHeartbeatAt: string | null;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  metadata: Record<string, unknown> | null;
};

export type HeartbeatStatusReport = {
  generatedAt: string;
  staleCount: number;
  items: HeartbeatStatusItem[];
};

function intEnv(name: string, fallback: number): number {
  const value = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function workerStaleAfterSeconds(): number {
  return intEnv("WORKER_HEARTBEAT_STALE_SECONDS", 120);
}

function scannerStaleAfterSeconds(): number {
  return intEnv("SCANNER_HEARTBEAT_STALE_SECONDS", 900);
}

function heartbeatIntervalMs(): number {
  return Math.max(intEnv("WORKER_HEARTBEAT_INTERVAL_MS", 30_000), 5_000);
}

function expectedHeartbeats(): HeartbeatDefinition[] {
  return [
    {
      component: "settlement.worker",
      kind: "worker",
      staleAfterSeconds: workerStaleAfterSeconds(),
    },
    {
      component: "rail.worker",
      kind: "worker",
      staleAfterSeconds: workerStaleAfterSeconds(),
    },
    {
      component: "notify.worker",
      kind: "worker",
      staleAfterSeconds: workerStaleAfterSeconds(),
    },
    {
      component: "escrow.worker",
      kind: "worker",
      staleAfterSeconds: workerStaleAfterSeconds(),
    },
    {
      component: "scanner.expired_escrows",
      kind: "scanner",
      staleAfterSeconds: scannerStaleAfterSeconds(),
    },
    {
      component: "scanner.claim_reconciliation",
      kind: "scanner",
      staleAfterSeconds: scannerStaleAfterSeconds(),
    },
    {
      component: "scanner.escrow_chain_events",
      kind: "scanner",
      staleAfterSeconds: scannerStaleAfterSeconds(),
    },
  ];
}

function asMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function recordHeartbeat(
  input: HeartbeatRecordInput
): Promise<void> {
  const now = new Date();
  const status = input.status ?? "ok";
  const staleAfterSeconds =
    input.staleAfterSeconds ??
    (input.kind === "scanner"
      ? scannerStaleAfterSeconds()
      : workerStaleAfterSeconds());
  const lastError = status === "error" ? input.error ?? null : null;

  try {
    await db
      .insert(workerHeartbeats)
      .values({
        component: input.component,
        kind: input.kind,
        status,
        staleAfterSeconds,
        lastHeartbeatAt: now,
        lastStartedAt: input.started ? now : null,
        lastSuccessAt: status === "ok" ? now : null,
        lastFailureAt: status === "error" ? now : null,
        lastError,
        metadata: input.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: workerHeartbeats.component,
        set: {
          kind: input.kind,
          status,
          staleAfterSeconds,
          lastHeartbeatAt: now,
          ...(input.started ? { lastStartedAt: now } : {}),
          ...(status === "ok" ? { lastSuccessAt: now } : {}),
          ...(status === "error" ? { lastFailureAt: now } : {}),
          lastError,
          metadata: input.metadata ?? null,
          updatedAt: now,
        },
      });
  } catch (err) {
    console.error(
      `[Heartbeat] Failed to record ${input.component}:`,
      errorMessage(err)
    );
  }
}

export function startHeartbeatLoop(
  component: string,
  kind: HeartbeatKind = "worker",
  metadata?: Record<string, unknown>
): () => void {
  void recordHeartbeat({
    component,
    kind,
    started: true,
    metadata: { ...(metadata ?? {}), state: "started" },
  });

  const timer = setInterval(() => {
    void recordHeartbeat({
      component,
      kind,
      metadata: { ...(metadata ?? {}), state: "alive" },
    });
  }, heartbeatIntervalMs());

  return () => clearInterval(timer);
}

export async function listHeartbeatStatus(
  staleOnly = false
): Promise<HeartbeatStatusReport> {
  const now = new Date();
  const rows = await db.query.workerHeartbeats.findMany();
  const rowsByComponent = new Map(rows.map((row) => [row.component, row]));
  const seen = new Set<string>();

  function toItem(def: HeartbeatDefinition): HeartbeatStatusItem {
    seen.add(def.component);
    const row = rowsByComponent.get(def.component);
    if (!row) {
      return {
        component: def.component,
        kind: def.kind,
        status: "missing",
        stale: true,
        staleAfterSeconds: def.staleAfterSeconds,
        ageSeconds: null,
        lastHeartbeatAt: null,
        lastStartedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
        metadata: null,
      };
    }

    const ageSeconds = Math.floor(
      (now.getTime() - row.lastHeartbeatAt.getTime()) / 1000
    );
    const stale =
      row.status === "error" || ageSeconds > row.staleAfterSeconds;

    return {
      component: row.component,
      kind: row.kind,
      status: row.status === "error" ? "error" : "ok",
      stale,
      staleAfterSeconds: row.staleAfterSeconds,
      ageSeconds,
      lastHeartbeatAt: row.lastHeartbeatAt.toISOString(),
      lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
      lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
      lastError: row.lastError,
      metadata: asMetadata(row.metadata),
    };
  }

  const items = expectedHeartbeats().map(toItem);
  for (const row of rows) {
    if (seen.has(row.component)) continue;
    const ageSeconds = Math.floor(
      (now.getTime() - row.lastHeartbeatAt.getTime()) / 1000
    );
    const stale =
      row.status === "error" || ageSeconds > row.staleAfterSeconds;
    items.push({
      component: row.component,
      kind: row.kind,
      status: row.status === "error" ? "error" : "ok",
      stale,
      staleAfterSeconds: row.staleAfterSeconds,
      ageSeconds,
      lastHeartbeatAt: row.lastHeartbeatAt.toISOString(),
      lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
      lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
      lastError: row.lastError,
      metadata: asMetadata(row.metadata),
    });
  }

  const filtered = staleOnly ? items.filter((item) => item.stale) : items;

  return {
    generatedAt: now.toISOString(),
    staleCount: items.filter((item) => item.stale).length,
    items: filtered.sort((a, b) => a.component.localeCompare(b.component)),
  };
}
