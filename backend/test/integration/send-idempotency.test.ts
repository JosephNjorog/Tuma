import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { transactions } from "../../src/db/schema";
import { setnxTtl } from "../../src/lib/redis";
import {
  apiFetch,
  authHeadersFor,
  createIntegrationUser,
  installIntegrationHooks,
} from "./harness";
import {
  createTransaction,
  TEST_WALLETS,
  testTxHash,
} from "./resilience-fixtures";

installIntegrationHooks();

function sendBody(idempotencyKey: string) {
  return {
    quoteId: randomUUID(),
    recipientPhone: "+254700000002",
    amountUsd: 10,
    token: "USDC",
    idempotencyKey,
  };
}

describe("send idempotency resilience", () => {
  test("replays an existing transaction for the same sender and idempotency key", async () => {
    const sender = await createIntegrationUser({
      phone: "+254700000001",
      walletAddress: TEST_WALLETS.sender,
    });
    const idempotencyKey = "send-idem-replay-1";
    const existing = await createTransaction({
      reference: "TUMA-SEND-REPLAY",
      idempotencyKey,
      senderId: sender.id,
      txHash: testTxHash("a"),
      status: "onchain",
    });

    const res = await apiFetch("/api/send", {
      method: "POST",
      headers: {
        ...(await authHeadersFor(sender)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody(idempotencyKey)),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      transactionId: existing.id,
      reference: "TUMA-SEND-REPLAY",
      idempotentReplay: true,
      status: "onchain",
    });

    const txRows = await db.query.transactions.findMany({
      where: eq(transactions.senderId, sender.id),
    });
    expect(txRows).toHaveLength(1);
  });

  test("rejects an in-flight duplicate before consuming quote or touching chain", async () => {
    const sender = await createIntegrationUser({
      phone: "+254700000003",
      walletAddress: TEST_WALLETS.sender,
    });
    const idempotencyKey = "send-idem-lock-1";
    await setnxTtl(`idem:send:${sender.id}:${idempotencyKey}`, 120);

    const res = await apiFetch("/api/send", {
      method: "POST",
      headers: {
        ...(await authHeadersFor(sender)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody(idempotencyKey)),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });

    const txRows = await db.query.transactions.findMany({
      where: eq(transactions.senderId, sender.id),
    });
    expect(txRows).toHaveLength(0);
  });
});
