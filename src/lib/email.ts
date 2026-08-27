/**
 * Resend client wrapper — the single place that talks to the email provider.
 *
 * Deliberately best-effort: a booking, vote, or cancellation must still
 * succeed even if the email provider is down, misconfigured, or the address
 * bounces. `sendEmail` swallows its own errors (logged and recorded, never
 * thrown) so a caller can schedule it after a write has already committed,
 * rather than making guest-facing availability depend on a third-party mail
 * API.
 *
 * IMPORTANT — callers must schedule this with `after()` from `next/server`,
 * never a bare `void sendEmail(...)`. Vercel's serverless runtime can freeze
 * a function the instant its response is sent, and an unawaited promise still
 * in flight then may simply never run. That exact mistake shipped on
 * 2026-08-27 and sent zero emails in production while passing every local
 * check; see MEMORY.md for the post-mortem.
 *
 * `RESEND_API_KEY` is optional at runtime on purpose — local dev or a
 * preview deploy without the key configured should not crash the app, it
 * should just skip sending (logged) so the rest of the feature is still
 * testable.
 *
 * Every path through this function records exactly one row in `email_log`,
 * including the ones that never reach the network. That table is the only
 * reason a total mail outage is noticeable at all.
 */

import { Resend } from "resend";

import { decideSendAllowed, type EmailEvent } from "./email-log";
import { countRecipientsSentToday, recordEmailSend } from "./email-log-service";

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "Senhill Holiday Resort <onboarding@resend.dev>";

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Which template this is — recorded against the send for later diagnosis. */
  event: EmailEvent;
  /** The booking this concerns, when there is one. */
  bookingId?: string;
  /** Guest replies should reach the property's inbox, not the sending address. */
  replyTo?: string;
}

/**
 * Send one email. Never throws — logs, records, and returns on any failure,
 * including a missing API key or a tripped volume breaker.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  const resend = getClient();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${input.subject}" to ${recipients.join(", ")}`);
    await recordEmailSend({
      event: input.event,
      outcome: "skipped_no_api_key",
      recipients,
      subject: input.subject,
      bookingId: input.bookingId,
    });
    return;
  }

  // Volume circuit breaker. `null` means the count could not be read — fail
  // OPEN and send anyway (see countRecipientsSentToday): a database hiccup
  // must not quietly suppress a real guest's confirmation, and the limit
  // already sits below the provider's own cap.
  const sentToday = await countRecipientsSentToday();
  if (sentToday !== null) {
    const decision = decideSendAllowed(sentToday);
    if (!decision.allowed) {
      console.error(`[email] BLOCKED "${input.subject}": ${decision.reason}`);
      await recordEmailSend({
        event: input.event,
        outcome: "blocked_daily_limit",
        recipients,
        subject: input.subject,
        errorMessage: decision.reason,
        bookingId: input.bookingId,
      });
      return;
    }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    if (error) {
      console.error(`[email] Resend rejected "${input.subject}" to ${recipients.join(", ")}:`, error);
      await recordEmailSend({
        event: input.event,
        outcome: "failed",
        recipients,
        subject: input.subject,
        errorMessage: `${error.name}: ${error.message}`,
        bookingId: input.bookingId,
      });
      return;
    }

    await recordEmailSend({
      event: input.event,
      outcome: "sent",
      recipients,
      subject: input.subject,
      bookingId: input.bookingId,
    });
  } catch (err) {
    console.error(`[email] Failed to send "${input.subject}" to ${recipients.join(", ")}:`, err);
    await recordEmailSend({
      event: input.event,
      outcome: "failed",
      recipients,
      subject: input.subject,
      errorMessage: err instanceof Error ? err.message : String(err),
      bookingId: input.bookingId,
    });
  }
}
