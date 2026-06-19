import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { escrowPayments } from "../../src/db/schema";
import { setnxTtl } from "../../src/lib/redis";
import {
  apiFetch,
  authHeadersFor,
  createIntegrationUser,
  installIntegrationHooks,
} from "./harness";
import {
  createEscrowPayment,
  createTransaction,
  TEST_WALLETS,
  testTxHash,
} from "./resilience-fixtures";

installIntegrationHooks();

describe("claim idempotency resilience", () => {
  test("replays an already-claimed escrow for the same recipient wallet", async () => {
    const sender = await createIntegrationUser({
      phone: "+254711000001",
      walletAddress: TEST_WALLETS.sender,
    });
    const recipient = await createIntegrationUser({
      phone: "+254711000002",
      walletAddress: TEST_WALLETS.recipient,
    });
    const tx = await createTransaction({
      reference: "TUMA-CLAIM-REPLAY",
      senderId: sender.id,
      recipientPhone: recipient.phone,
      recipientUserId: recipient.id,
      recipientWalletAddress: recipient.walletAddress,
      status: "routed",
      isEscrow: true,
      escrowRef: "ESC-CLAIM-REPLAY",
      railReference: "MPESA-CLAIM-REPLAY",
    });
    await createEscrowPayment({
      ref: "ESC-CLAIM-REPLAY",
      transactionId: tx.id,
      senderId: sender.id,
      recipientPhone: recipient.phone,
      status: "claimed",
      claimTxHash: testTxHash("b"),
      claimedByWallet: recipient.walletAddress,
      claimedAt: new Date(),
    });

    const res = await apiFetch("/api/claim", {
      method: "POST",
      headers: {
        ...(await authHeadersFor(recipient)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "ESC-CLAIM-REPLAY" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      ref: "ESC-CLAIM-REPLAY",
      transactionId: tx.id,
      claimTxHash: testTxHash("b"),
      railReference: "MPESA-CLAIM-REPLAY",
      status: "routed",
      message: "Payment already claimed.",
    });
  });

  test("rejects a concurrent claim tap while the escrow claim lock is held", async () => {
    const sender = await createIntegrationUser({
      phone: "+254711000003",
      walletAddress: TEST_WALLETS.sender,
    });
    const recipient = await createIntegrationUser({
      phone: "+254711000004",
      walletAddress: TEST_WALLETS.recipient,
    });
    const tx = await createTransaction({
      reference: "TUMA-CLAIM-LOCK",
      senderId: sender.id,
      recipientPhone: recipient.phone,
      status: "onchain",
      isEscrow: true,
      escrowRef: "ESC-CLAIM-LOCK",
    });
    await createEscrowPayment({
      ref: "ESC-CLAIM-LOCK",
      transactionId: tx.id,
      senderId: sender.id,
      recipientPhone: recipient.phone,
    });
    await setnxTtl("lock:escrow-claim:ESC-CLAIM-LOCK", 180, "held-by-test");

    const res = await apiFetch("/api/claim", {
      method: "POST",
      headers: {
        ...(await authHeadersFor(recipient)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "ESC-CLAIM-LOCK" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });

    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, "ESC-CLAIM-LOCK"),
    });
    expect(escrow?.status).toBe("pending");
    expect(escrow?.claimTxHash).toBeNull();
  });
});
