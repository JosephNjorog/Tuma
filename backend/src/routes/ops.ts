import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { opsAuthMiddleware } from "../middleware/ops";
import {
  listRailDeadLetters,
  retryRailDeadLetter,
} from "../services/rail-dead-letter";
import {
  reconcileChainHash,
  resendClaimLink,
  retryEscrowRefund,
} from "../services/review-recovery";
import { listHeartbeatStatus } from "../services/worker-heartbeat";

export const opsRouter = new Hono();
opsRouter.use("*", opsAuthMiddleware);

const DeadLetterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const RetryParamSchema = z.object({
  transactionId: z.string().uuid(),
});

const ChainHashBodySchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  escrowRef: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
});

const BooleanQuery = z.preprocess(
  (value) => value === true || value === "true" || value === "1",
  z.boolean()
);

const HeartbeatQuerySchema = z.object({
  staleOnly: BooleanQuery,
  failOnStale: BooleanQuery,
});

function operator(c: Context): string {
  return c.req.header("x-operator") ?? "ops-token";
}

// GET /api/ops/health/heartbeats
opsRouter.get(
  "/health/heartbeats",
  zValidator("query", HeartbeatQuerySchema),
  async (c) => {
    const { staleOnly, failOnStale } = c.req.valid("query");
    const data = await listHeartbeatStatus(staleOnly);
    const status = (failOnStale && data.staleCount > 0 ? 503 : 200) as
      | 200
      | 503;
    return c.json({ ok: data.staleCount === 0, data }, status);
  }
);

// GET /api/ops/rail/dead-letter
opsRouter.get(
  "/rail/dead-letter",
  zValidator("query", DeadLetterQuerySchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");
    const data = await listRailDeadLetters(page, limit);
    return c.json({ ok: true, data });
  }
);

// POST /api/ops/rail/dead-letter/:transactionId/retry
opsRouter.post(
  "/rail/dead-letter/:transactionId/retry",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const data = await retryRailDeadLetter(transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);

// POST /api/ops/review/:transactionId/resend-claim-link
opsRouter.post(
  "/review/:transactionId/resend-claim-link",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const data = await resendClaimLink(transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);

// POST /api/ops/review/:transactionId/reconcile-chain-hash
opsRouter.post(
  "/review/:transactionId/reconcile-chain-hash",
  zValidator("param", RetryParamSchema),
  zValidator("json", ChainHashBodySchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const body = c.req.valid("json");
    const data = await reconcileChainHash(
      transactionId,
      body.txHash as `0x${string}`,
      operator(c),
      {
        escrowRef: body.escrowRef,
        note: body.note,
      }
    );
    return c.json({ ok: true, data });
  }
);

// POST /api/ops/review/:transactionId/refund-escrow
opsRouter.post(
  "/review/:transactionId/refund-escrow",
  zValidator("param", RetryParamSchema),
  async (c) => {
    const { transactionId } = c.req.valid("param");
    const data = await retryEscrowRefund(transactionId, operator(c));
    return c.json({ ok: true, data });
  }
);
