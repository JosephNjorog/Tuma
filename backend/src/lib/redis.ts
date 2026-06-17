import Redis from "ioredis";

// ── In-memory fallback ────────────────────────────────────────────────────────
type MemEntry = { value: string; expiresAt: number | null };
const _mem = new Map<string, MemEntry>();

function _memGet(key: string): string | null {
  const e = _mem.get(key);
  if (!e) return null;
  if (e.expiresAt !== null && Date.now() > e.expiresAt) { _mem.delete(key); return null; }
  return e.value;
}

const _memStore = {
  async get(key: string) { return _memGet(key); },
  async setex(key: string, ttl: number, value: string) {
    _mem.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  },
  async del(key: string) { _mem.delete(key); },
  async incr(key: string): Promise<number> {
    const cur = parseInt(_memGet(key) ?? "0", 10);
    const next = cur + 1;
    const existing = _mem.get(key);
    _mem.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? null });
    return next;
  },
  async expire(key: string, ttl: number) {
    const e = _mem.get(key);
    if (e) _mem.set(key, { ...e, expiresAt: Date.now() + ttl * 1000 });
  },
};

// ── Real Redis ────────────────────────────────────────────────────────────────
const redisUrl = process.env.REDIS_URL;

let _redis: Redis | null = null;
let _redisReady = false;

if (redisUrl) {
  _redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 10000,
    tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
    retryStrategy: (times) => Math.min(times * 2000, 30000), // back off up to 30s
  });

  _redis.on("ready", () => {
    _redisReady = true;
    console.log("[Redis] Connected");
  });
  _redis.on("error", () => {
    _redisReady = false;
    // suppress — retryStrategy handles reconnection with backoff
  });
  _redis.on("close", () => { _redisReady = false; });

  _redis.connect().catch(() => {
    console.warn("[Redis] Initial connect failed — using in-memory fallback");
    _redis = null;
  });
} else {
  console.warn("[Redis] REDIS_URL not set — using in-memory store");
}

// Returns the redis client if it's ready, otherwise null (falls back to memory)
function store(): Redis | null {
  return _redis && _redisReady ? _redis : null;
}

// ── Key helpers ───────────────────────────────────────────────────────────────
export const keys = {
  otp: (phone: string) => `otp:${phone}`,
  otpAttempts: (phone: string) => `otp_attempts:${phone}`,
  fxQuote: (quoteId: string) => `fx_quote:${quoteId}`,
  fxRate: (currency: string) => `fx_rate:${currency}`,
  session: (tokenHash: string) => `session:${tokenHash}`,
  rateLimit: (ip: string, route: string) => `rl:${route}:${ip}`,
  walletNonce: (address: string) => `nonce:${address}`,
};

// ── Typed helpers ─────────────────────────────────────────────────────────────
export async function setex<T>(key: string, ttlSeconds: number, value: T): Promise<void> {
  const s = store();
  const serialized = JSON.stringify(value);
  if (s) await s.setex(key, ttlSeconds, serialized);
  else await _memStore.setex(key, ttlSeconds, serialized);
}

export async function getJson<T>(key: string): Promise<T | null> {
  const s = store();
  const raw = s ? await s.get(key) : await _memStore.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function del(key: string): Promise<void> {
  const s = store();
  if (s) await s.del(key); else await _memStore.del(key);
}

export async function setnxTtl(
  key: string,
  ttlSeconds: number,
  value = "1"
): Promise<boolean> {
  const s = store();
  if (s) {
    const result = await s.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  if (_memGet(key)) return false;
  await _memStore.setex(key, ttlSeconds, value);
  return true;
}

export async function incr(key: string, ttlSeconds?: number): Promise<number> {
  const s = store();
  if (s) {
    const count = await s.incr(key);
    if (ttlSeconds && count === 1) await s.expire(key, ttlSeconds);
    return count;
  }
  const count = await _memStore.incr(key);
  if (ttlSeconds && count === 1) await _memStore.expire(key, ttlSeconds);
  return count;
}
