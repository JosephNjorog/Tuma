import { createMiddleware } from "hono/factory";
import { randomUUID } from "crypto";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const id = c.req.header("x-request-id") ?? randomUUID();
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
});
