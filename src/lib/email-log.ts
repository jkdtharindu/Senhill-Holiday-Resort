/**
 * Email volume policy — pure decisions, no database.
 *
 * Exists because of the 2026-08-27 incident (see MEMORY.md): the email
 * feature sent nothing in production for hours and there was no record
 * anywhere to notice it from. `sendEmail` swallows its own errors by design
 * so mail can never break a booking, which is correct — but it means the
 * only way to know what happened is to write it down.
 *
 * Two separate jobs, deliberately not conflated:
 *   - `volumeLevel` describes a day's traffic for a human reading the
 *     dashboard.
 *   - `decideSendAllowed` is a circuit breaker that actually stops sending.
 *
 * Kept pure, same pattern as lib/day-mode.ts and lib/vote.ts: the caller
 * fetches the count, this module decides. Testable with no database.
 */

/** Every kind of email this app sends. One value per template. */
export const EMAIL_EVENTS = [
  "booking_confirmation",
  "admin_new_booking_alert",
  "booking_approved",
  "booking_declined",
  "booking_cancelled",
] as const;

export type EmailEvent = (typeof EMAIL_EVENTS)[number];

/**
 * What happened to one send attempt.
 *
 * `skipped_no_api_key` is distinct from `failed` on purpose: the former is
 * an expected local-dev/preview state, the latter means the provider was
 * reached and said no. Collapsing them would make a real outage look like
 * a config gap on the dashboard.
 */
export const EMAIL_OUTCOMES = [
  "sent",
  "failed",
  "skipped_no_api_key",
  "blocked_daily_limit",
] as const;

export type EmailOutcome = (typeof EMAIL_OUTCOMES)[number];

/**
 * Volume at which the dashboard starts saying something looks unusual.
 *
 * Sized against real capacity, not the mail plan: 3 rooms plus a villa,
 * ~2 emails per booking, means a busy legitimate day is single digits.
 * Thirty is already far outside normal and worth a human looking, while
 * being high enough not to cry wolf during a burst of admin activity.
 */
export const DAILY_WARN_THRESHOLD = 30;

/**
 * Hard stop. Past this, `sendEmail` refuses to send for the rest of the
 * resort-local day.
 *
 * Deliberately below Resend's 100/day free-tier cap rather than at it, for
 * two reasons: it leaves headroom to send something by hand while a problem
 * is being investigated, and a multi-recipient send (the admin alert goes to
 * every active admin) may count as more than one against the provider's
 * quota — the gap absorbs that uncertainty rather than discovering it at the
 * cap.
 *
 * This is runaway protection, NOT prioritisation: it cannot tell a guest
 * confirmation from a loop, and will block both alike. That bluntness is
 * the point — at these volumes, crossing this line means something is
 * wrong, and stopping is the safe failure.
 */
export const DAILY_SEND_LIMIT = 80;

export type SendDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * May another email go out, given how many recipients have already been
 * mailed today?
 *
 * Counted in RECIPIENTS, not send calls — one admin alert to three admins
 * is three deliveries as far as any provider quota is concerned, and
 * counting calls would undercount exactly when volume matters most.
 */
export function decideSendAllowed(recipientsSentToday: number): SendDecision {
  if (recipientsSentToday >= DAILY_SEND_LIMIT) {
    return {
      allowed: false,
      reason:
        `Daily email limit reached (${recipientsSentToday}/${DAILY_SEND_LIMIT} ` +
        `recipients today). Sending is paused until tomorrow — this is a safety ` +
        `stop, so check for a send loop or unusual booking activity.`,
    };
  }
  return { allowed: true };
}

/** How a day's volume should read to a human. */
export type VolumeLevel = "normal" | "elevated" | "at_limit";

export function volumeLevel(recipientsSentToday: number): VolumeLevel {
  if (recipientsSentToday >= DAILY_SEND_LIMIT) return "at_limit";
  if (recipientsSentToday >= DAILY_WARN_THRESHOLD) return "elevated";
  return "normal";
}
