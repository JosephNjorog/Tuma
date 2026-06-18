import { afterEach, describe, expect, test } from "bun:test";
import {
  buildHeartbeatStatusReport,
  expectedHeartbeats,
  heartbeatIntervalMs,
  workerStaleAfterSeconds,
  type HeartbeatStatusRow,
} from "../../src/services/heartbeat-status";

const ORIGINAL_WORKER_STALE = process.env.WORKER_HEARTBEAT_STALE_SECONDS;
const ORIGINAL_SCANNER_STALE = process.env.SCANNER_HEARTBEAT_STALE_SECONDS;
const ORIGINAL_INTERVAL = process.env.WORKER_HEARTBEAT_INTERVAL_MS;

function restoreEnv() {
  if (ORIGINAL_WORKER_STALE === undefined) {
    delete process.env.WORKER_HEARTBEAT_STALE_SECONDS;
  } else {
    process.env.WORKER_HEARTBEAT_STALE_SECONDS = ORIGINAL_WORKER_STALE;
  }

  if (ORIGINAL_SCANNER_STALE === undefined) {
    delete process.env.SCANNER_HEARTBEAT_STALE_SECONDS;
  } else {
    process.env.SCANNER_HEARTBEAT_STALE_SECONDS = ORIGINAL_SCANNER_STALE;
  }

  if (ORIGINAL_INTERVAL === undefined) {
    delete process.env.WORKER_HEARTBEAT_INTERVAL_MS;
  } else {
    process.env.WORKER_HEARTBEAT_INTERVAL_MS = ORIGINAL_INTERVAL;
  }
}

function heartbeatRow(
  overrides: Partial<HeartbeatStatusRow> = {}
): HeartbeatStatusRow {
  const lastHeartbeatAt =
    overrides.lastHeartbeatAt ?? new Date("2026-06-18T09:59:30.000Z");

  return {
    component: "settlement.worker",
    kind: "worker",
    status: "ok",
    staleAfterSeconds: 120,
    lastHeartbeatAt,
    lastStartedAt: null,
    lastSuccessAt: lastHeartbeatAt,
    lastFailureAt: null,
    lastError: null,
    metadata: { state: "alive" },
    ...overrides,
  };
}

describe("heartbeat status helpers", () => {
  afterEach(restoreEnv);

  test("uses env overrides with a minimum heartbeat interval", () => {
    process.env.WORKER_HEARTBEAT_STALE_SECONDS = "45";
    process.env.SCANNER_HEARTBEAT_STALE_SECONDS = "600";
    process.env.WORKER_HEARTBEAT_INTERVAL_MS = "1000";

    expect(workerStaleAfterSeconds()).toBe(45);
    expect(heartbeatIntervalMs()).toBe(5000);
    expect(
      expectedHeartbeats().find((item) => item.component === "rail.worker")
        ?.staleAfterSeconds
    ).toBe(45);
    expect(
      expectedHeartbeats().find(
        (item) => item.component === "scanner.escrow_chain_events"
      )?.staleAfterSeconds
    ).toBe(600);
  });

  test("marks missing expected components as stale", () => {
    const report = buildHeartbeatStatusReport(
      [heartbeatRow()],
      false,
      new Date("2026-06-18T10:00:00.000Z")
    );

    const settlement = report.items.find(
      (item) => item.component === "settlement.worker"
    );
    const rail = report.items.find((item) => item.component === "rail.worker");

    expect(settlement?.status).toBe("ok");
    expect(settlement?.stale).toBe(false);
    expect(settlement?.ageSeconds).toBe(30);
    expect(rail?.status).toBe("missing");
    expect(rail?.stale).toBe(true);
    expect(report.staleCount).toBeGreaterThanOrEqual(1);
  });

  test("treats error rows and old rows as stale", () => {
    const now = new Date("2026-06-18T10:00:00.000Z");
    const report = buildHeartbeatStatusReport(
      [
        heartbeatRow({
          component: "rail.worker",
          status: "error",
          lastError: "queue failed",
        }),
        heartbeatRow({
          component: "custom.scanner",
          kind: "scanner",
          staleAfterSeconds: 10,
          lastHeartbeatAt: new Date("2026-06-18T09:59:00.000Z"),
        }),
      ],
      true,
      now
    );

    expect(report.items.some((item) => item.component === "rail.worker")).toBe(
      true
    );
    expect(
      report.items.some((item) => item.component === "custom.scanner")
    ).toBe(true);
    expect(report.items.every((item) => item.stale)).toBe(true);
  });
});
