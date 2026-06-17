import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  integer,
  bigint,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const transactionStatusEnum = pgEnum("transaction_status", [
  "initiated",
  "onchain",
  "routed",
  "settled",
  "requires_review",
  "failed",
  "expired",
]);

export const railEnum = pgEnum("rail", [
  "mpesa",
  "momo",
  "paystack",
  "wave",
  "orange_money",
  "bank",
  "crypto",
]);

export const tokenEnum = pgEnum("token", ["USDC", "USDT"]);

export const settlementScheduleEnum = pgEnum("settlement_schedule", [
  "instant",
  "daily",
  "weekly",
]);

export const escrowStatusEnum = pgEnum("escrow_status", [
  "pending",
  "claimed",
  "refunded",
  "expired",
]);

// ── Users ─────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stored encrypted at rest; used only inside the backend
    phone: text("phone").notNull().unique(),
    // keccak256(phone) — written to the on-chain registry
    phoneHash: text("phone_hash").notNull().unique(),
    countryCode: text("country_code").notNull(),
    walletAddress: text("wallet_address").unique(),
    walletDeployedAt: timestamp("wallet_deployed_at"),
    isMerchant: boolean("is_merchant").default(false).notNull(),
    email: text("email").unique(),
    passwordHash: text("password_hash"),
    externalWalletAddress: text("external_wallet_address"),
    externalWalletType: text("external_wallet_type"),
    // Notifications dated before this are considered read.
    notificationsSeenAt: timestamp("notifications_seen_at"),
    // Last Avalanche block scanned for incoming USDC/USDT transfers — lets
    // crypto deposits made outside the app (sent directly to the wallet
    // address) get backfilled into transaction history.
    lastCryptoScanBlock: bigint("last_crypto_scan_block", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("users_phone_hash_idx").on(t.phoneHash),
    index("users_wallet_address_idx").on(t.walletAddress),
  ]
);

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Stored as SHA-256 hash; never store raw refresh tokens
    refreshTokenHash: text("refresh_token_hash").notNull().unique(),
    deviceInfo: text("device_info"),
    ipAddress: text("ip_address"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)]
);

// ── FX Rates ──────────────────────────────────────────────────────────────────

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromCurrency: text("from_currency").notNull().default("USD"),
    toCurrency: text("to_currency").notNull(),
    midRate: numeric("mid_rate", { precision: 20, scale: 8 }).notNull(),
    tumaRate: numeric("tuma_rate", { precision: 20, scale: 8 }).notNull(),
    spread: numeric("spread", { precision: 5, scale: 4 }).notNull(),
    source: text("source").notNull().default("openexchangerates"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => [
    index("fx_rates_currencies_idx").on(t.fromCurrency, t.toCurrency),
    index("fx_rates_fetched_at_idx").on(t.fetchedAt),
  ]
);

// ── Transactions ──────────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    idempotencyKey: text("idempotency_key"),
    senderId: uuid("sender_id").references(() => users.id),
    recipientPhone: text("recipient_phone").notNull(),
    recipientWalletAddress: text("recipient_wallet_address"),
    recipientUserId: uuid("recipient_user_id").references(() => users.id),
    amountUsdc: numeric("amount_usdc", { precision: 20, scale: 6 }).notNull(),
    amountLocal: numeric("amount_local", { precision: 20, scale: 2 }).notNull(),
    localCurrency: text("local_currency").notNull(),
    fxRate: numeric("fx_rate", { precision: 20, scale: 8 }).notNull(),
    fxLockedAt: timestamp("fx_locked_at"),
    token: tokenEnum("token").notNull().default("USDC"),
    rail: railEnum("rail").notNull(),
    status: transactionStatusEnum("status").notNull().default("initiated"),
    txHash: text("tx_hash"),
    railReference: text("rail_reference"),
    note: text("note"),
    isEscrow: boolean("is_escrow").default(false).notNull(),
    escrowRef: text("escrow_ref"),
    isMerchantPayment: boolean("is_merchant_payment").default(false).notNull(),
    merchantId: uuid("merchant_id").references(() => users.id),
    feeUsdc: numeric("fee_usdc", { precision: 20, scale: 6 }).default("0").notNull(),
    failureStage: text("failure_stage"),
    failureReason: text("failure_reason"),
    failedAt: timestamp("failed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    settledAt: timestamp("settled_at"),
  },
  (t) => [
    index("transactions_sender_id_idx").on(t.senderId),
    index("transactions_recipient_user_id_idx").on(t.recipientUserId),
    index("transactions_status_idx").on(t.status),
    index("transactions_reference_idx").on(t.reference),
    uniqueIndex("transactions_sender_id_idempotency_key_idx").on(t.senderId, t.idempotencyKey),
    index("transactions_created_at_idx").on(t.createdAt),
  ]
);

