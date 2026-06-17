CREATE TYPE "public"."escrow_status" AS ENUM('pending', 'claimed', 'refunded', 'expired');--> statement-breakpoint
CREATE TYPE "public"."rail" AS ENUM('mpesa', 'momo', 'paystack', 'wave', 'orange_money', 'bank', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."settlement_schedule" AS ENUM('instant', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."token" AS ENUM('USDC', 'USDT');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('initiated', 'onchain', 'routed', 'settled', 'requires_review', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "escrow_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_phone" text NOT NULL,
	"token_address" text NOT NULL,
	"amount_usdc" numeric(20, 6) NOT NULL,
	"onchain_ref" text,
	"expires_at" timestamp NOT NULL,
	"status" "escrow_status" DEFAULT 'pending' NOT NULL,
	"claim_tx_hash" text,
	"claimed_by_wallet" text,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_payments_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_currency" text DEFAULT 'USD' NOT NULL,
	"to_currency" text NOT NULL,
	"mid_rate" numeric(20, 8) NOT NULL,
	"tuma_rate" numeric(20, 8) NOT NULL,
	"spread" numeric(5, 4) NOT NULL,
	"source" text DEFAULT 'openexchangerates' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"till_open" boolean DEFAULT false NOT NULL,
	"fee_bps" integer DEFAULT 100 NOT NULL,
	"auto_settle_to" text NOT NULL,
	"settle_rail" "rail" NOT NULL,
	"settle_schedule" "settlement_schedule" DEFAULT 'daily' NOT NULL,
	"last_settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_info" text,
	"ip_address" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settlement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"step" "transaction_status" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text,
	"sender_id" uuid,
	"recipient_phone" text NOT NULL,
	"recipient_wallet_address" text,
	"recipient_user_id" uuid,
	"amount_usdc" numeric(20, 6) NOT NULL,
	"amount_local" numeric(20, 2) NOT NULL,
	"local_currency" text NOT NULL,
	"fx_rate" numeric(20, 8) NOT NULL,
	"fx_locked_at" timestamp,
	"token" "token" DEFAULT 'USDC' NOT NULL,
	"rail" "rail" NOT NULL,
	"status" "transaction_status" DEFAULT 'initiated' NOT NULL,
	"tx_hash" text,
	"rail_reference" text,
	"note" text,
	"is_escrow" boolean DEFAULT false NOT NULL,
	"escrow_ref" text,
	"is_merchant_payment" boolean DEFAULT false NOT NULL,
	"merchant_id" uuid,
	"fee_usdc" numeric(20, 6) DEFAULT '0' NOT NULL,
	"failure_stage" text,
	"failure_reason" text,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"phone_hash" text NOT NULL,
	"country_code" text NOT NULL,
	"wallet_address" text,
	"wallet_deployed_at" timestamp,
	"is_merchant" boolean DEFAULT false NOT NULL,
	"email" text,
	"password_hash" text,
	"external_wallet_address" text,
	"external_wallet_type" text,
	"notifications_seen_at" timestamp,
	"last_crypto_scan_block" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_phone_hash_unique" UNIQUE("phone_hash"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escrow_payments" ADD CONSTRAINT "escrow_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escrow_payments" ADD CONSTRAINT "escrow_payments_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settlement_events" ADD CONSTRAINT "settlement_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_users_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escrow_ref_idx" ON "escrow_payments" USING btree ("ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escrow_status_idx" ON "escrow_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escrow_expires_at_idx" ON "escrow_payments" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fx_rates_currencies_idx" ON "fx_rates" USING btree ("from_currency","to_currency");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fx_rates_fetched_at_idx" ON "fx_rates" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchant_settings_user_id_idx" ON "merchant_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlement_events_tx_id_idx" ON "settlement_events" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_sender_id_idx" ON "transactions" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_recipient_user_id_idx" ON "transactions" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_reference_idx" ON "transactions" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_sender_id_idempotency_key_idx" ON "transactions" USING btree ("sender_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_created_at_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_phone_hash_idx" ON "users" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_wallet_address_idx" ON "users" USING btree ("wallet_address");