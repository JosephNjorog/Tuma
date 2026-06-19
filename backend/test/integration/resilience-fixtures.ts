import { db } from "../../src/db";
import {
  escrowPayments,
  settlementEvents,
  transactions,
} from "../../src/db/schema";

export const TEST_WALLETS = {
  sender: "0x1111111111111111111111111111111111111111",
  recipient: "0x2222222222222222222222222222222222222222",
  other: "0x3333333333333333333333333333333333333333",
  token: "0x4444444444444444444444444444444444444444",
} as const;

export function testTxHash(hexChar: string): `0x${string}` {
  return `0x${hexChar.repeat(64)}` as `0x${string}`;
}

export function bytes32(value: string): `0x${string}` {
  return `0x${Buffer.from(value, "utf8")
    .toString("hex")
    .padEnd(64, "0")
    .slice(0, 64)}` as `0x${string}`;
}

export function dateOffset(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function createTransaction(
  overrides: Partial<typeof transactions.$inferInsert> & { reference: string }
) {
  const values: typeof transactions.$inferInsert = {
    reference: overrides.reference,
    recipientPhone: "+254700000002",
    amountUsdc: "10.000000",
    amountLocal: "1290.00",
    localCurrency: "KES",
    fxRate: "129.00000000",
    rail: "mpesa",
    ...overrides,
  };

  const [tx] = await db.insert(transactions).values(values).returning();
  return tx;
}

export async function createEscrowPayment(
  overrides: Partial<typeof escrowPayments.$inferInsert> & {
    ref: string;
    transactionId: string;
    senderId: string;
  }
) {
  const values: typeof escrowPayments.$inferInsert = {
    ref: overrides.ref,
    transactionId: overrides.transactionId,
    senderId: overrides.senderId,
    recipientPhone: "+254700000002",
    tokenAddress: process.env.USDC_ADDRESS ?? TEST_WALLETS.token,
    amountUsdc: "10.000000",
    onchainRef: overrides.ref,
    expiresAt: dateOffset(7),
    ...overrides,
  };

  const [escrow] = await db.insert(escrowPayments).values(values).returning();
  return escrow;
}

export async function createSettlementEvent(
  values: typeof settlementEvents.$inferInsert
) {
  const [event] = await db.insert(settlementEvents).values(values).returning();
  return event;
}
