export type HeartbeatKind = "worker" | "scanner";
export type HeartbeatStatus = "ok" | "error";

export type HeartbeatDefinition = {
  component: string;
  kind: HeartbeatKind;
  staleAfterSeconds: number;
};

export type HeartbeatStatusRow = {
  component: string;
  kind: string;
  status: string;
  staleAfterSeconds: number;
  lastHeartbeatAt: Date;
  lastStartedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  metadata: unknown;
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

export type HeartbeatRecordInput = {
  component: string;
  kind: HeartbeatKind;
  status?: HeartbeatStatus;
  staleAfterSeconds?: number;
  started?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

function intEnv(name: string, fallback: number): number {
  const value = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function workerStaleAfterSeconds(): number {
  return intEnv("WORKER_HEARTBEAT_STALE_SECONDS", 120);
}

export function scannerStaleAfterSeconds(): number {
  return intEnv("SCANNER_HEARTBEAT_STALE_SECONDS", 900);
}

export function heartbeatIntervalMs(): number {
  return Math.max(intEnv("WORKER_HEARTBEAT_INTERVAL_MS", 30_000), 5_000);
}

export function expectedHeartbeats(): HeartbeatDefinition[] {
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

function rowStatus(row: HeartbeatStatusRow): "ok" | "error" {
  return row.status === "error" ? "error" : "ok";
}

function rowIsStale(row: HeartbeatStatusRow, now: Date): boolean {
  const ageSeconds = Math.floor(
    (now.getTime() - row.lastHeartbeatAt.getTime()) / 1000
  );
  return row.status === "error" || ageSeconds > row.staleAfterSeconds;
}

function rowToItem(row: HeartbeatStatusRow, now: Date): HeartbeatStatusItem {
  const ageSeconds = Math.floor(
    (now.getTime() - row.lastHeartbeatAt.getTime()) / 1000
  );

  return {
    component: row.component,
    kind: row.kind,
    status: rowStatus(row),
    stale: rowIsStale(row, now),
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

export function buildHeartbeatStatusReport(
  rows: HeartbeatStatusRow[],
  staleOnly = false,
  now = new Date()
): HeartbeatStatusReport {
  const rowsByComponent = new Map(rows.map((row) => [row.component, row]));
  const seen = new Set<string>();

  const items = expectedHeartbeats().map((def) => {
    seen.add(def.component);
    const row = rowsByComponent.get(def.component);
    if (row) return rowToItem(row, now);

    return {
      component: def.component,
      kind: def.kind,
      status: "missing" as const,
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
  });

  for (const row of rows) {
    if (!seen.has(row.component)) items.push(rowToItem(row, now));
  }

  const filtered = staleOnly ? items.filter((item) => item.stale) : items;

  return {
    generatedAt: now.toISOString(),
    staleCount: items.filter((item) => item.stale).length,
    items: filtered.sort((a, b) => a.component.localeCompare(b.component)),
  };
}
