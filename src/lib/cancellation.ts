/**
 * Cancellation rules — who may cancel what, and when.
 *
 * A cancellation is NOT a decline. A decline is the two-admin approval
 * process rejecting a request that was never confirmed (lib/vote.ts); a
 * cancellation calls off a booking that had already been accepted, or
 * withdraws a pending request the guest no longer wants. Both are terminal,
 * and neither can be undone — a cancelled booking stays cancelled, and the
 * guest re-books if they change their mind.
 *
 * Two actors, deliberately asymmetric (owner decision, 2026-08-26):
 *   - An ADMIN may cancel any booking that is still live, `reserved` or
 *     `booked` alike.
 *   - A GUEST may only withdraw their OWN booking, and only while it is
 *     `reserved`. Once two admins have confirmed a stay, an advance payment
 *     has usually been arranged offline (PRD §4/FR5b) — unwinding that is a
 *     conversation with staff, not a button.
 *
 * No approval vote is required. The two-admin rule exists to stop a date
 * being *held* carelessly; releasing one is the safe direction, and a single
 * decline already resolves a booking today without a second opinion.
 *
 * No refund is calculated here, and none should be. Pricing is out of scope
 * for this app (PRD §4) — it stores no room rates, only `advance_amount` as
 * a manual record of cash collected offline. A percentage computed against
 * that would describe the deposit, not the stay, and would read as
 * authoritative while being nothing of the sort. Cancellation records the
 * fact; an admin sets `payment_stage` to `refunded` through the existing
 * update route once they have actually returned the money.
 *
 * Kept pure, same pattern as lib/vote.ts and lib/booking.ts: the caller
 * fetches the booking once and this module decides, with no queries of its
 * own. Testable without a database, and the one place these rules live.
 */

import type { BookingStatus } from "../db/schema.ts";

/** Who is asking to cancel. A guest carries their own id so ownership is checked, not assumed. */
export type CancelActor =
  | { kind: "admin"; adminId: string; adminName: string }
  | { kind: "guest"; customerId: string };

/** The booking being cancelled, as much of it as the decision needs. */
export interface CancellableBooking {
  status: BookingStatus;
  customerId: string;
}

/**
 * Why a cancellation was refused.
 *
 * `not_owner` is reported to the caller as a 404, never a 403 — telling a
 * signed-in guest that someone else's booking id exists leaks the fact that
 * it exists at all. The distinction is kept here so the service layer can
 * still log it accurately.
 */
export type CancelRefusal =
  | { reason: "not_owner" }
  | { reason: "already_cancelled" }
  | { reason: "already_resolved"; currentStatus: BookingStatus }
  | { reason: "guest_cannot_cancel_confirmed" };

export type CancelDecision =
  | { ok: true }
  | { ok: false; refusal: CancelRefusal };

/** The statuses a booking can still be cancelled from. Everything else is terminal. */
const LIVE_STATUSES: readonly BookingStatus[] = ["reserved", "booked"];

/**
 * Decide whether `actor` may cancel `booking`.
 *
 * Ownership is checked before status, so a guest probing someone else's
 * booking id gets the same answer whatever state that booking is in — the
 * refusal cannot be used to discover another guest's booking status.
 */
export function decideCancellation(
  booking: CancellableBooking,
  actor: CancelActor,
): CancelDecision {
  if (actor.kind === "guest" && booking.customerId !== actor.customerId) {
    return { ok: false, refusal: { reason: "not_owner" } };
  }

  if (booking.status === "cancelled") {
    return { ok: false, refusal: { reason: "already_cancelled" } };
  }

  if (!LIVE_STATUSES.includes(booking.status)) {
    // `declined` — the approval process already resolved it. Cancelling a
    // booking that was never accepted would overwrite that decision in the
    // audit trail with a less accurate one.
    return {
      ok: false,
      refusal: { reason: "already_resolved", currentStatus: booking.status },
    };
  }

  if (actor.kind === "guest" && booking.status === "booked") {
    return { ok: false, refusal: { reason: "guest_cannot_cancel_confirmed" } };
  }

  return { ok: true };
}

/**
 * The message shown to whoever was refused.
 *
 * `not_owner` deliberately reads as "not found" — see `CancelRefusal`. The
 * guest-facing wording avoids the internal vocabulary (`reserved`, `booked`)
 * for the same reason BookingStatusBadge does: our approval process is not
 * the guest's concern. See docs/UBIQUITOUS_LANGUAGE.md.
 */
export function refusalMessage(
  refusal: CancelRefusal,
  audience: "admin" | "guest",
): string {
  switch (refusal.reason) {
    case "not_owner":
      return "Booking not found.";
    case "already_cancelled":
      return "This booking has already been cancelled.";
    case "already_resolved":
      return audience === "guest"
        ? "This request has already been closed and cannot be withdrawn."
        : `This booking is ${refusal.currentStatus} — it cannot be cancelled.`;
    case "guest_cannot_cancel_confirmed":
      return (
        "This stay is already confirmed, so it can't be cancelled here. " +
        "Please contact us and our team will take care of it with you."
      );
  }
}

/** HTTP status for each refusal. Ownership failures masquerade as 404 (see `CancelRefusal`). */
export function refusalHttpStatus(refusal: CancelRefusal): 404 | 409 | 403 {
  switch (refusal.reason) {
    case "not_owner":
      return 404;
    case "already_cancelled":
    case "already_resolved":
      return 409;
    case "guest_cannot_cancel_confirmed":
      return 403;
  }
}

/**
 * The `changed_by_name` recorded in `booking_audit_log` for a cancellation.
 *
 * A guest withdrawal has no admin row to point at — `changed_by` stays null
 * and this denormalized label carries the meaning instead, so the history
 * still reads correctly (schema.ts, `booking_audit_log`).
 */
export function actorAuditName(actor: CancelActor): string {
  return actor.kind === "admin" ? actor.adminName : "Guest (self-service)";
}

/** Max length accepted for a cancellation reason, so the audit trail stays readable. */
export const MAX_CANCELLATION_REASON = 500;

/** What a guest's withdrawal records as its reason when they give no wording of their own. */
export const GUEST_WITHDRAWAL_REASON = "Withdrawn by guest";
