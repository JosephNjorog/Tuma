CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
	"component" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"stale_after_seconds" integer NOT NULL,
	"last_heartbeat_at" timestamp NOT NULL,
	"last_started_at" timestamp,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chain_scan_cursors" ALTER COLUMN "last_scanned_block" SET DEFAULT 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_heartbeats_status_idx" ON "worker_heartbeats" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_heartbeats_last_heartbeat_idx" ON "worker_heartbeats" USING btree ("last_heartbeat_at");