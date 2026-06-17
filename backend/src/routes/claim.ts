import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { escrowPayments, transactions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { recordSettlementStep } from "../services/settlement";
import { processRailDisbursement } from "../services/rail-disbursement";
import { claimEscrowOnChain } from "../services/avalanche";
import { signEscrowClaim } from "../lib/escrow-signer";
import { enqueueRailDisburse, type RailDisburseJob } from "../lib/queue";
import { EscrowError, NotFoundError } from "../lib/errors";

export const claimRouter = new Hono();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
    if (escrow.status !== "pending") throw new EscrowError(`Payment already ${escrow.status}`);
    if (new Date() > escrow.expiresAt) throw new EscrowError("Claim link has expired");
    if (escrow.recipientPhone !== phone) throw new EscrowError("This claim is not for your phone number");

    const recipient = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!recipient) throw new NotFoundError("User");
    if (!recipient.walletAddress) throw new EscrowError("Wallet not yet deployed. Try again in a moment.");

    // Produce TUMA signer authorization and unlock USDC on-chain
    const chainId = parseInt(process.env.AVALANCHE_CHAIN_ID ?? "43114", 10);
    const sig = await signEscrowClaim(ref, recipient.walletAddress as `0x${string}`, chainId);
    const claimTxHash = await claimEscrowOnChain(ref, recipient.walletAddress as `0x${string}`, sig);

    // Mark escrow as claimed in DB
    await db
      .update(escrowPayments)
      .set({
        status: "claimed",
        claimTxHash,
        claimedByWallet: recipient.walletAddress,
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(escrowPayments.ref, ref));

    // Attach the claiming user and record the on-chain claim before rail payout.
    await db
      .update(transactions)
      .set({
        recipientUserId: userId,
        recipientWalletAddress: recipient.walletAddress,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, escrow.transactionId));

    await recordSettlementStep(escrow.transactionId, "onchain", {
      escrowRef: ref,
      claimedBy: phone,
      claimTxHash,
    });

    const railJob: RailDisburseJob = {
      transactionId: escrow.transactionId,
      rail: escrow.transaction.rail,
      recipientPhone: phone,
      amountLocal: parseFloat(escrow.transaction.amountLocal),
      localCurrency: escrow.transaction.localCurrency,
      reference: escrow.transaction.reference,
      failureStage: "claim_rail_disbursement",
      metadata: {
        escrowRef: ref,
        claimedBy: phone,
        claimTxHash,
      },
    };

    let railQueued = false;
    let railReference: string | null = null;
    let rail = railJob.rail;
    let status = "onchain";

    try {
      railQueued = await enqueueRailDisburse(railJob);

      if (!railQueued) {
        const result = await processRailDisbursement(railJob);
        rail = result.rail;
        railReference = result.railReference;
        status = result.status === "settled" ? "settled" : "routed";
      }
    } catch (err) {
      await recordSettlementStep(escrow.transactionId, "requires_review", {
        stage: "claim_rail_disbursement",
        error: errorMessage(err),
        escrowRef: ref,
        claimedBy: phone,
        claimTxHash,
      });

      return c.json({
        ok: true,
        data: {
          ref,
          amountUsdc: parseFloat(escrow.amountUsdc),
          amountLocal: parseFloat(escrow.transaction.amountLocal),
          localCurrency: escrow.transaction.localCurrency,
          rail,
          railReference,
          railQueued,
          status: "requires_review",
          transactionId: escrow.transactionId,
          message: "Payment claimed on-chain, but payout needs manual review.",
        },
      });
    }

    return c.json({
      ok: true,
      data: {
        ref,
        amountUsdc: parseFloat(escrow.amountUsdc),
        amountLocal: parseFloat(escrow.transaction.amountLocal),
        localCurrency: escrow.transaction.localCurrency,
        rail,
        railReference,
        railQueued,
        status,
        transactionId: escrow.transactionId,
        message: railQueued
          ? "Payment claimed and queued for payout."
          : "Payment claimed and on its way to your mobile money account.",
      },
    });
  }
);
