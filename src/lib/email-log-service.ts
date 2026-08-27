/**
 * Database-backed orchestration for the email log.
 *
 * Split from the pure policy in lib/email-log.ts, same pattern as
 * day-mode-service.ts and vote-service.ts.
 *
 * EVERY function here is failure-tolerant by design and never throws. This
 * module exists to make email observable — if logging itself could throw, it
 * would become a new way for a mail problem to break a booking, which is
 * exactly the coupling the whole email feature was built to avoid. A logging
 * system that can take down the thing it observes is worse than no logging.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { todayAtResort } from "./dates";
import type { EmailEvent, EmailOutcome } from "./email-log";

export interface RecordEmailSendInput {
  event: EmailEvent;
  outcome: EmailOutcome;
  recipients: string[];
  subject: string;
  errorMessage?: string;
  bookingId?: string;
}

/**
 * Write one attempt to the log. Never throws.
 *
 * A failure here is logged to the console and dropped — losing a log row is
 * bad, but not as bad as letting the log break the send path it is watching.
 */
export async function recordEmailSend(input: RecordEmailSendInput): Promise<void> {
  try {
    await db.insert(emailLog).values({
      event: input.event,
      outcome: input.outcome,
      recipients: input.recipients.join(", "),
      recipientCount: input.recipients.length,
      subject: input.subject,
      errorMessage: input.errorMessage ?? null,
      bookingId: input.bookingId ?? null,
      sentOn: todayAtResort(),
    });
  } catch (err) {
    console.error("[email-log] Failed to record a send attempt:", err);
  }
}

/**
 * How many RECIPIENTS have been mailed today, resort-local.
 *
 * Counts only attempts that actually consumed provider quota (`sent` and
 * `failed` — a failure still reached Resend and may still have counted).
 * Deliberately excludes `skipped_no_api_key` and `blocked_daily_limit`,
 * which never touched the network: counting a blocked attempt would make the
 * breaker self-reinforcing, keeping itself latched once tripped.
 *
 * Returns `null` — never throws — if the count cannot be read. Callers must
 * treat `null` as "unknown" and FAIL OPEN, because a transient database
 * hiccup silently suppressing a real guest's booking confirmation is a worse
 * outcome than briefly overshooting a self-imposed limit that already sits
 * below the provider's own.
 */
export async function countRecipientsSentToday(): Promise<number | null> {
  try {
    const [row] = await db
      .select({
        total: sql<number>`coalesce(sum(${emailLog.recipientCount}), 0)::int`,
      })
      .from(emailLog)
      .where(
        and(
          eq(emailLog.sentOn, todayAtResort()),
          sql`${emailLog.outcome} in ('sent', 'failed')`,
        ),
      );
    return row?.total ?? 0;
  } catch (err) {
    console.error("[email-log] Failed to count today's sends:", err);
    return null;
  }
}

export interface EmailLogEntry {
  id: string;
  event: EmailEvent;
  outcome: EmailOutcome;
  recipients: string;
  subject: string;
  errorMessage: string | null;
  sentAt: Date;
}

/**
 * The most recent attempts, newest first — for the admin dashboard.
 *
 * Returns `[]` rather than throwing if the read fails; a dashboard panel
 * that cannot load its data should render empty, not 500 the whole page an
 * admin needs for everything else.
 */
export async function fetchRecentEmailLog(limit = 10): Promise<EmailLogEntry[]> {
  try {
    return await db
      .select({
        id: emailLog.id,
        event: emailLog.event,
        outcome: emailLog.outcome,
        recipients: emailLog.recipients,
        subject: emailLog.subject,
        errorMessage: emailLog.errorMessage,
        sentAt: emailLog.sentAt,
      })
      .from(emailLog)
      .orderBy(desc(emailLog.sentAt))
      .limit(limit);
  } catch (err) {
    console.error("[email-log] Failed to fetch recent entries:", err);
    return [];
  }
}

/** Count of attempts that reached the provider and were rejected, today. */
export async function countFailuresToday(): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(emailLog)
      .where(
        and(eq(emailLog.sentOn, todayAtResort()), eq(emailLog.outcome, "failed")),
      );
    return row?.total ?? 0;
  } catch (err) {
    console.error("[email-log] Failed to count today's failures:", err);
    return 0;
  }
}
