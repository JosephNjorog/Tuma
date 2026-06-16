import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { users, sessions } from "../db/schema";
import { eq } from "drizzle-orm";
import { SendOtpSchema, VerifyOtpSchema } from "@tuma/shared";
import { generateOtp, hashPhone, hashToken } from "../lib/crypto";
import { setex, getJson, del, incr, keys } from "../lib/redis";
import { sendOtpSms } from "../services/sms";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
} from "../lib/auth";
import {
  deploySmartWallet,
  getSmartWalletAddress,
  registerWalletOnChain,
  sponsorWallet,
} from "../services/avalanche";
import { otpSendLimiter, otpVerifyLimiter } from "../middleware/rateLimit";
import { AuthError, ValidationError } from "../lib/errors";

const OTP_TTL = 300; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;

export const authRouter = new Hono();

// POST /api/auth/send-otp
authRouter.post("/send-otp", otpSendLimiter, zValidator("json", SendOtpSchema), async (c) => {
  const { phone } = c.req.valid("json");

  // Guard: max 3 sends per phone per 5 min (separate from IP limit)
  const sendCount = await incr(`otp_send:${phone}`, OTP_TTL);
  if (sendCount > 3) {
    throw new ValidationError("Too many OTP requests for this number. Try again in 5 minutes.");
  }

  const otp = generateOtp();
  await setex(keys.otp(phone), OTP_TTL, { otp, attempts: 0 });

  await sendOtpSms(phone, otp);

  return c.json({ ok: true, data: { message: "OTP sent via SMS", expiresIn: OTP_TTL } });
});

// POST /api/auth/verify-otp
authRouter.post("/verify-otp", otpVerifyLimiter, zValidator("json", VerifyOtpSchema), async (c) => {
  const { phone, code } = c.req.valid("json");

  const stored = await getJson<{ otp: string; attempts: number }>(keys.otp(phone));

  if (!stored) {
    throw new ValidationError("OTP expired or not found. Request a new one.");
  }

  if (stored.attempts >= OTP_MAX_ATTEMPTS) {
    await del(keys.otp(phone));
    throw new ValidationError("Too many incorrect attempts. Request a new OTP.");
  }

  if (stored.otp !== code) {
    await setex(keys.otp(phone), OTP_TTL, { ...stored, attempts: stored.attempts + 1 });
    throw new ValidationError(`Incorrect OTP. ${OTP_MAX_ATTEMPTS - stored.attempts - 1} attempts remaining.`);
  }

  // OTP correct — invalidate it immediately
  await del(keys.otp(phone));

  const phoneHash = hashPhone(phone);
  const countryCode = detectCountryCode(phone);

  // Find or create user
  let user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  const isNewUser = !user;

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({ phone, phoneHash, countryCode })
      .returning();
    user = created;
  }

  // Deploy smart wallet for new users (non-blocking — we return immediately)
  let walletAddress = user.walletAddress;
  if (isNewUser && !walletAddress) {
    deploySmartWallet(phoneHash)
      .then(async (addr) => {
        await db
          .update(users)
          .set({ walletAddress: addr, walletDeployedAt: new Date() })
          .where(eq(users.id, user!.id));

        // Register in the on-chain phone-hash → wallet registry
        await registerWalletOnChain(phoneHash, addr);

        // Enable gas sponsorship so the user pays zero network fees
        await sponsorWallet(addr);
      })
      .catch((err) => {
        console.error(`[Auth] Wallet deploy failed for ${user!.id}:`, err.message);
      });
  }

  // Issue tokens
  const { token: refreshToken, jti } = await signRefreshToken(user.id);
  const accessToken = await signAccessToken({
    sub: user.id,
    phone: user.phone,
    walletAddress: user.walletAddress,
    isMerchant: user.isMerchant,
  });

  // Persist hashed refresh token
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId: user.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    ipAddress: c.req.header("x-forwarded-for") ?? null,
    expiresAt,
  });

  return c.json({
    ok: true,
    data: {
      isNewUser,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        walletAddress: user.walletAddress,
        isMerchant: user.isMerchant,
      },
    },
  });
});

// POST /api/auth/refresh
authRouter.post(
  "/refresh",
  zValidator("json", z.object({ refreshToken: z.string() })),
  async (c) => {
    const { refreshToken } = c.req.valid("json");

    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      throw new AuthError("Invalid or expired refresh token");
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.refreshTokenHash, tokenHash),
    });

    if (!session || session.expiresAt < new Date()) {
      throw new AuthError("Session expired. Please log in again.");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.sub),
    });
    if (!user) throw new AuthError("User not found");

    const accessToken = await signAccessToken({
      sub: user.id,
      phone: user.phone,
      walletAddress: user.walletAddress,
      isMerchant: user.isMerchant,
    });

    return c.json({ ok: true, data: { accessToken } });
  }
);

// POST /api/auth/logout
authRouter.post(
  "/logout",
  zValidator("json", z.object({ refreshToken: z.string() })),
  async (c) => {
    const { refreshToken } = c.req.valid("json");
    const tokenHash = hashRefreshToken(refreshToken);
    await db.delete(sessions).where(eq(sessions.refreshTokenHash, tokenHash));
    return c.json({ ok: true, data: { message: "Logged out" } });
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectCountryCode(phone: string): string {
  const map: Record<string, string> = {
    "+254": "KE",
    "+233": "GH",
    "+234": "NG",
    "+221": "SN",
    "+225": "CI",
    "+255": "TZ",
    "+256": "UG",
  };
  for (const [prefix, code] of Object.entries(map)) {
    if (phone.startsWith(prefix)) return code;
  }
  return "XX";
}
