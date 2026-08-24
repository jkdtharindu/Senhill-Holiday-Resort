/**
 * Day-detail derivation — the per-item breakdown behind one calendar date,
 * reached only after login (FR3/FR15). Unlike CalendarState (lib/calendar.ts),
 * which collapses a whole day to one of 4 colours, this resolves RoomStatus
 * per item: "Room 1: booked, Room 2: booked, Room 3: open" for a room-mode
 * day, or the villa's own status for a villa-mode day.
 *
 * Pure, like lib/calendar.ts: the caller fetches items + overlapping bookings
 * once, and this module decides each item's status from that snapshot. Guest
 * identity is deliberately NOT part of this module's output — that only gets
 * attached for an admin caller, by lib/day-detail-service.ts, never here.
 */

import type { RoomStatus } from "../db/schema.ts";
import { compareDates, type DateOnly } from "./dates.ts";

/** One bookable item (a Room, or the Villa) active on this date's mode. */
export interface DayDetailItemRow {
  id: string;
  name: string;
  capacity: number;
}

/**
 * One active booking that might overlap the date in question.
 * Only `reserved` and `booked` bookings count — a `declined` one never
 * affects RoomStatus.
 */
export interface DayDetailBookingRow {
  id: string;
  bookableItemId: string;
  status: "reserved" | "booked";
  checkIn: DateOnly;
  checkOut: DateOnly;
}

/** One item's status for the day-detail view. No guest identity here. */
export interface ItemStatus {
  itemId: string;
  name: string;
  capacity: number;
  status: RoomStatus;
  /** The overlapping booking's id, if any — admin service uses this to attach full detail. */
  bookingId: string | null;
}

/**
 * RoomStatus for every item offered on this date, given the mode already in
 * effect (the caller resolves DayMode before calling this — a `null` mode
 * means the date is `unavailable` and this function should not be called).
 *
 * `status` is `"booked"` if ANY active booking overlaps the date — RoomStatus
 * has only two values, so a `reserved` booking reads the same as `booked`
 * from this view: either way, it is not open for a new guest to select. The
 * finer reserved/booked distinction is admin-only detail (paymentStage,
 * approval votes), attached separately.
 *
 * Uses the same half-open range as CalendarState and booking conflict checks
 * (`checkIn` inclusive, `checkOut` exclusive) — see docs/DATABASE_SCHEMA.md.
 */
export function deriveItemStatuses(
  date: DateOnly,
  items: readonly DayDetailItemRow[],
  bookings: readonly DayDetailBookingRow[],
): ItemStatus[] {
  return items.map((item) => {
    const overlapping = bookings.find(
      (b) =>
        b.bookableItemId === item.id &&
        compareDates(b.checkIn, date) <= 0 &&
        compareDates(date, b.checkOut) < 0,
    );

    return {
      itemId: item.id,
      name: item.name,
      capacity: item.capacity,
      status: overlapping ? "booked" : "open",
      bookingId: overlapping?.id ?? null,
    };
  });
}
