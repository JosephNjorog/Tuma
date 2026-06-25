/**
 * Lightweight startup migrator.
 *
 * Drizzle Kit's migrate command requires a direct (non-pooled) connection,
 * which isn't always available in production environments. This module applies
 * any outstanding DDL statements via the existing app connection pool instead.
 *
 * Each entry is idempotent (IF NOT EXISTS / IF EXISTS guards) so it is safe to
 * run on every cold start.
 */

import { sql } from "drizzle-orm";
import { db } from "./index";

const MIGRATIONS: { name: string; up: string }[] = [
  {
    name: "0004_terms_consent",
    up: `
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp,
        ADD COLUMN IF NOT EXISTS "terms_accepted_ip" text,
        ADD COLUMN IF NOT EXISTS "terms_version"     text
    `,
  },
];

export async function runStartupMigrations(): Promise<void> {
  for (const migration of MIGRATIONS) {
    try {
      await db.execute(sql.raw(migration.up));
      console.log(`[migrate] ✓ ${migration.name}`);
    } catch (err) {
      // Column already exists is fine — anything else is a real error
      const msg = (err as Error).message ?? "";
      if (msg.includes("already exists")) {
        console.log(`[migrate] ↩ ${migration.name} (already applied)`);
      } else {
        console.error(`[migrate] ✗ ${migration.name}:`, msg);
        throw err;
      }
    }
  }
}
