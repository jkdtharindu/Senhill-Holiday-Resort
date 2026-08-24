/**
 * Database-backed orchestration for booking creation.
 *
 * Split from the pure validation in lib/booking.ts, same pattern as
 * lib/calendar-service.ts and lib/day-mode-service.ts: the route stays a
 * thin HTTP adapter, and this module owns the fetch-validate-write cycle.
 *
 * Re-validates a second time inside the write transaction (see
 * `createBooking`) — the fetch used to build the first validation and the
 * INSERT are not atomic on their own, so a second booking request for the
 * same night could theoretically land in the gap between them. Re-checking
 * inside the transaction narrows that window to the transaction's own
 * lifetime rather than closing it outright — this schema has no exclusion
 * constraint on overlapping date ranges, so a true guarantee would need one;
 * flagged as a follow-up, not a blocker for this slice's scope.
 */

import { and, eq, gt, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { bookableItems, bookings, dayModes, type Booking } from "@/db/schema";
import { nightsOfStay, type BookingWindow, type DateOnly } from "./dates";
import {
  validateBookingRequest,
  type BookingConflict,
  type BookingItemInfo,
} from "./booking";

/** Anything with drizzle's `.select()` — either the pooled `db` or a transaction handle. */
type Queryable = Pick<typeof db, "select">;

export interface CreateBookingInput {
  bookableItemId: string;
  customerId: string;
  guestName: string;
  phone: string;
  email: string;
  checkIn: DateOnly;
  checkOut: DateOnly;
  guestsCount: number;
}

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: string; conflictingDates?: BookingConflict[] };

async function loadItem(client: Queryable, itemId: string): Promise<BookingItemInfo | null> {
  const [row] = await client
    .select({
      id: bookableItems.id,
      kind: bookableItems.kind,
      capacity: bookableItems.capacity,
      active: bookableItems.active,
    })
    .from(bookableItems)
    .where(eq(bookableItems.id, itemId))
    .limit(1);
  return row ?? null;
}

async function loadDayModesForNights(
  client: Queryable,
  nights: readonly DateOnly[],
): Promise<Map<DateOnly, "room_mode" | "villa_mode">> {
  if (nights.length === 0) return new Map();
  const rows = await client
    .select({ date: dayModes.date, mode: dayModes.mode })
    .from(dayModes)
    .where(inArray(dayModes.date, nights as DateOnly[]));
  return new Map(rows.map((r) => [r.date, r.mode]));
}

/** Any active booking on this item overlapping [checkIn, checkOut) — same overlap shape as calendar-service.ts. */
async function loadExistingBookingsForItem(
  client: Queryable,
  itemId: string,
  checkIn: DateOnly,
  checkOut: DateOnly,
): Promise<{ checkIn: DateOnly; checkOut: DateOnly }[]> {
  return client
    .select({ checkIn: bookings.checkIn, checkOut: bookings.checkOut })
    .from(bookings)
    .where(
      and(
        eq(bookings.bookableItemId, itemId),
        inArray(bookings.status, ["reserved", "booked"]),
        lte(bookings.checkIn, checkOut),
        gt(bookings.checkOut, checkIn),
      ),
    );
}

/**
 * Fetch everything `validateBookingRequest` needs from `client` and run it.
 * Called once against the pooled `db` for the fast-fail check, then again
 * against the transaction handle immediately before the INSERT — same
 * function both times, so the two checks cannot drift apart on what counts
 * as a conflict.
 */
async function fetchAndValidate(client: Queryable, input: CreateBookingInput, window: BookingWindow) {
  const item = await loadItem(client, input.bookableItemId);
  const nights = nightsOfStay(input.checkIn, input.checkOut);

  const [dayModesByDate, existingBookings] = await Promise.all([
    loadDayModesForNights(client, nights),
    loadExistingBookingsForItem(client, input.bookableItemId, input.checkIn, input.checkOut),
  ]);

  return validateBookingRequest(
    { checkIn: input.checkIn, checkOut: input.checkOut, guestsCount: input.guestsCount },
    item,
    window,
    dayModesByDate,
    existingBookings,
  );
}

/**
 * Validate and, if the request clears every check, create the booking.
 *
 * `window` is passed in rather than computed here so the caller (the route)
 * is the one place that reads "now" — keeps this module testable against a
 * fixed window without mocking the clock.
 */
export async function createBooking(
  input: CreateBookingInput,
  window: BookingWindow,
): Promise<CreateBookingResult> {
  // Fast-fail check outside any transaction: most invalid requests (bad
  // dates, wrong capacity, a date genuinely unavailable) never need to open
  // one at all.
  const firstPass = await fetchAndValidate(db, input, window);
  if (!firstPass.ok) {
    return { ok: false, error: firstPass.error, conflictingDates: firstPass.conflictingDates };
  }

  return db.transaction(async (tx) => {
    const revalidated = await fetchAndValidate(tx, input, window);
    if (!revalidated.ok) {
      return { ok: false, error: revalidated.error, conflictingDates: revalidated.conflictingDates };
    }

    const [created] = await tx
      .insert(bookings)
      .values({
        bookableItemId: input.bookableItemId,
        customerId: input.customerId,
        guestName: input.guestName,
        phone: input.phone,
        email: input.email,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guestsCount: input.guestsCount,
        status: "reserved",
      })
      .returning();

    return { ok: true, booking: created };
  });
}
