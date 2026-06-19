import { afterAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import IORedis from "ioredis";
import { db } from "../../src/db";
import { users } from "../../src/db/schema";
import { signAccessToken } from "../../src/lib/auth";
import { hashPhone } from "../../src/lib/crypto";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "OPERATIONS_API_TOKEN",
  "WALLET_DERIVE_SECRET",
] as const;

let redis: IORedis | null = null;
let redisReady: Promise<void> | null = null;
let appPromise: Promise<typeof import("../../src/app").default> | null = null;

export function requireIntegrationEnv(): void {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing integration test environment variables: ${missing.join(", ")}`
    );
  }
}

export async function resetDatabase(): Promise<void> {
  await db.execute(sql`
    truncate table
      worker_heartbeats,
      settlement_events,
      escrow_payments,
      merchant_settings,
      sessions,
      transactions,
      fx_rates,
      chain_scan_cursors,
      users
    restart identity cascade
  `);
}

function redisClient(): IORedis {
  if (!redis || redis.status === "end" || redis.status === "close") {
    redisReady = null;
    redis = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      tls: process.env.REDIS_URL!.startsWith("rediss://") ? {} : undefined,
    });
  }
  return redis;
}

async function waitForRedisReady(client: IORedis): Promise<void> {
  if (client.status === "ready") return;
  if (!redisReady) {
    redisReady = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Redis did not become ready for integration tests"));
      }, 5_000);

      function cleanup() {
        clearTimeout(timeout);
        client.off("ready", onReady);
        client.off("error", onError);
      }

      function onReady() {
        cleanup();
        resolve();
      }

      function onError(err: Error) {
        cleanup();
        redisReady = null;
        reject(err);
      }

      client.once("ready", onReady);
      client.once("error", onError);
    });
  }
  await redisReady;
}

export async function resetRedis(): Promise<void> {
  const client = redisClient();
  await waitForRedisReady(client);
  await client.flushdb();
}

export function installIntegrationHooks(): void {
  requireIntegrationEnv();

  beforeEach(async () => {
    await resetRedis();
    await resetDatabase();
  });

  afterAll(async () => {
    const client = redis;
    redis = null;
    redisReady = null;
    await client?.quit();
  });
}

export function opsHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    "X-Operations-Token": process.env.OPERATIONS_API_TOKEN!,
    "X-Operator": "integration-test",
    ...extra,
  };
}

async function appInstance() {
  appPromise ??= import("../../src/app").then((module) => module.default);
  return appPromise;
}

export type IntegrationUser = typeof users.$inferSelect;

export async function createIntegrationUser({
  phone,
  countryCode = "KE",
  walletAddress = null,
  isMerchant = false,
}: {
  phone: string;
  countryCode?: string;
  walletAddress?: string | null;
  isMerchant?: boolean;
}): Promise<IntegrationUser> {
  const [user] = await db
    .insert(users)
    .values({
      phone,
      phoneHash: hashPhone(phone),
      countryCode,
      walletAddress,
      isMerchant,
    })
    .returning();

  return user;
}

export async function authHeadersFor(
  user: IntegrationUser,
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await signAccessToken({
    sub: user.id,
    phone: user.phone,
    walletAddress: user.walletAddress,
    isMerchant: user.isMerchant,
  });

  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const app = await appInstance();
  return app.fetch(new Request(`http://localhost${path}`, init));
}