// ── Settlement Events ─────────────────────────────────────────────────────────

export const settlementEvents = pgTable(
  "settlement_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    step: transactionStatusEnum("step").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("settlement_events_tx_id_idx").on(t.transactionId)]
);

// ── Escrow Payments ───────────────────────────────────────────────────────────

export const escrowPayments = pgTable(
  "escrow_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull().unique(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    recipientPhone: text("recipient_phone").notNull(),
    tokenAddress: text("token_address").notNull(),
    amountUsdc: numeric("amount_usdc", { precision: 20, scale: 6 }).notNull(),
    onchainRef: text("onchain_ref"),
    expiresAt: timestamp("expires_at").notNull(),
    status: escrowStatusEnum("status").notNull().default("pending"),
    claimTxHash: text("claim_tx_hash"),
    claimedByWallet: text("claimed_by_wallet"),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("escrow_ref_idx").on(t.ref),
    index("escrow_status_idx").on(t.status),
    index("escrow_expires_at_idx").on(t.expiresAt),
  ]
);

// ── Merchant Settings ─────────────────────────────────────────────────────────

export const merchantSettings = pgTable(
  "merchant_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    tillOpen: boolean("till_open").default(false).notNull(),
    // TUMA's settlement fee on merchant volume (basis points, 100 = 1.00%).
    // Not exposed in the merchant-facing settings API — platform-controlled.
    feeBps: integer("fee_bps").default(100).notNull(),
    autoSettleTo: text("auto_settle_to").notNull(),
    settleRail: railEnum("settle_rail").notNull(),
    settleSchedule: settlementScheduleEnum("settle_schedule")
      .notNull()
      .default("daily"),
    lastSettledAt: timestamp("last_settled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("merchant_settings_user_id_idx").on(t.userId)]
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  sentTransactions: many(transactions, { relationName: "sender" }),
  receivedTransactions: many(transactions, { relationName: "recipient" }),
  merchantSettings: one(merchantSettings, {
    fields: [users.id],
    references: [merchantSettings.userId],
  }),
}));

export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    sender: one(users, {
      fields: [transactions.senderId],
      references: [users.id],
      relationName: "sender",
    }),
    recipient: one(users, {
      fields: [transactions.recipientUserId],
      references: [users.id],
      relationName: "recipient",
    }),
    settlementEvents: many(settlementEvents),
    escrowPayment: one(escrowPayments, {
      fields: [transactions.id],
      references: [escrowPayments.transactionId],
    }),
  })
);

export const escrowPaymentsRelations = relations(escrowPayments, ({ one }) => ({
  transaction: one(transactions, {
    fields: [escrowPayments.transactionId],
    references: [transactions.id],
  }),
  sender: one(users, {
    fields: [escrowPayments.senderId],
    references: [users.id],
  }),
}));

export const settlementEventsRelations = relations(
  settlementEvents,
  ({ one }) => ({
    transaction: one(transactions, {
      fields: [settlementEvents.transactionId],
      references: [transactions.id],
    }),
  })
);
