import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { escrowPayments, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { claimEscrowOnChain } from "../services/avalanche";
import { signEscrowClaim } from "../lib/escrow-signer";
import {
  reconcileEscrowClaim,
  reconcileEscrowClaimReview,
  markEscrowClaimDbUpdateRequiresReview,
  type ClaimRailHandoffResult,
  type EscrowClaimContext,
} from "../services/escrow-claim";
import { delIfValue, setnxTtl } from "../lib/redis";
import { ConflictError, EscrowError, NotFoundError } from "../lib/errors";

export const claimRouter = new Hono();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const CLAIM_LOCK_TTL_SECONDS = 180;

type ClaimLock = {
  key: string;
  token: string;
};

type ClaimReplayEscrow = {
  ref: string;
  transactionId: string;
  claimTxHash: string | null;
  claimedByWallet: string | null;
  amountUsdc: string;
  transaction: {
    amountLocal: string;
    localCurrency: string;
    rail: string;
    reference: string;
    railReference: string | null;
    status: string;
  };
};

async function acquireClaimLock(ref: string): Promise<ClaimLock | null> {
  const key = `lock:escrow-claim:${ref}`;
  const token = randomUUID();
  const acquired = await setnxTtl(key, CLAIM_LOCK_TTL_SECONDS, token);
  return acquired ? { key, token } : null;
}

async function releaseClaimLock(lock: ClaimLock | null): Promise<void> {
  if (!lock) return;

  try {
    await delIfValue(lock.key, lock.token);
  } catch (err) {
    console.error(`[Claim] Failed to release lock ${lock.key}:`, errorMessage(err));
  }
}

function claimResponseData(
  ctx: EscrowClaimContext,
  handoff: ClaimRailHandoffResult,
  message: string
) {
  return {
    ref: ctx.ref,
    amountUsdc: parseFloat(ctx.amountUsdc),
    amountLocal: ctx.amountLocal,
    localCurrency: ctx.localCurrency,
    rail: handoff.rail,
    railReference: handoff.railReference,
    railQueued: handoff.railQueued,
    status: handoff.status,
    claimTxHash: ctx.claimTxHash,
    transactionId: ctx.transactionId,
    message,
  };
}

function replayStatus(status: string): ClaimRailHandoffResult["status"] {
  if (status === "routed" || status === "settled" || status === "requires_review") {
    return status;
  }

  return "onchain";
}

function claimHandoffMessage(handoff: ClaimRailHandoffResult): string {
  if (handoff.status === "requires_review") {
    return "Payment claimed on-chain, but payout needs manual review.";
  }

  if (handoff.railQueued) {
    return "Payment claimed and queued for payout.";
  }

  return "Payment claimed and on its way to your mobile money account.";
}

// GET /api/claim/:ref  ─── Preview claim (no auth required so non-users can see it)
claimRouter.get("/:ref", async (c) => {
  const { ref } = c.req.param();

  const escrow = await db.query.escrowPayments.findFirst({
    where: eq(escrowPayments.ref, ref),
    with: { sender: true },
  });

  if (!escrow) throw new NotFoundError("Claim");
  if (escrow.status !== "pending") {
    return c.json({
      ok: true,
      data: {
        status: escrow.status,
        message:
          escrow.status === "claimed"
            ? "This payment has already been claimed."
            : "This payment has expired and been returned to the sender.",
      },
    });
  }

  if (new Date() > escrow.expiresAt) {
    throw new EscrowError("This claim link has expired.");
  }

  return c.json({
    ok: true,
    data: {
      ref: escrow.ref,
      senderPhone: escrow.sender.phone,
      amountUsdc: parseFloat(escrow.amountUsdc),
      expiresAt: escrow.expiresAt.toISOString(),
      status: escrow.status,
    },
  });
});

// POST /api/claim  ─── Claim a payment (recipient must verify OTP first)
// This endpoint is called after the recipient verifies their WhatsApp OTP
// and optionally creates a TUMA account.
claimRouter.post(
  "/",
  authMiddleware, // Recipient must be logged in (via OTP flow)
  zValidator("json", z.object({ ref: z.string() })),
  async (c) => {
    const { ref } = c.req.valid("json");
    const { sub: userId, phone } = c.get("user");

    const escrow = await db.query.escrowPayments.findFirst({
      where: eq(escrowPayments.ref, ref),
      with: { transaction: true, sender: true },
    });

    if (!escrow) throw new NotFoundError("Claim");
    if (escrow.recipientPhone !== phone) throw new EscrowError("This claim is not for your phone number");

    const recipient = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!recipient) throw new NotFoundError("User");
    if (!recipient.walletAddress) throw new EscrowError("Wallet not yet deployed. Try again in a moment.");
    const recipientWalletAddress = recipient.walletAddress;

    function claimedReplayResponse(claimedEscrow: ClaimReplayEscrow) {
      const claimTxHash = claimedEscrow.claimTxHash ?? "";
      const ctx: EscrowClaimContext = {
        ref: claimedEscrow.ref,
        transactionId: claimedEscrow.transactionId,
        recipientUserId: userId,
        recipientPhone: phone,
        recipientWalletAddress,
        claimTxHash,
        amountUsdc: claimedEscrow.amountUsdc,
        amountLocal: parseFloat(claimedEscrow.transaction.amountLocal),
        localCurrency: claimedEscrow.transaction.localCurrency,
        rail: claimedEscrow.transaction.rail,
        reference: claimedEscrow.transaction.reference,
      };

      return c.json({
        ok: true,
        data: claimResponseData(
          ctx,
          {
            rail: claimedEscrow.transaction.rail,
            railReference: claimedEscrow.transaction.railReference,
            railQueued: false,
            status: replayStatus(claimedEscrow.transaction.status),
          },
          "Payment already claimed."
        ),
      });
    }

    const hasPendingClaimReview =
      escrow.status === "pending" &&
      escrow.transaction.status === "requires_review" &&
      escrow.transaction.failureStage === "escrow_claim_db_update";

    if (escrow.status !== "pending") {
      if (
        escrow.status === "claimed" &&
        escrow.claimedByWallet === recipientWalletAddress
      ) {
        return claimedReplayResponse(escrow);
      }

      throw new EscrowError(`Payment already ${escrow.status}`);
    }

    if (!hasPendingClaimReview && new Date() > escrow.expiresAt) {
      throw new EscrowError("Claim link has expired");
    }

    const lockKey = await acquireClaimLock(ref);
    if (!lockKey) {
      const latest = await db.query.escrowPayments.findFirst({
        where: eq(escrowPayments.ref, ref),
        with: { transaction: true },
      });

      if (
        latest?.status === "claimed" &&
        latest.claimedByWallet === recipientWalletAddress
      ) {
        return claimedReplayResponse(latest);
      }

      throw new ConflictError("This claim is already being processed.");
    }

    try {
      const latest = await db.query.escrowPayments.findFirst({
        where: eq(escrowPayments.ref, ref),
        with: { transaction: true },
      });

      if (!latest) throw new NotFoundError("Claim");
      if (
        latest.status === "claimed" &&
        latest.claimedByWallet === recipientWalletAddress
      ) {
        return claimedReplayResponse(latest);
      }
      if (latest.status !== "pending") throw new EscrowError(`Payment already ${latest.status}`);

      if (
        latest.transaction.status === "requires_review" &&
        latest.transaction.failureStage === "escrow_claim_db_update"
      ) {
        try {
          const replay = await reconcileEscrowClaimReview(
            latest.transactionId,
            "claim_route_retry"
          );

          if (replay) {
            return c.json({
              ok: true,
              data: claimResponseData(
                replay.ctx,
                replay.handoff,
                claimHandoffMessage(replay.handoff)
              ),
            });
          }
        } catch (err) {
          console.error(
            `[Claim] Failed to replay claim reconciliation for ${ref}:`,
            errorMessage(err)
          );
        }

        throw new ConflictError("This claim is already being reconciled.");
      }

      if (new Date() > latest.expiresAt) throw new EscrowError("Claim link has expired");

      // Produce TUMA signer authorization and unlock USDC on-chain.
      const chainId = parseInt(process.env.AVALANCHE_CHAIN_ID ?? "43114", 10);
      const sig = await signEscrowClaim(ref, recipientWalletAddress as `0x${string}`, chainId);
      const claimTxHash = await claimEscrowOnChain(ref, recipientWalletAddress as `0x${string}`, sig);

      const claimCtx: EscrowClaimContext = {
        ref,
        transactionId: latest.transactionId,
        recipientUserId: userId,
        recipientPhone: phone,
        recipientWalletAddress,
        claimTxHash,
        amountUsdc: latest.amountUsdc,
        amountLocal: parseFloat(latest.transaction.amountLocal),
        localCurrency: latest.transaction.localCurrency,
        rail: latest.transaction.rail,
        reference: latest.transaction.reference,
      };

      let handoff: ClaimRailHandoffResult;
      try {
        handoff = await reconcileEscrowClaim(claimCtx, "claim_route");
      } catch (err) {
        try {
          await markEscrowClaimDbUpdateRequiresReview(claimCtx, err, "claim_route");
        } catch (reviewErr) {
          console.error(
            `[Claim] Failed to record claim reconciliation review for ${ref}:`,
            errorMessage(reviewErr)
          );
        }

        return c.json({
          ok: true,
          data: claimResponseData(
            claimCtx,
            {
              rail: claimCtx.rail,
              railReference: null,
              railQueued: false,
              status: "requires_review",
            },
            "Payment claimed on-chain, but local reconciliation needs manual review."
          ),
        });
      }

      return c.json({
        ok: true,
        data: claimResponseData(
          claimCtx,
          handoff,
          claimHandoffMessage(handoff)
        ),
      });
    } finally {
      await releaseClaimLock(lockKey);
    }
  }
);
