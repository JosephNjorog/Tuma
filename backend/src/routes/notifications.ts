import { Hono } from "hono";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { eq, or, desc } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

export const notificationsRouter = new Hono();
notificationsRouter.use("*", authMiddleware);

type Notification = {
  id: string;
  kind: "received" | "settled" | "failed";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};

// GET /api/notifications — derived from real transaction activity, not stored events.
notificationsRouter.get("/", async (c) => {
  const { sub: userId } = c.get("user");

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const seenAt = user?.notificationsSeenAt ?? null;

  const rows = await db.query.transactions.findMany({
    where: or(eq(transactions.senderId, userId), eq(transactions.recipientUserId, userId)),
    orderBy: [desc(transactions.createdAt)],
    limit: 30,
  });

  const notifications: Notification[] = [];
  for (const tx of rows) {
    const isRecipient = tx.recipientUserId === userId;
    const amount = `${parseFloat(tx.amountLocal).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${tx.localCurrency}`;
    let n: Notification | null = null;

    if (isRecipient && tx.status === "settled") {
      n = {
        id: tx.id,
        kind: "received",
        title: "Money received",
        body: `You received ${amount} via ${tx.rail}`,
        createdAt: (tx.settledAt ?? tx.createdAt).toISOString(),
        read: false,
      };
    } else if (!isRecipient && tx.status === "settled") {
      n = {
        id: tx.id,
        kind: "settled",
        title: "Transfer settled",
        body: `Your transfer of ${amount} to ${tx.recipientPhone} settled via ${tx.rail}`,
        createdAt: (tx.settledAt ?? tx.createdAt).toISOString(),
        read: false,
      };
    } else if (!isRecipient && tx.status === "failed") {
      n = {
        id: tx.id,
        kind: "failed",
        title: "Transfer failed",
        body: `Your transfer of ${amount} to ${tx.recipientPhone} couldn't be completed`,
        createdAt: tx.createdAt.toISOString(),
        read: false,
      };
    }

    if (n) {
      n.read = seenAt ? new Date(n.createdAt) <= seenAt : false;
      notifications.push(n);
    }
  }

  const unread = notifications.filter((n) => !n.read).length;

  return c.json({ ok: true, data: { notifications, unread } });
});

// POST /api/notifications/seen — marks everything up to now as read.
notificationsRouter.post("/seen", async (c) => {
  const { sub: userId } = c.get("user");
  await db.update(users).set({ notificationsSeenAt: new Date() }).where(eq(users.id, userId));
  return c.json({ ok: true });
});
