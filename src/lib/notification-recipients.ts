/**
 * Recipient lookups for booking-lifecycle emails.
 *
 * Separate from lib/email.ts (which only knows how to send) and from
 * admin_users' own route module — this is the one place that decides WHO
 * gets an admin alert, so that rule lives in exactly one query.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { restrictAdminRecipients } from "./email-log";

/**
 * Every admin who should receive a "new booking" alert.
 *
 * Deactivated admins are excluded — an admin who can no longer sign in or
 * vote has no use for an alert telling them to. If this ever returns an
 * empty list (e.g. mid-transition between admins), the caller still sends
 * the guest's own confirmation; a missing admin alert is a visibility gap,
 * not a reason to fail the booking itself.
 */
export async function getActiveAdminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.active, true));
  const all = rows.map((r) => r.email);

  // TEMPORARY, removed by unsetting EMAIL_RESTRICT_TO once a domain is
  // verified in Resend. See restrictAdminRecipients in lib/email-log.ts for
  // why this exists — an unverified account rejects the whole send if any
  // non-owner recipient is present, so an unrestricted list means NOBODY is
  // alerted rather than merely some people.
  const { recipients, suppressed } = restrictAdminRecipients(
    all,
    process.env.EMAIL_RESTRICT_TO,
  );

  if (suppressed.length > 0) {
    // Warned every time rather than once: an admin silently not being told
    // about new bookings is exactly the kind of gap that should stay noisy
    // until it is fixed properly.
    console.warn(
      `[email] Admin alert restricted to ${recipients.join(", ") || "(nobody)"} — ` +
        `${suppressed.length} admin(s) not notified: ${suppressed.join(", ")}. ` +
        `Verify a sending domain in Resend and unset EMAIL_RESTRICT_TO to restore.`,
    );
  }

  return recipients;
}
