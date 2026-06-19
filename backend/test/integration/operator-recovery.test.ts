import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { transactions } from "../../src/db/schema";
import { notifyQueue } from "../../src/lib/queue";
import { publicClient } from "../../src/services/avalanche";
import {
  apiFetch,
  createIntegrationUser,
  installIntegrationHooks,
  opsHeaders,
} from "./harness";
import {
  createEscrowPayment,
  createTransaction,
  TEST_WALLETS,
  testTxHash,
} from "./resilience-fixtures";

installIntegrationHooks();

const originalGetTransactionReceipt = publicClient.getTransactionReceipt;

afterEach(() => {
  (
    publicClient as unknown as {
      getTransactionReceipt: typeof originalGetTransactionReceipt;
    }
  ).getTransactionReceipt = originalGetTransactionReceipt;
});

describe("operator recovery paths", () => {
  test("resends a failed claim link and clears claim-link review state", async () => {
    const sender = await createIntegrationUser({
      phone: "+254755000001",
      walletAddress: TEST_WALLETS.sender,
    });
    const tx = await createTransaction({
      reference: "TUMA-OPS-RESEND",
      senderId: sender.id,
      recipientPhone: "+254755000002",
      status: "requires_review",
      failureStage: "escrow_claim_link",
      failureReason: "WhatsApp provider unavailable",
      failedAt: new Date("2026-06-18T13:00:00.000Z"),
      isEscrow: true,
      escrowRef: "ESC-OPS-RESEND",
    });
    await createEscrowPayment({
      ref: "ESC-OPS-RESEND",
      transactionId: tx.id,
      senderId: sender.id,
      recipientPhone: "+254755000002",
    });

    const res = await apiFetch(
      `/api/ops/review/${tx.id}/resend-claim-link`,
      {
        method: "POST",
        headers: opsHeaders({ "X-Operator": "integration-ops" }),
      }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      transactionId: tx.id,
      escrowRef: "ESC-OPS-RESEND",
      mode: "queued",
      status: "onchain",
    });
    expect(body.data.claimUrl).toContain("/claim/ESC-OPS-RESEND");

    const updatedTx = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    expect(updatedTx).toMatchObject({
      status: "onchain",
      failureStage: null,
      failureReason: null,
    });

    expect(notifyQueue).not.toBeNull();
    const jobs = await notifyQueue!.getJobs(["waiting", "delayed", "paused"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toMatchObject({
      to: "+254755000002",
      templateName: "tuma_claim_link",
      transactionId: tx.id,
      failureStage: "escrow_claim_link",
    });
  });

  test("records an operator-confirmed chain hash while keeping review open", async () => {
    const txHash = testTxHash("9");
    const sender = await createIntegrationUser({
      phone: "+254755000003",
      walletAddress: TEST_WALLETS.sender,
    });
    const tx = await createTransaction({
      reference: "TUMA-OPS-CHAIN-HASH",
      senderId: sender.id,
      status: "requires_review",
      failureStage: "direct_onchain_transfer",
      failureReason: "API timed out before tx hash persistence",
      failedAt: new Date("2026-06-18T14:00:00.000Z"),
    });

    (
      publicClient as unknown as {
        getTransactionReceipt: typeof originalGetTransactionReceipt;
      }
    ).getTransactionReceipt = async () =>
      ({ status: "success" }) as Awaited<
        ReturnType<typeof originalGetTransactionReceipt>
      >;

    const res = await apiFetch(
      `/api/ops/review/${tx.id}/reconcile-chain-hash`,
      {
        method: "POST",
        headers: {
          ...opsHeaders({ "X-Operator": "integration-ops" }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txHash,
          note: "confirmed in explorer",
        }),
      }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      transactionId: tx.id,
      txHash,
      status: "requires_review",
      receiptStatus: "success",
      reviewStillRequired: true,
    });

    const updatedTx = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    expect(updatedTx).toMatchObject({
      txHash,
      status: "requires_review",
      failureStage: "direct_onchain_transfer",
    });
  });
});
