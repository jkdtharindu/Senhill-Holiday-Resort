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
  return rows.map((r) => r.email);
}
