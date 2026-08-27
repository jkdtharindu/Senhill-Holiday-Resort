/**
 * Database-backed orchestration for booking cancellation.
 *
 * Split from the pure rules in lib/cancellation.ts, same pattern as
 * lib/vote-service.ts and lib/booking-service.ts: the route stays a thin HTTP
 * adapter, and this module owns the fetch-decide-write cycle.
 *
 * Everything lands in one transaction: the status change, the three
 * cancellation columns, and the audit-log entries. A booking must never be
 * seen as `cancelled` without `cancelled_at` set (the schema's check
 * constraint would reject that anyway), and a status change must never appear
 * in `booking_audit_log` without the row itself having moved.
 *
 * The booking row is locked `FOR UPDATE` for the same reason vote-service.ts
 * locks it: two cancel requests arriving together must not both read a live
 * status and both apply. The second one queues, sees `cancelled`, and is
 * correctly refused 409 rather than overwriting the first one's record of who
 * cancelled and why.
 *
 * NOTE ON DATE RECOVERY: nothing here frees the dates explicitly, and nothing
 * should. Every date-blocking query in this app selects the statuses that
 * block by allowlist — `inArray(bookings.status, ["booked"])` in
 * booking-service.ts, `["reserved", "booked"]` in calendar-service.ts,
 * day-detail-service.ts, day-mode-service.ts and the bookable-items capacity
 * check. A cancelled booking drops out of all of them the moment its status
 * changes. Adding an explicit "free the dates" step would be a second source
 * of truth for availability, which ARCHITECTURE.md rules out for exactly this
 * reason. If a future query ever filters by excluding `declined` instead of
 * naming what blocks, that query — not this module — is the bug.
 */

import { eq, sql } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { bookableItems, bookingAuditLog, bookings, type BookingStatus } from "@/db/schema";
import {
  actorAuditName,
  decideCancellation,
  refusalHttpStatus,
  refusalMessage,
  type CancelActor,
  type CancelRefusal,
} from "./cancellation";
import { sendEmail } from "./email";
import { bookingCancelledEmail } from "./email-templates";

export interface CancelBookingInput {
  bookingId: string;
  actor: CancelActor;
  /** Free text, already trimmed and length-checked by the route. */
  reason: string;
}

export type CancelBookingResult =
  | {
      ok: true;
      previousStatus: BookingStatus;
      cancelledAt: Date;
      reason: string;
    }
  | { ok: false; status: 403 | 404 | 409; error: string; refusal: CancelRefusal };

/**
 * Cancel a booking, recording who did it and why, atomically.
 *
 * `audience` for the refusal wording is derived from the actor: a guest sees
 * guest-facing language, an admin sees the internal vocabulary.
 */
export async function cancelBooking(
  input: CancelBookingInput,
): Promise<CancelBookingResult> {
  const audience = input.actor.kind === "admin" ? "admin" : "guest";
  let notification: CancellationNotification | null = null;

  const result = await db.transaction(async (tx): Promise<CancelBookingResult> => {
    const [booking] = await tx
      .select({
        id: bookings.id,
        status: bookings.status,
        customerId: bookings.customerId,
        bookableItemId: bookings.bookableItemId,
        guestName: bookings.guestName,
        email: bookings.email,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        guestsCount: bookings.guestsCount,
      })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .for("update")
      .limit(1);

    if (!booking) {
      return {
        ok: false as const,
        status: 404 as const,
        error: "Booking not found.",
        refusal: { reason: "not_owner" } as CancelRefusal,
      };
    }

    const decision = decideCancellation(
      { status: booking.status, customerId: booking.customerId },
      input.actor,
    );

    if (!decision.ok) {
      return {
        ok: false as const,
        status: refusalHttpStatus(decision.refusal),
        error: refusalMessage(decision.refusal, audience),
        refusal: decision.refusal,
      };
    }

    // `cancelled_by` is null for a guest withdrawal — the column references
    // admin_users, and the absence of an admin is itself the record of who
    // acted (schema.ts). The audit log's denormalized name carries the
    // meaning for a reader.
    const cancelledBy =
      input.actor.kind === "admin" ? input.actor.adminId : null;
    const auditName = actorAuditName(input.actor);

    const [updated] = await tx
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledAt: sql`now()`,
        cancelledBy,
        cancellationReason: input.reason,
        updatedAt: sql`now()`,
      })
      .where(eq(bookings.id, input.bookingId))
      .returning({ cancelledAt: bookings.cancelledAt });

    // Two entries, not one: the status transition is the fact that matters
    // for availability, and the reason is the fact that matters in a dispute.
    // Keeping them separate means the history renders each with its own
    // old -> new pair, the same shape every other change uses.
    await tx.insert(bookingAuditLog).values([
      {
        bookingId: input.bookingId,
        changedBy: cancelledBy,
        changedByName: auditName,
        fieldChanged: "status",
        oldValue: booking.status,
        newValue: "cancelled",
      },
      {
        bookingId: input.bookingId,
        changedBy: cancelledBy,
        changedByName: auditName,
        fieldChanged: "cancellation_reason",
        oldValue: null,
        newValue: input.reason,
      },
    ]);

    notification = {
      bookingId: booking.id,
      bookableItemId: booking.bookableItemId,
      guestName: booking.guestName,
      email: booking.email,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guestsCount: booking.guestsCount,
      cancelledByGuestSelf: input.actor.kind === "guest",
    };

    return {
      ok: true as const,
      previousStatus: booking.status,
      // The check constraint guarantees this is set; the fallback only
      // satisfies the type when `returning()` gives back a nullable column.
      cancelledAt: updated?.cancelledAt ?? new Date(),
      reason: input.reason,
    };
  });

  // Fired only after the cancellation actually committed — same reasoning
  // as booking-service.ts and vote-service.ts: mail latency or failure must
  // never affect whether the cancellation itself succeeds. Uses `after()`,
  // not a bare fire-and-forget promise — see the comment in
  // booking-service.ts's `createBooking` for why: Vercel's serverless
  // runtime can freeze a function's execution once the response is sent,
  // and an unawaited promise left running past that point may never finish.
  if (result.ok && notification) {
    const toSend = notification;
    after(() =>
      notifyBookingCancelled(toSend).catch((err: unknown) => {
        console.error("[cancellation-service] notifyBookingCancelled failed:", err);
      }),
    );
  }

  return result;
}

interface CancellationNotification {
  bookingId: string;
  bookableItemId: string;
  guestName: string;
  email: string;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  cancelledByGuestSelf: boolean;
}

async function notifyBookingCancelled(input: CancellationNotification): Promise<void> {
  const [item] = await db
    .select({ name: bookableItems.name })
    .from(bookableItems)
    .where(eq(bookableItems.id, input.bookableItemId))
    .limit(1);
  const itemName = item?.name ?? "your booking";

  const content = bookingCancelledEmail({
    guestName: input.guestName,
    itemName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestsCount: input.guestsCount,
    cancelledByGuestSelf: input.cancelledByGuestSelf,
  });

  await sendEmail({
    to: input.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    event: "booking_cancelled",
    bookingId: input.bookingId,
  });
}
