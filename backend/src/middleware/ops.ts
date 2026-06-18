import type { Context, Next } from "hono";
import { AuthError } from "../lib/errors";

export async function opsAuthMiddleware(c: Context, next: Next) {
  const expected = process.env.OPERATIONS_API_TOKEN;
  if (!expected) {
    throw new AuthError("Operations API token is not configured");
  }

  const provided = c.req.header("x-operations-token");
  if (!provided || provided !== expected) {
    throw new AuthError("Invalid operations token");
  }

  await next();
}
