/**
 * Resend client wrapper — the single place that talks to the email provider.
 *
 * Deliberately best-effort: a booking, vote, or cancellation must still
 * succeed even if the email provider is down, misconfigured, or the address
 * bounces. `sendEmail` swallows its own errors (logged, never thrown) so a
 * caller can fire-and-forget it after a write has already committed, rather
 * than making guest-facing availability depend on a third-party mail API.
 *
 * `RESEND_API_KEY` is optional at runtime on purpose — local dev or a
 * preview deploy without the key configured should not crash the app, it
 * should just skip sending (logged) so the rest of the feature is still
 * testable.
 */

import { Resend } from "resend";

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
  /** Guest replies should reach the property's inbox, not the sending address. */
  replyTo?: string;
}

/**
 * Send one email. Never throws — logs and returns on any failure, including
 * a missing API key. Callers use this after their own write has already
 * committed, so a mail failure here must never look like the underlying
 * booking/vote/cancellation operation failed.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${input.subject}" to ${input.to}`);
    return;
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
      console.error(`[email] Resend rejected "${input.subject}" to ${input.to}:`, error);
    }
  } catch (err) {
    console.error(`[email] Failed to send "${input.subject}" to ${input.to}:`, err);
  }
}
