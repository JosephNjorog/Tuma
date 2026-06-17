import { Hono } from "hono";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { NotFoundError } from "../lib/errors";

export const receiveRouter = new Hono();
receiveRouter.use("*", authMiddleware);

// GET /api/receive  ─── Returns QR payload and receive details
receiveRouter.get("/", async (c) => {
  const { sub: userId } = c.get("user");

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User");

  const qrPayload = JSON.stringify({
    type: "tuma_personal",
    phone: user.phone,
    wallet: user.walletAddress ?? null,
  });

  return c.json({
    ok: true,
    data: {
      phone: user.phone,
      walletAddress: user.walletAddress,
      qrPayload,
      // Deep link that opens Autopayke and pre-fills the recipient
      deepLink: `${process.env.APP_URL}/send?to=${encodeURIComponent(user.phone)}`,
      shareText: `Send me money on Autopayke: ${process.env.APP_URL}/send?to=${encodeURIComponent(user.phone)}`,
    },
  });
});
