import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { escrowPayments, transactions } from "../../src/db/schema";
import { escrowExpiryJobId, escrowQueue, railQueue } from "../../src/lib/queue";
import { publicClient } from "../../src/services/avalanche";
import { scanEscrowChainEvents } from "../../src/services/chain-event-scan";
import {
  createIntegrationUser,
  installIntegrationHooks,
} from "./harness";
import {
  bytes32,
  createEscrowPayment,
  createTransaction,
  dateOffset,
  TEST_WALLETS,
  testTxHash,
} from "./resilience-fixtures";

installIntegrationHooks();

type FakeEscrowLog = {
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
  args: Record<string, unknown>;
};

type EscrowLogsByEvent = Partial<
  Record<"Deposited" | "Claimed" | "Refunded", FakeEscrowLog[]>
>;

const originalGetBlockNumber = publicClient.getBlockNumber;
const originalGetLogs = publicClient.getLogs;

afterEach(() => {
  (publicClient as unknown as { getBlockNumber: typeof originalGetBlockNumber })
    .getBlockNumber = originalGetBlockNumber;
  (publicClient as unknown as { getLogs: typeof originalGetLogs }).getLogs =
    originalGetLogs;
});

function mockEscrowChain(logs: EscrowLogsByEvent): void {
  process.env.TUMA_ESCROW_ADDRESS = TEST_WALLETS.other;
  process.env.CHAIN_EVENT_SCAN_LOOKBACK_BLOCKS = "100";
  process.env.CHAIN_EVENT_SCAN_BATCH_BLOCKS = "100";
  process.env.CHAIN_EVENT_SCAN_CONFIRMATIONS = "2";

  (
    publicClient as unknown as {
      getBlockNumber: () => Promise<bigint>;
      getLogs: (args: { event: { name: keyof EscrowLogsByEvent } }) => Promise<FakeEscrowLog[]>;
    }
  ).getBlockNumber = async () => 20n;
  (
    publicClient as unknown as {
      getLogs: (args: { event: { name: keyof EscrowLogsByEvent } }) => Promise<FakeEscrowLog[]>;
    }
  ).getLogs = async ({ event }) => logs[event.name] ?? [];
}

