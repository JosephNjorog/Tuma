import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { getWalletBalances, explorerUrl } from "../services/avalanche";
import { backfillCryptoDeposits } from "../services/deposit-scan";
import { NotFoundError } from "../lib/errors";
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
        externalWalletAddress: user.externalWalletAddress,
        externalWalletType: user.externalWalletType,
      },
    });
  }

  const walletAddress = user.walletAddress as Address;
  await backfillCryptoDeposits(userId, walletAddress);
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
      externalWalletAddress: user.externalWalletAddress,
      externalWalletType: user.externalWalletType,
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

// POST /api/wallet/connect — link an external wallet (MetaMask / WalletConnect / Core)
walletRouter.post(
  "/connect",
  zValidator(
    "json",
    z.object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
      walletType: z.enum(["walletconnect", "injected", "coinbase"]).optional().default("walletconnect"),
    })
  ),
  async (c) => {
    const { sub: userId } = c.get("user");
    const { address, walletType } = c.req.valid("json");

    await db
      .update(users)
      .set({ externalWalletAddress: address, externalWalletType: walletType, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return c.json({ ok: true, data: { address, walletType } });
  }
);

// DELETE /api/wallet/connect — disconnect external wallet
walletRouter.delete("/connect", async (c) => {
  const { sub: userId } = c.get("user");
  await db
    .update(users)
    .set({ externalWalletAddress: null, externalWalletType: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return c.json({ ok: true });
});

// GET /api/wallet/balances/:address — read live on-chain balances for any address
walletRouter.get("/balances/:address", async (c) => {
  const { address } = c.req.param();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return c.json({ ok: false, error: "Invalid address" }, 400);
  }
  const assets = await getWalletBalances(address as Address);
  const totalUsd = assets.reduce((sum, a) => sum + a.balanceUsd, 0);
  return c.json({
    ok: true,
    data: {
      address,
      explorerUrl: explorerUrl(address),
      totalUsd: parseFloat(totalUsd.toFixed(2)),
      assets,
    },
  });
});
