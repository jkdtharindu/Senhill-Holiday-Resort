/**
 * Sign-in rate limiting for the admin panel.
 *
 * Counts recent failures in a sliding window and refuses further attempts once
 * a threshold is crossed. Counted twice over: per email, so one account cannot
 * be ground through, and per IP, so an attacker cannot sidestep the email limit
 * by spraying many addresses from one machine.
 *
 * NOT a lockout. The window slides, so a real admin who mistypes their password
 * a few times is delayed for minutes, not locked out. A hard lockout would hand
 * anyone who knows an admin's email a way to disable that account on demand —
 * with two or three admins on this system, that is a worse problem than the one
 * it solves.
 *
 * State lives in Postgres rather than process memory because Vercel runs many
 * short-lived instances; an in-memory counter would reset constantly and an
 * attacker spread across instances would never hit it.
 */

import { and, count, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { adminLoginAttempts } from "@/db/schema";

/** Failures allowed per email before that email is refused. */
export const MAX_ATTEMPTS_PER_EMAIL = 8;
/** Failures allowed per IP before that IP is refused, across all emails. */
export const MAX_ATTEMPTS_PER_IP = 20;
/** How far back failures are counted. */
export const WINDOW_MINUTES = 15;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry. Only meaningful when blocked. */
  retryAfterSeconds: number;
}

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
}

/**
 * Best-effort client IP.
 *
 * Behind Vercel, `x-forwarded-for` is set by the platform and its first entry
 * is the real client. This header is trivially spoofable when the app is NOT
 * behind a trusted proxy, so the IP limit is a speed bump rather than a
 * guarantee — the per-email limit is the one that holds regardless.
 */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}

/**
 * Failures for one email, counted only since that email last signed in
 * successfully.
 *
 * The "since last success" clause is what resets the counter, rather than
 * deleting rows. Deleting would also erase the record of a brute-force run that
 * eventually succeeded — which is precisely the sequence anyone investigating a
 * break-in needs to see. So the history stays complete and the counter still
 * resets: an admin who mistypes six times then gets it right starts from zero
 * on their next attempt, but those six failures remain on record.
 */
async function countEmailFailures(email: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.email, email),
        eq(adminLoginAttempts.succeeded, false),
        gte(adminLoginAttempts.attemptedAt, windowStart()),
        sql`${adminLoginAttempts.attemptedAt} > coalesce((
          select max(a.attempted_at) from admin_login_attempts a
          where a.email = ${email} and a.succeeded = true
        ), 'epoch'::timestamptz)`,
      ),
    );
  return row?.n ?? 0;
}

/**
 * Failures from one IP, across every email it has tried.
 *
 * Deliberately NOT reset by a success. An attacker who guesses one account
 * correctly should not thereby earn a fresh budget for attacking the others.
 */
async function countIpFailures(ipAddress: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.ipAddress, ipAddress),
        eq(adminLoginAttempts.succeeded, false),
        gte(adminLoginAttempts.attemptedAt, windowStart()),
      ),
    );
  return row?.n ?? 0;
}

export async function checkRateLimit(
  email: string,
  ipAddress: string | null,
): Promise<RateLimitResult> {
  const retryAfterSeconds = WINDOW_MINUTES * 60;

  if ((await countEmailFailures(email)) >= MAX_ATTEMPTS_PER_EMAIL) {
    return { allowed: false, retryAfterSeconds };
  }

  if (ipAddress && (await countIpFailures(ipAddress)) >= MAX_ATTEMPTS_PER_IP) {
    return { allowed: false, retryAfterSeconds };
  }

  return ALLOWED;
}

/**
 * Record an attempt.
 *
 * Failures are what the limiter counts; successes are recorded too, so the
 * table doubles as an audit trail of who signed in and from where.
 *
 * Never throws: a logging failure must not be able to block a legitimate
 * sign-in, and must not surface a database error to an unauthenticated caller.
 */
export async function recordLoginAttempt(
  email: string,
  ipAddress: string | null,
  succeeded: boolean,
): Promise<void> {
  try {
    await db.insert(adminLoginAttempts).values({ email, ipAddress, succeeded });
  } catch (error) {
    console.error("Could not record admin login attempt:", error);
  }
}

/**
 * Delete attempt rows older than the retention period.
 *
 * Nothing calls this on a schedule yet — the table grows slowly at this scale.
 * Wire it to a cron job if it ever gets large.
 */
export async function pruneOldAttempts(retentionDays = 90): Promise<void> {
  await db
    .delete(adminLoginAttempts)
    .where(
      sql`${adminLoginAttempts.attemptedAt} < now() - ${`${retentionDays} days`}::interval`,
    );
}
