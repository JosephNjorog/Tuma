import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SendMoneySchema } from "@tuma/shared";
import { db } from "../db";
import { users, transactions, merchantSettings } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { sendMoneyLimiter } from "../middleware/rateLimit";
import { consumeQuote } from "../services/fx";
import {
  transferUsdc,
  approveEscrow,
  depositToEscrow,
  getUsdcBalance,
} from "../services/avalanche";
import { recordSettlementStep } from "../services/settlement";
import { processRailDisbursement } from "../services/rail-disbursement";
import { sendClaimLink, sendReceivedNotification } from "../services/whatsapp";
import { hashPhone, generateTxRef, generateEscrowRef } from "../lib/crypto";
import {
  FxQuoteExpiredError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../lib/errors";
import { escrowPayments } from "../db/schema";
import {
  enqueueRailDisburse,
  enqueueWhatsAppNotify,
  scheduleEscrowExpiry,
  type RailDisburseJob,
} from "../lib/queue";
import { del, setnxTtl } from "../lib/redis";
import { parseUnits } from "viem";
import type { Address } from "viem";

export const sendRouter = new Hono();
sendRouter.use("*", authMiddleware);

type SendTransaction = typeof transactions.$inferSelect;

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]+$/;

function normalizeIdempotencyKey(c: Context, bodyKey?: string): string | null {
  const key =
    bodyKey ??
    c.req.header("idempotency-key") ??
    c.req.header("x-idempotency-key") ??
    null;

  if (!key) return null;

  const trimmed = key.trim();
  if (
    trimmed.length < 8 ||
    trimmed.length > 128 ||
    !IDEMPOTENCY_KEY_RE.test(trimmed)
  ) {
    throw new ValidationError(
      "Idempotency key must be 8-128 characters using letters, numbers, '.', '_', ':', or '-'"
    );
  }

  return trimmed;
}

