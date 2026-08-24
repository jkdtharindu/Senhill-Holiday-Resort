/**
 * Database-backed orchestration for the admin comprehensive booking update
 * (Slice 10, `PUT /bookings/:id`).
 *
 * Split from the pure diff/validation logic in lib/booking-update.ts, same
 * pattern as lib/vote-service.ts: the route stays a thin HTTP adapter, and
 * this module owns the fetch-validate-write cycle.
 *
 * The row update and every resulting booking_audit_log entry happen inside
 * one transaction — a field must never appear changed without a matching
 * audit trail entry, and vice versa.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { bookingAuditLog, bookings } from "@/db/schema";
import { computeBookingUpdate, type BookingUpdateInput } from "./booking-update";

export interface UpdateBookingInput {
  bookingId: string;
  adminId: string;
  adminName: string; // denormalized into the audit log per schema
  patch: BookingUpdateInput;
}

export type UpdateBookingResult =
  | { ok: true; changedFields: string[] }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 400; error: string };

export async function updateBooking(
  input: UpdateBookingInput,
): Promise<UpdateBookingResult> {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select({
        guestName: bookings.guestName,
        phone: bookings.phone,
        email: bookings.email,
        paymentStage: bookings.paymentStage,
        advanceAmount: bookings.advanceAmount,
        advancePaidDate: bookings.advancePaidDate,
        internalNotes: bookings.internalNotes,
      })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .for("update")
      .limit(1);

    if (!booking) {
      return { ok: false, status: 404 as const, error: "Booking not found." };
    }

    const outcome = computeBookingUpdate(booking, input.patch);
    if (!outcome.ok) {
      return { ok: false, status: 400 as const, error: outcome.error };
    }

    if (outcome.changes.length === 0) {
      return { ok: true, changedFields: [] };
    }

    const patch = input.patch;
    await tx
      .update(bookings)
      .set({
        ...(patch.guestName !== undefined && { guestName: patch.guestName }),
        ...(patch.phone !== undefined && { phone: patch.phone }),
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.paymentStage !== undefined && { paymentStage: patch.paymentStage }),
        ...(patch.advanceAmount !== undefined && { advanceAmount: patch.advanceAmount }),
        ...(patch.advancePaidDate !== undefined && {
          advancePaidDate: patch.advancePaidDate,
        }),
        ...(patch.internalNotes !== undefined && { internalNotes: patch.internalNotes }),
        updatedAt: sql`now()`,
      })
      .where(eq(bookings.id, input.bookingId));

    await tx.insert(bookingAuditLog).values(
      outcome.changes.map((c) => ({
        bookingId: input.bookingId,
        changedBy: input.adminId,
        changedByName: input.adminName,
        fieldChanged: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
      })),
    );

    return { ok: true, changedFields: outcome.changes.map((c) => c.field) };
  });
}
