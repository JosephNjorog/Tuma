import { describe, expect, test } from "bun:test";
import {
  railJobWithProviderIdempotency,
  railProviderIdempotencyKey,
} from "../../src/services/rail-idempotency";
import type { RailDisburseJob } from "../../src/lib/queue";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function railJob(overrides: Partial<RailDisburseJob> = {}): RailDisburseJob {
  return {
    transactionId: "tx_123",
    rail: "mpesa",
    recipientPhone: "+254712345678",
    amountLocal: 1250,
    localCurrency: "KES",
    reference: "TUMA-123",
    ...overrides,
  };
}

describe("rail idempotency helpers", () => {
  test("generates stable provider keys for the same transaction and stage", () => {
    const first = railProviderIdempotencyKey("tx_123", "rail_disbursement");
    const second = railProviderIdempotencyKey("tx_123", "rail_disbursement");

    expect(first).toBe(second);
    expect(first).toMatch(UUID_V4_RE);
  });

  test("separates provider keys by failure stage", () => {
    const initial = railProviderIdempotencyKey("tx_123", "rail_disbursement");
    const retry = railProviderIdempotencyKey("tx_123", "escrow_claim_rail");

    expect(initial).not.toBe(retry);
    expect(retry).toMatch(UUID_V4_RE);
  });

  test("adds the generated key to job data and metadata", () => {
    const withKey = railJobWithProviderIdempotency(
      railJob({ metadata: { source: "claim" } })
    );

    expect(withKey.providerIdempotencyKey).toBe(
      railProviderIdempotencyKey("tx_123")
    );
    expect(withKey.metadata).toEqual({
      source: "claim",
      providerIdempotencyKey: withKey.providerIdempotencyKey,
    });
  });

  test("preserves an existing provider key across retries", () => {
    const withKey = railJobWithProviderIdempotency(
      railJob({
        providerIdempotencyKey: "11111111-1111-4111-8111-111111111111",
        metadata: { providerIdempotencyKey: "older-key" },
      })
    );

    expect(withKey.providerIdempotencyKey).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(withKey.metadata?.providerIdempotencyKey).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
