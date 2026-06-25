import { serve } from "@hono/node-server";
import app from "./app";
import { runStartupMigrations } from "./db/migrate";

const port = parseInt(process.env.PORT ?? "3001");

// Apply any outstanding DDL before accepting traffic
await runStartupMigrations();

serve({ fetch: app.fetch, port }, () => {
  console.log(`\n🚀 API running on http://localhost:${port}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   Health: http://localhost:${port}/health\n`);
});
