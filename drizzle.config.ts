import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Migrations run from the CLI, outside Next.js, so nothing has loaded the env
// file for us here. `.env.local` is the git-ignored file holding the real Neon
// connection string; `.env` is a fallback for CI.
config({ path: ".env.local" });
config({ path: ".env" });

/**
 * `drizzle-kit generate` only reads the schema file and writes SQL — it never
 * opens a connection, so it must keep working before a database exists. Only
 * `migrate`, `push` and `studio` actually connect.
 *
 * So when DATABASE_URL is absent we hand drizzle-kit a deliberately unusable
 * placeholder rather than throwing at import time. Generating migrations still
 * works; anything that connects fails immediately with a message naming the
 * host, which is a far clearer signal than a hang or a generic auth error.
 */
const PLACEHOLDER_URL =
  "postgresql://set-DATABASE_URL-in-env-local:@database-url-not-configured/senhill";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? PLACEHOLDER_URL },
  // Surfaces exactly what will run before it touches a real database.
  verbose: true,
  // Prompts before anything destructive. Dropping a column on a database that
  // holds real bookings is HITL-gated (docs/HITL.md) — this is the mechanical
  // half of that guardrail.
  strict: true,
});
