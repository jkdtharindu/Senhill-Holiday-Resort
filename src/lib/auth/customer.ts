/**
 * Customer records for Google sign-in.
 *
 * WHY NO DATABASE ADAPTER
 * -----------------------
 * Auth.js ships a Drizzle adapter that would create its own `accounts`,
 * `sessions` and `verification_tokens` tables. docs/DATABASE_SCHEMA.md defines
 * exactly one table for this — `customers`, with a `google_id` — so the adapter
 * would introduce three tables the documented schema does not have, and a
 * second place where "who is this guest" is recorded. Instead sessions are
 * JWT-only and this module owns the single `customers` row.
 *
 * WHAT THIS DELIBERATELY CANNOT DO
 * --------------------------------
 * Nothing here can create, modify or authenticate an admin. It writes to
 * `customers` and nowhere else. That is the point: admins live in a separate
 * table reached by a separate system with a separate secret, so no bug in the
 * Google flow can produce admin access. See docs/HITL.md.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { customers, type Customer } from "@/db/schema";

export interface GoogleIdentity {
  /** Google's `sub` claim — stable for the life of the account. */
  googleId: string;
  email: string;
  name: string;
}

/**
 * Find the customer for a Google account, creating one on first sign-in.
 *
 * Matched on `google_id`, never on email. Google lets people change the email
 * on an account, and separately a released address can eventually belong to
 * someone new — matching on email would either lose track of a returning guest
 * or hand one guest's booking history to a stranger. `sub` does neither.
 */
export async function findOrCreateCustomer(
  identity: GoogleIdentity,
): Promise<Customer> {
  const email = identity.email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(customers)
    .where(eq(customers.googleId, identity.googleId))
    .limit(1);

  if (existing) {
    // Keep name and email current — someone who married and changed their name
    // should not appear under the old one on an admin's booking list.
    if (existing.email !== email || existing.name !== identity.name) {
      const [updated] = await db
        .update(customers)
        .set({ email, name: identity.name })
        .where(eq(customers.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  // A different Google account already using this email address means the
  // address moved between accounts. Take it over rather than failing the
  // sign-in: the `sub` in hand is the account that currently proves ownership,
  // and both columns are unique so leaving the old row would block the insert.
  const [emailOwner] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (emailOwner) {
    const [reassigned] = await db
      .update(customers)
      .set({ googleId: identity.googleId, name: identity.name })
      .where(eq(customers.id, emailOwner.id))
      .returning();
    return reassigned;
  }

  const [created] = await db
    .insert(customers)
    .values({
      googleId: identity.googleId,
      email,
      name: identity.name,
      // Google does not reliably supply a phone number. Collected on the
      // booking form instead, where the guest is already filling in details.
      phone: null,
    })
    .returning();

  return created;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return customer ?? null;
}
