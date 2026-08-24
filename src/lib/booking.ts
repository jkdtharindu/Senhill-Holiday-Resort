/**
 * Booking creation validation — FR5/FR5a, the strictest rule in the system.
 *
 * A request covers a range of nights against ONE BookableItem. The whole
 * request is rejected outright if ANY night in the range fails one of three
 * checks — no partial-booking, no auto-splitting (PRD §4). Unlike
 * DayModeSwitchBlock's per-date outcome list (lib/day-mode.ts), which reports
 * a mix of updated/blocked dates because a bulk write is meant to partially
 * succeed, a booking is all-or-nothing: the response names every conflicting
 * night so the guest can see exactly what to change, but nothing is created
 * unless every night clears.
 *
 * Kept pure, same reasoning as lib/day-mode.ts and lib/calendar.ts: the
 * caller fetches DayMode + overlapping bookings for the item once, and this
 * module decides from that snapshot with no further queries — testable
 * without a database, and the one place this rule lives rather than
 * reimplemented per caller.
 */

import type { DayModeKind } from "../db/schema.ts";
import { itemKindForMode } from "./day-mode.ts";
import {
  compareDates,
  nightsOfStay,
  type BookingWindow,
  type DateOnly,
} from "./dates.ts";

/** One night's conflict, naming why it blocks the request. */
export interface BookingConflict {
  date: DateOnly;
  reason:
    | "unavailable" // no DayMode set for this date at all
    | "day_mode_mismatch" // DayMode is set, but to the other item kind
    | "already_booked"; // a reserved/booked booking already occupies this item on this date
}

export type BookingValidationResult =
  | { ok: true }
  | { ok: false; error: string; conflictingDates?: BookingConflict[] };

/** The item being booked, as needed to validate a request against it. */
export interface BookingItemInfo {
  id: string;
  kind: "room" | "villa";
  capacity: number;
  active: boolean;
}

/** An existing active booking against the SAME item, as needed for conflict detection. */
export interface ExistingBookingRange {
  checkIn: DateOnly;
  checkOut: DateOnly;
}

export interface BookingRequestInput {
  checkIn: DateOnly;
  checkOut: DateOnly;
  guestsCount: number;
}

/**
 * Validate a booking request against a pre-fetched snapshot: the target
 * item, every night's DayMode (nights with no entry in the map have none
 * set), the window customers may book within, and the item's own existing
 * active bookings.
 *
 * Order of checks: item existence/active, then guest count vs capacity, then
 * every night's window/DayMode/conflict status collected together — a
 * mismatched item or an over-capacity request is a single clear error, but
 * per-night problems are collected as a batch so the guest sees the whole
 * picture in one round trip rather than fixing one date at a time.
 */
export function validateBookingRequest(
  request: BookingRequestInput,
  item: BookingItemInfo | null,
  window: BookingWindow,
  dayModesByDate: ReadonlyMap<DateOnly, DayModeKind>,
  existingBookings: readonly ExistingBookingRange[],
): BookingValidationResult {
  if (!item || !item.active) {
    return { ok: false, error: "This room or villa is not available for booking." };
  }

  if (compareDates(request.checkIn, request.checkOut) >= 0) {
    return { ok: false, error: "`check_out` must be after `check_in`." };
  }

  if (request.guestsCount <= 0) {
    return { ok: false, error: "`guests_count` must be at least 1." };
  }

  if (request.guestsCount > item.capacity) {
    return {
      ok: false,
      error: `This ${item.kind} sleeps at most ${item.capacity} guests.`,
    };
  }

  const nights = nightsOfStay(request.checkIn, request.checkOut);

  const outOfWindow = nights.some(
    (night) => compareDates(night, window.from) < 0 || compareDates(night, window.to) > 0,
  );
  if (outOfWindow) {
    return {
      ok: false,
      error: `Bookings may only be made from ${window.from} through ${window.to}.`,
    };
  }

  const conflicts: BookingConflict[] = [];

  for (const night of nights) {
    const mode = dayModesByDate.get(night);

    if (mode === undefined) {
      conflicts.push({ date: night, reason: "unavailable" });
      continue;
    }

    if (itemKindForMode(mode) !== item.kind) {
      conflicts.push({ date: night, reason: "day_mode_mismatch" });
      continue;
    }

    const isTaken = existingBookings.some(
      (b) => compareDates(b.checkIn, night) <= 0 && compareDates(night, b.checkOut) < 0,
    );
    if (isTaken) {
      conflicts.push({ date: night, reason: "already_booked" });
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      error: "Some requested dates are unavailable.",
      conflictingDates: conflicts,
    };
  }

  return { ok: true };
}

/**
 * Fixed text shown to the guest on a successful booking — never an amount,
 * never calculated. Advance payment is arranged manually, outside the app
 * (PRD §4/FR5b).
 */
export const ADVANCE_PAYMENT_NOTICE =
  "Thank you — your booking request has been received and is pending approval. " +
  "An advance payment is required to confirm it; our team will contact you with the details.";
