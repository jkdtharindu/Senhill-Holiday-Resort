/**
 * Pure logic for the admin comprehensive booking update (Slice 10,
 * `PUT /bookings/:id`, docs/API_DOCUMENTATION.md).
 *
 * Updatable fields: guest_name, phone (compulsory), email, payment_stage,
 * advance_amount, advance_paid_date, internal_notes. Status is deliberately
 * excluded — it only changes via /vote or an explicit cancel endpoint, never
 * through this route, so a caller cannot sidestep the two-admin approval
 * process by PUTing a new status.
 *
 * Kept pure, same pattern as lib/vote.ts and lib/booking.ts: given the
 * current row and the requested patch, decide what's valid and compute the
 * exact set of audit-log-worthy field changes. The caller (the service
 * module) owns the fetch and the write.
 */

import type { Booking, PaymentStage } from "../db/schema.ts";

export interface BookingUpdateInput {
  guestName?: string;
  phone?: string;
  email?: string;
  paymentStage?: PaymentStage;
  advanceAmount?: string | null;
  advancePaidDate?: string | null;
  internalNotes?: string;
}

export interface FieldChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export type BookingUpdateOutcome =
  | { ok: true; changes: FieldChange[] }
  | { ok: false; error: string };

const CURRENT_BOOKING_FIELDS: Array<keyof BookingUpdateInput> = [
  "guestName",
  "phone",
  "email",
  "paymentStage",
  "advanceAmount",
  "advancePaidDate",
  "internalNotes",
];

/**
 * Validate a requested patch against the current booking row and compute
 * the field-level diff to write and audit-log.
 *
 * Fields absent from `input` are left untouched. Fields present are
 * validated and compared against the current value — a field set to its
 * current value produces no change entry, so a no-op PUT writes nothing to
 * `booking_audit_log`.
 */
export function computeBookingUpdate(
  current: Pick<
    Booking,
    | "guestName"
    | "phone"
    | "email"
    | "paymentStage"
    | "advanceAmount"
    | "advancePaidDate"
    | "internalNotes"
  >,
  input: BookingUpdateInput,
): BookingUpdateOutcome {
  const touched = CURRENT_BOOKING_FIELDS.filter((f) => input[f] !== undefined);
  if (touched.length === 0) {
    return { ok: false, error: "No updatable fields were provided." };
  }

  if (input.phone !== undefined && input.phone.trim() === "") {
    return { ok: false, error: "Phone is compulsory and cannot be blank." };
  }

  if (input.guestName !== undefined && input.guestName.trim() === "") {
    return { ok: false, error: "Guest name cannot be blank." };
  }

  if (input.advanceAmount !== undefined && input.advanceAmount !== null) {
    const n = Number(input.advanceAmount);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "advanceAmount must be a non-negative number." };
    }
  }

  if (
    input.advancePaidDate !== undefined &&
    input.advancePaidDate !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(input.advancePaidDate)
  ) {
    return { ok: false, error: "advancePaidDate must be an ISO date (YYYY-MM-DD)." };
  }

  const changes: FieldChange[] = [];

  const pushIfChanged = (
    field: string,
    oldValue: string | null,
    newValue: string | null,
  ) => {
    if (oldValue !== newValue) {
      changes.push({ field, oldValue, newValue });
    }
  };

  if (input.guestName !== undefined) {
    pushIfChanged("guest_name", current.guestName, input.guestName);
  }
  if (input.phone !== undefined) {
    pushIfChanged("phone", current.phone, input.phone);
  }
  if (input.email !== undefined) {
    pushIfChanged("email", current.email, input.email);
  }
  if (input.paymentStage !== undefined) {
    pushIfChanged("payment_stage", current.paymentStage, input.paymentStage);
  }
  if (input.advanceAmount !== undefined) {
    pushIfChanged("advance_amount", current.advanceAmount, input.advanceAmount);
  }
  if (input.advancePaidDate !== undefined) {
    pushIfChanged("advance_paid_date", current.advancePaidDate, input.advancePaidDate);
  }
  if (input.internalNotes !== undefined) {
    pushIfChanged("internal_notes", current.internalNotes, input.internalNotes);
  }

  return { ok: true, changes };
}