function txToSendResponse(
  tx: SendTransaction,
  idempotentReplay = false,
  extra: Record<string, unknown> = {}
) {
  return {
    transactionId: tx.id,
    reference: tx.reference,
    txHash: tx.txHash,
    type: tx.isEscrow ? "escrow" : "direct",
    rail: tx.rail,
    amountLocal: parseFloat(tx.amountLocal),
    localCurrency: tx.localCurrency,
    status: tx.status,
    escrowRef: tx.escrowRef,
    claimUrl: tx.escrowRef ? `${process.env.APP_URL}/claim/${tx.escrowRef}` : null,
    failureStage: tx.failureStage,
    failureReason: tx.failureReason,
    idempotentReplay,
    ...extra,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function markRequiresReview(
  transactionId: string,
  stage: string,
  err: unknown
): Promise<void> {
  await recordSettlementStep(transactionId, "requires_review", {
    stage,
    error: errorMessage(err),
  });
}

async function acquireSendIdempotencyLock(
  userId: string,
  idempotencyKey: string | null
): Promise<string | null> {
  if (!idempotencyKey) return null;

  const lockKey = `idem:send:${userId}:${idempotencyKey}`;
  const acquired = await setnxTtl(lockKey, 120);
  return acquired ? lockKey : null;
}

async function releaseSendIdempotencyLock(lockKey: string | null): Promise<void> {
  if (!lockKey) return;

  try {
    await del(lockKey);
  } catch (err) {
    console.error(`[Send] Failed to release idempotency lock ${lockKey}:`, errorMessage(err));
  }
}

// POST /api/send
sendRouter.post(
  "/",
  sendMoneyLimiter,
  zValidator("json", SendMoneySchema),
  async (c) => {
    const { quoteId, recipientPhone, amountUsd, token, note, idempotencyKey: bodyKey } =
      c.req.valid("json");
    const { sub: userId } = c.get("user");
    const idempotencyKey = normalizeIdempotencyKey(c, bodyKey);

    if (idempotencyKey) {
      const existing = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.senderId, userId),
          eq(transactions.idempotencyKey, idempotencyKey)
        ),
      });

      if (existing) {
        return c.json({
          ok: true,
          data: txToSendResponse(existing, true),
        });
      }
    }

    const lockKey = await acquireSendIdempotencyLock(userId, idempotencyKey);
    if (idempotencyKey && !lockKey) {
      const existing = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.senderId, userId),
          eq(transactions.idempotencyKey, idempotencyKey)
        ),
      });

      if (existing) {
        return c.json({
          ok: true,
          data: txToSendResponse(existing, true),
        });
      }

      throw new ConflictError("A send with this idempotency key is already processing.");
    }

    try {
    // 1. Load and consume the rate-locked quote
    let quote;
    try {
      quote = await consumeQuote(quoteId);
    } catch {
      throw new FxQuoteExpiredError();
    }

    // 2. Validate quote matches request
    if (
      Math.abs(quote.fromAmountUsd - amountUsd) > 0.01 ||
      quote.recipientPhone !== recipientPhone
    ) {
      throw new FxQuoteExpiredError();
    }

    // 3. Load sender
    const sender = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!sender?.walletAddress) throw new NotFoundError("Sender wallet");

    // 4. Check USDC balance
    const balanceRaw = await getUsdcBalance(sender.walletAddress as Address);
    const requiredRaw = parseUnits(amountUsd.toFixed(6), 6);
    if (balanceRaw < requiredRaw) throw new InsufficientFundsError();

    // 5. Detect if recipient is a TUMA user
    const recipientHash = hashPhone(recipientPhone);
    const recipient = await db.query.users.findFirst({
      where: eq(users.phoneHash, recipientHash),
    });

    const isTumaUser = !!recipient?.walletAddress;
    const reference = generateTxRef();

    // 6. Create transaction record (initiated)
    const [tx] = await db
      .insert(transactions)
      .values({
        reference,
        idempotencyKey,
        senderId: userId,
        recipientPhone,
        recipientUserId: recipient?.id ?? null,
        recipientWalletAddress: recipient?.walletAddress ?? null,
        amountUsdc: amountUsd.toFixed(6),
        amountLocal: quote.toAmount.toFixed(2),
        localCurrency: quote.toCurrency,
        fxRate: quote.tumaRate.toFixed(8),
        fxLockedAt: new Date(quote.lockedUntil),
        token: token ?? "USDC",
        rail: quote.rail,
        isEscrow: !isTumaUser,
        note: note ?? null,
      })
      .returning();

    await recordSettlementStep(tx.id, "initiated");

    if (isTumaUser) {
      // ── Direct TUMA-to-TUMA transfer ──────────────────────────────────────
      let stage = "direct_merchant_lookup";
      try {
        // Detect merchant payments: recipient has merchant mode on and till open.
        const recipientMerchant = recipient!.isMerchant
          ? await db.query.merchantSettings.findFirst({
              where: eq(merchantSettings.userId, recipient!.id),
            })
          : null;
        const isMerchantPayment = !!recipientMerchant?.tillOpen;
        const feeUsd = isMerchantPayment
          ? parseFloat(((amountUsd * recipientMerchant!.feeBps) / 10_000).toFixed(6))
          : 0;
        const netAmountUsd = parseFloat((amountUsd - feeUsd).toFixed(6));
        const netAmountLocal = isMerchantPayment
          ? parseFloat((netAmountUsd * quote.tumaRate).toFixed(2))
          : quote.toAmount;

        stage = "direct_onchain_transfer";
        const txHash = await transferUsdc(
          recipientHash,
          sender.walletAddress as Address,
          recipient!.walletAddress as Address,
          netAmountUsd
        );

        stage = "direct_transaction_update";
        await db
          .update(transactions)
          .set({
            txHash,
            isMerchantPayment,
            merchantId: isMerchantPayment ? recipient!.id : null,
            feeUsdc: feeUsd.toFixed(6),
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, tx.id));

        const treasuryAddress = process.env.TREASURY_ADDRESS as Address | undefined;
        if (isMerchantPayment && feeUsd > 0 && treasuryAddress) {
          transferUsdc(
            recipientHash,
            sender.walletAddress as Address,
            treasuryAddress,
            feeUsd
          ).catch((err) =>
            console.error(`[Send] Merchant fee transfer failed for ${reference}:`, err.message)
          );
        }

        stage = "direct_onchain_record";
        await recordSettlementStep(tx.id, "onchain", { txHash });

        const railJob: RailDisburseJob = {
          transactionId: tx.id,
          rail: quote.rail,
          recipientPhone,
          amountLocal: netAmountLocal,
          localCurrency: quote.toCurrency,
          reference,
          failureStage: "direct_rail_disbursement",
          metadata: { txHash },
        };

        stage = "direct_rail_enqueue";
        const railQueued = await enqueueRailDisburse(railJob);
        let railReference: string | null = null;
        let responseStatus = "onchain";

        if (!railQueued) {
          stage = "direct_rail_disbursement";
          const result = await processRailDisbursement(railJob);
          railReference = result.railReference;
          responseStatus = result.status === "settled" ? "settled" : "routed";
        }

        // Notify recipient via WhatsApp; do not roll back money movement if
        // notification delivery has a transient provider issue.
        enqueueWhatsAppNotify({
          to: recipientPhone,
          templateName: "tuma_received",
          params: [quote.toAmount.toFixed(2), quote.toCurrency, sender.phone],
        })
          .then((queued) => {
            if (!queued) {
              return sendReceivedNotification(
                recipientPhone,
                quote.toAmount.toFixed(2),
                quote.toCurrency,
                sender.phone
              );
            }
          })
          .catch(console.error);

        return c.json({
          ok: true,
          data: txToSendResponse(tx, false, {
            txHash,
            status: responseStatus,
            amountLocal: netAmountLocal,
            railReference,
            railQueued,
          }),
        });
      } catch (err) {
        await markRequiresReview(tx.id, stage, err);
        throw err;
      }
    } else {
      // ── Escrow for non-TUMA recipient ────────────────────────────────────
      const escrowRef = generateEscrowRef();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      let stage = "escrow_approve";
      try {
        // Approve escrow contract to pull USDC from sender's smart wallet
        await approveEscrow(sender.walletAddress as Address, amountUsd);

        // Lock USDC in TumaEscrow on-chain (sender's wallet calls escrow.deposit())
        stage = "escrow_deposit";
        const escrowTxHash = await depositToEscrow(
          sender.walletAddress as Address,
          escrowRef,
          amountUsd
        );

        // Store the on-chain hash immediately so recovery has the chain anchor
        // even if a later DB/queue/provider step fails.
        stage = "escrow_transaction_update";
        await db
          .update(transactions)
          .set({
            escrowRef,
            isEscrow: true,
            txHash: escrowTxHash,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, tx.id));
        await recordSettlementStep(tx.id, "onchain", { txHash: escrowTxHash, escrowRef });

        stage = "escrow_record";
        await db.insert(escrowPayments).values({
          ref: escrowRef,
          transactionId: tx.id,
          senderId: userId,
          recipientPhone,
          tokenAddress: process.env.USDC_ADDRESS!,
          amountUsdc: amountUsd.toFixed(6),
          onchainRef: escrowRef,
          expiresAt,
        });

        stage = "escrow_schedule_expiry";
        await scheduleEscrowExpiry(
          {
            escrowRef,
            transactionId: tx.id,
            senderWallet: sender.walletAddress,
            amountUsdc: amountUsd.toFixed(6),
            onchainRef: escrowRef,
          },
          expiresAt
        );

        const claimUrl = `${process.env.APP_URL}/claim/${escrowRef}`;
        let notificationQueued = false;

        try {
          stage = "escrow_claim_link_enqueue";
          notificationQueued = await enqueueWhatsAppNotify({
            to: recipientPhone,
            templateName: "tuma_claim_link",
            params: [sender.phone, quote.toAmount.toFixed(2), quote.toCurrency, claimUrl],
            transactionId: tx.id,
            failureStage: "escrow_claim_link",
          });

          if (!notificationQueued) {
            stage = "escrow_claim_link";
            await sendClaimLink(
              recipientPhone,
              sender.phone,
              quote.toAmount.toFixed(2),
              quote.toCurrency,
              claimUrl
            );
          }
        } catch (err) {
          await markRequiresReview(tx.id, "escrow_claim_link", err);
          return c.json({
            ok: true,
            data: txToSendResponse(tx, false, {
              txHash: escrowTxHash,
              escrowRef,
              claimUrl,
              expiresAt: expiresAt.toISOString(),
              status: "requires_review",
              notificationStatus: "failed",
              message:
                "Funds are escrowed, but the claim link could not be sent automatically.",
            }),
          });
        }

        return c.json({
          ok: true,
          data: txToSendResponse(tx, false, {
            txHash: escrowTxHash,
            escrowRef,
            claimUrl,
            expiresAt: expiresAt.toISOString(),
            status: "onchain",
            notificationQueued,
            message: notificationQueued
              ? "Claim link queued for WhatsApp delivery"
              : "Claim link sent via WhatsApp to recipient",
          }),
        });
      } catch (err) {
        await markRequiresReview(tx.id, stage, err);
        throw err;
      }
    }
    } finally {
      await releaseSendIdempotencyLock(lockKey);
    }
  }
);
