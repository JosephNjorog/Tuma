import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { transactions } from "../../src/db/schema";
import { escrowExpiryJobId, escrowQueue } from "../../src/lib/queue";
import { scanExpiredEscrows } from "../../src/services/escrow-expiry";
import {
  apiFetch,
  createIntegrationUser,
  installIntegrationHooks,
  opsHeaders,
} from "./harness";
import {
  createEscrowPayment,
  createTransaction,
  dateOffset,
  TEST_WALLETS,
} from "./resilience-fixtures";

installIntegrationHooks();

describe("escrow expiry and refund recovery", () => {
  test("re-enqueues an expired pending escrow with a deterministic job id", async () => {
    const sender = await createIntegrationUser({
      phone: "+254722000001",
      walletAddress: TEST_WALLETS.sender,
    });
    const tx = await createTransaction({
      reference: "TUMA-EXPIRY-SCAN",
      senderId: sender.id,
      status: "onchain",
      isEscrow: true,
      escrowRef: "ESC-EXPIRY-SCAN",
    });
    await createEscrowPayment({
      ref: "ESC-EXPIRY-SCAN",
      transactionId: tx.id,
      senderId: sender.id,
      expiresAt: dateOffset(-1),
    });

    const result = await scanExpiredEscrows(10);

    expect(result).toEqual({
      scanned: 1,
      enqueued: 1,
      processedInline: 0,
      skipped: 0,
      failed: 0,
    });

    expect(escrowQueue).not.toBeNull();
    const job = await escrowQueue!.getJob(
      escrowExpiryJobId("ESC-EXPIRY-SCAN")
    );
    expect(job?.data).toMatchObject({
      escrowRef: "ESC-EXPIRY-SCAN",
      transactionId: tx.id,
      senderWallet: TEST_WALLETS.sender,
      amountUsdc: "10.000000",
      onchainRef: "ESC-EXPIRY-SCAN",
    });
  });

  test("marks refund review when an expired escrow cannot identify the sender wallet", async () => {
    const sender = await createIntegrationUser({
      phone: "+254722000002",
      walletAddress: null,
    });
    const tx = await createTransaction({
      reference: "TUMA-EXPIRY-MISSING-WALLET",
      senderId: sender.id,
      status: "onchain",
      isEscrow: true,
      escrowRef: "ESC-EXPIRY-MISSING-WALLET",
    });
    await createEscrowPayment({
      ref: "ESC-EXPIRY-MISSING-WALLET",
      transactionId: tx.id,
      senderId: sender.id,
      expiresAt: dateOffset(-1),
    });

    const result = await scanExpiredEscrows(10);

    expect(result).toMatchObject({
      scanned: 1,
      enqueued: 0,
      failed: 1,
    });

    const updated = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    expect(updated).toMatchObject({
      status: "requires_review",
      failureStage: "escrow_refund",
    });
    expect(updated?.failureReason).toContain("Sender wallet is missing");
  });

  test("refuses an operator refund retry before the escrow is refundable", async () => {
    const sender = await createIntegrationUser({
      phone: "+254722000003",
      walletAddress: TEST_WALLETS.sender,
    });
    const tx = await createTransaction({
      reference: "TUMA-REFUND-NOT-READY",
      senderId: sender.id,
      status: "onchain",
      isEscrow: true,
      escrowRef: "ESC-REFUND-NOT-READY",
    });
    await createEscrowPayment({
      ref: "ESC-REFUND-NOT-READY",
      transactionId: tx.id,
      senderId: sender.id,
      expiresAt: dateOffset(1),
    });

    const res = await apiFetch(`/api/ops/review/${tx.id}/refund-escrow`, {
      method: "POST",
      headers: opsHeaders(),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
  });
});