describe("escrow chain-event scanner repair", () => {
  test("rebuilds a missing escrow record from a deposit event", async () => {
    const sender = await createIntegrationUser({
      phone: "+254744000001",
      walletAddress: TEST_WALLETS.sender,
    });
    const tx = await createTransaction({
      reference: "TUMA-CHAIN-DEPOSIT",
      senderId: sender.id,
      recipientPhone: "+254744000002",
      status: "requires_review",
      failureStage: "escrow_record",
      failureReason: "database unavailable before escrow insert",
      failedAt: new Date("2026-06-18T11:00:00.000Z"),
      isEscrow: true,
      escrowRef: "ESC-CHAIN-DEPOSIT",
    });
    const expiry = BigInt(Math.floor(dateOffset(2).getTime() / 1000));

    mockEscrowChain({
      Deposited: [
        {
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: testTxHash("d"),
          args: {
            claimRef: bytes32("ESC-CHAIN-DEPOSIT"),
            sender: TEST_WALLETS.sender,
            token: TEST_WALLETS.token,
            amount: 10_000_000n,
            expiry,
          },
        },
      ],
    });

    const result = await scanEscrowChainEvents();

    expect(result).toMatchObject({
      fromBlock: 1,
      toBlock: 18,
      scanned: 1,
      depositsReconciled: 1,
      failed: 0,
    });

    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, "ESC-CHAIN-DEPOSIT"),
    });
    expect(escrow).toMatchObject({
      transactionId: tx.id,
      senderId: sender.id,
      status: "pending",
      amountUsdc: "10.000000",
      onchainRef: "ESC-CHAIN-DEPOSIT",
    });

    const updatedTx = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    expect(updatedTx).toMatchObject({
      status: "onchain",
      txHash: testTxHash("d"),
      failureStage: null,
      failureReason: null,
    });

    expect(escrowQueue).not.toBeNull();
    const job = await escrowQueue!.getJob(
      escrowExpiryJobId("ESC-CHAIN-DEPOSIT")
    );
    expect(job?.data).toMatchObject({
      escrowRef: "ESC-CHAIN-DEPOSIT",
      transactionId: tx.id,
      senderWallet: TEST_WALLETS.sender,
    });
  });

  test("repairs a claimed escrow from a claim event and re-queues payout", async () => {
    const sender = await createIntegrationUser({
      phone: "+254744000003",
      walletAddress: TEST_WALLETS.sender,
    });
    const recipient = await createIntegrationUser({
      phone: "+254744000004",
      walletAddress: TEST_WALLETS.recipient,
    });
    const tx = await createTransaction({
      reference: "TUMA-CHAIN-CLAIM",
      senderId: sender.id,
      recipientPhone: recipient.phone,
      status: "onchain",
      isEscrow: true,
      escrowRef: "ESC-CHAIN-CLAIM",
    });
    await createEscrowPayment({
      ref: "ESC-CHAIN-CLAIM",
      transactionId: tx.id,
      senderId: sender.id,
      recipientPhone: recipient.phone,
    });

    mockEscrowChain({
      Claimed: [
        {
          blockNumber: 6n,
          logIndex: 0,
          transactionHash: testTxHash("e"),
          args: {
            claimRef: bytes32("ESC-CHAIN-CLAIM"),
            recipient: TEST_WALLETS.recipient,
            token: TEST_WALLETS.token,
            amount: 10_000_000n,
          },
        },
      ],
    });

    const result = await scanEscrowChainEvents();

    expect(result).toMatchObject({
      scanned: 1,
      claimsReconciled: 1,
      failed: 0,
    });

    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, "ESC-CHAIN-CLAIM"),
    });
    expect(escrow).toMatchObject({
      status: "claimed",
      claimTxHash: testTxHash("e"),
      claimedByWallet: TEST_WALLETS.recipient,
    });

    const updatedTx = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    expect(updatedTx).toMatchObject({
      status: "onchain",
      recipientUserId: recipient.id,
      recipientWalletAddress: TEST_WALLETS.recipient,
    });

    expect(railQueue).not.toBeNull();
    const jobs = await railQueue!.getJobs(["waiting", "delayed", "paused"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toMatchObject({
      transactionId: tx.id,
      failureStage: "claim_rail_disbursement",
      metadata: {
        escrowRef: "ESC-CHAIN-CLAIM",
        claimTxHash: testTxHash("e"),
      },
    });
  });

  test("repairs a refunded escrow from a refund event", async () => {
    const sender = await createIntegrationUser({
      phone: "+254744000005",
      walletAddress: TEST_WALLETS.sender,
    });
    const tx = await createTransaction({
      reference: "TUMA-CHAIN-REFUND",
      senderId: sender.id,
      status: "requires_review",
      failureStage: "escrow_refund",
      failureReason: "database unavailable after refund tx",
      failedAt: new Date("2026-06-18T12:00:00.000Z"),
      isEscrow: true,
      escrowRef: "ESC-CHAIN-REFUND",
    });
    await createEscrowPayment({
      ref: "ESC-CHAIN-REFUND",
      transactionId: tx.id,
      senderId: sender.id,
      expiresAt: dateOffset(-1),
    });

    mockEscrowChain({
      Refunded: [
        {
          blockNumber: 7n,
          logIndex: 0,
          transactionHash: testTxHash("f"),
          args: {
            claimRef: bytes32("ESC-CHAIN-REFUND"),
            sender: TEST_WALLETS.sender,
            amount: 10_000_000n,
          },
        },
      ],
    });

    const result = await scanEscrowChainEvents();

    expect(result).toMatchObject({
      scanned: 1,
      refundsReconciled: 1,
      failed: 0,
    });

    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, "ESC-CHAIN-REFUND"),
    });
    expect(escrow?.status).toBe("refunded");

    const updatedTx = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    expect(updatedTx).toMatchObject({
      status: "expired",
      failureStage: null,
      failureReason: null,
    });
  });
});
