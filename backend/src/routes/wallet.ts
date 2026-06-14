import { Hono } from "hono";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { getWalletBalances, explorerUrl } from "../services/avalanche";
import { NotFoundError, BlockchainError } from "../lib/errors";
import type { Address } from "viem";

export const walletRouter = new Hono();
walletRouter.use("*", authMiddleware);

// GET /api/wallet
walletRouter.get("/", async (c) => {
  const { sub: userId } = c.get("user");

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User");

  if (!user.walletAddress) {
    return c.json({
      ok: true,
      data: {
        walletAddress: null,
        status: "deploying",
        message: "Your smart wallet is being deployed. Check back in a few seconds.",
      },
    });
  }

  const walletAddress = user.walletAddress as Address;
  const assets = await getWalletBalances(walletAddress);
  const totalUsd = assets.reduce((sum, a) => sum + a.balanceUsd, 0);

  return c.json({
    ok: true,
    data: {
      walletAddress: user.walletAddress,
      explorerUrl: explorerUrl(user.walletAddress),
      totalUsd: parseFloat(totalUsd.toFixed(2)),
      assets,
      network: process.env.NODE_ENV === "production" ? "Avalanche C-Chain" : "Avalanche Fuji Testnet",
    },
  });
});

// GET /api/wallet/assets
walletRouter.get("/assets", async (c) => {
  const { sub: userId } = c.get("user");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

  if (!user?.walletAddress) {
    return c.json({ ok: true, data: { assets: [], totalUsd: 0 } });
  }

  const assets = await getWalletBalances(user.walletAddress as Address);
  const totalUsd = assets.reduce((sum, a) => sum + a.balanceUsd, 0);

  return c.json({
    ok: true,
    data: { assets, totalUsd: parseFloat(totalUsd.toFixed(2)) },
  });
});
