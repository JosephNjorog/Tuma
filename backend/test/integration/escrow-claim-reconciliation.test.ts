import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { escrowPayments, transactions } from "../../src/db/schema";
import { railQueue } from "../../src/lib/queue";
import { scanEscrowClaimReconciliations } from "../../src/services/escrow-claim";
import {
  createIntegrationUser,
  installIntegrationHooks,
} from "./harness";
import {
  createEscrowPayment,
  createSettlementEvent,
  createTransaction,
  TEST_WALLETS,
  testTxHash,
} from "./resilience-fixtures";

installIntegrationHooks();

describe("escrow claim DB reconciliation", () => {
  test("replays claim review metadata and re-queues the rail payout", async () => {
    const sender = await createIntegrationUser({
      phone: "+254733000001",
      walletAddress: TEST_WALLETS.sender,
    });
    const recipient = await createIntegrationUser({
      phone: "+254733000002",
      walletAddress: TEST_WALLETS.recipient,
    });
    const tx = await createTransaction({
      reference: "TUMA-CLAIM-DB-REPAIR",
      senderId: sender.id,
      recipientPhone: recipient.phone,
      status: "requires_review",
      failureStage: "escrow_claim_db_update",
      failureReason: "database unavailable after claim tx",
      failedAt: new Date("2026-06-18T10:00:00.000Z"),
      isEscrow: true,
      escrowRef: "ESC-CLAIM-DB-REPAIR",
    });
    await createEscrowPayment({
      ref: "ESC-CLAIM-DB-REPAIR",
      transactionId: tx.id,
      senderId: sender.id,
      recipientPhone: recipient.phone,
    });
    await createSettlementEvent({
      transactionId: tx.id,
      step: "requires_review",
      metadata: {
        stage: "escrow_claim_db_update",
        escrowRef: "ESC-CLAIM-DB-REPAIR",
        recipientUserId: recipient.id,
        recipientPhone: recipient.phone,
        recipientWalletAddress: recipient.walletAddress,
        claimTxHash: testTxHash("c"),
        amountUsdc: "10.000000",
        amountLocal: 1290,
        localCurrency: "KES",
        rail: "mpesa",
        reference: "TUMA-CLAIM-DB-REPAIR",
        source: "integration-test",
      },
    });

    const result = await scanEscrowClaimReconciliations(10);

    expect(result).toEqual({
      scanned: 1,
      reconciled: 1,
      skipped: 0,
      failed: 0,
    });

    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, "ESC-CLAIM-DB-REPAIR"),
    });
    expect(escrow).toMatchObject({
      status: "claimed",
      claimTxHash: testTxHash("c"),
      claimedByWallet: TEST_WALLETS.recipient,
    });

    const updatedTx = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    expect(updatedTx).toMatchObject({
      recipientUserId: recipient.id,
      recipientWalletAddress: TEST_WALLETS.recipient,
      status: "onchain",
      failureStage: null,
      failureReason: null,
    });

    expect(railQueue).not.toBeNull();
    const jobs = await railQueue!.getJobs(["waiting", "delayed", "paused"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toMatchObject({
      transactionId: tx.id,
      rail: "mpesa",
      recipientPhone: recipient.phone,
      amountLocal: 1290,
      localCurrency: "KES",
      reference: "TUMA-CLAIM-DB-REPAIR",
      failureStage: "claim_rail_disbursement",
      metadata: {
        escrowRef: "ESC-CLAIM-DB-REPAIR",
        claimTxHash: testTxHash("c"),
      },
    });
    expect(typeof jobs[0]?.data.providerIdempotencyKey).toBe("string");
  });
});
