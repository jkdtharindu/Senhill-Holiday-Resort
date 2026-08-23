/**
 * Database connection.
 *
 * Postgres is a hard requirement, not a convenience — there is deliberately no
 * in-memory or local-file fallback anywhere in this project, including in
 * development. Bookings, approvals and day-mode configuration have to survive
 * restarts and be visible across every admin's session immediately.
 * See docs/ARCHITECTURE.md, "Persistence requirement".
 *
 * Uses the WebSocket-backed Neon driver rather than the HTTP one because
 * several operations must be transactional — BulkDayModeAssignment writes many
 * `day_modes` rows at once, and casting an ApprovalVote updates the booking,
 * the vote and the audit log together. A partially-applied bulk update would
 * leave the calendar in a state no admin asked for.
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste your " +
        "Neon connection string into it. See README.md for where to find it.",
    );
  }
  return url;
}

/**
 * One pool per process, reused across requests.
 *
 * Serverless platforms reuse a warm process for many invocations, so creating a
 * pool per request would open connections far faster than Postgres closes them
 * and exhaust the limit under mild load. In development the module cache is
 * cleared on every hot reload, so the pool is stashed on `globalThis` to
 * survive that — without it, editing a file slowly leaks connections until
 * Neon refuses new ones.
 */
const globalForDb = globalThis as unknown as {
  senhillPool: Pool | undefined;
};

const pool = globalForDb.senhillPool ?? new Pool({ connectionString: connectionString() });

if (process.env.NODE_ENV !== "production") {
  globalForDb.senhillPool = pool;
}

export const db = drizzle(pool, { schema });

export { schema };
export type Database = typeof db;
