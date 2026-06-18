import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { opsAuthMiddleware } from "../middleware/ops";
import {
  listRailDeadLetters,
  retryRailDeadLetter,
} from "../services/rail-dead-letter";

export const opsRouter = new Hono();
opsRouter.use("*", opsAuthMiddleware);

const DeadLetterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const RetryParamSchema = z.object({
  transactionId: z.string().uuid(),
});

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
    const data = await retryRailDeadLetter(
      transactionId,
      c.req.header("x-operator") ?? "ops-token"
    );
    return c.json({ ok: true, data });
  }
);
