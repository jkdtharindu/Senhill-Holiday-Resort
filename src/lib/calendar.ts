/**
 * CalendarState derivation — the 4-colour view shown on the month/week/year
 * calendar, to everyone, public and logged-in customers alike.
 *
 * Deliberately not a stored column anywhere (docs/ARCHITECTURE.md, "Why
 * CalendarState is derived, not stored") — it is computed here from
 * `day_modes` and `bookings` at query time, so there is exactly one place this
 * rule lives, reused by every endpoint that needs it rather than
 * reimplemented per route.
 *
 * Pure, like lib/day-mode.ts: the caller fetches everything from the database
 * once, and every date's colour is decided from that snapshot with no further
 * queries. See docs/PRD.md §9 and docs/DATABASE_SCHEMA.md, "Derived values",
 * for the rule table this implements.
 */

import type { CalendarState, DayModeKind } from "../db/schema.ts";
import { compareDates, type DateOnly } from "./dates.ts";
import { itemKindForMode } from "./day-mode.ts";

/**
 * One active booking, as needed to decide a date's colour.
 *
 * `itemActive` matters: a booking against a room or the villa that has since
 * been deactivated should not count toward "every room taken" for currently
 * offered inventory, nor toward the villa's own status — CalendarState
 * describes what is bookable *now*, not a historical snapshot including
 * inventory nobody can book any more.
 */
export interface CalendarBookingRow {
  bookableItemId: string;
  itemKind: "room" | "villa";
  itemActive: boolean;
  status: "reserved" | "booked";
  checkIn: DateOnly;
  checkOut: DateOnly;
}

/** How many currently-active Rooms and Villas exist, for the room-mode "all taken" test. */
export interface ActiveItemCounts {
  room: number;
  villa: number;
}

/**
 * The colour for one date, given what mode (if any) applies and which
 * bookings are active.
 *
 * - No mode set → `unavailable`. The admin has not opened this date.
 * - room_mode → `open` if no active room is taken; `booked` if every active
 *   room is taken; `reserved` otherwise. Zero active rooms is treated as
 *   `open` — vacuously nothing is taken, and there is nothing to show as
 *   fully booked.
 * - villa_mode → mirrors the villa's own booking status: `booked` if a
 *   `booked` villa booking overlaps the date, else `reserved` if a `reserved`
 *   one does, else `open`. `booked` wins over `reserved` if both somehow
 *   overlap the same date — the derivation should never crash on an anomalous
 *   state even though a later slice's validation should prevent it occurring.
 */
export function deriveCalendarState(
  date: DateOnly,
  mode: DayModeKind | null,
  bookings: readonly CalendarBookingRow[],
  activeCounts: ActiveItemCounts,
): CalendarState {
  if (mode === null) return "unavailable";

  const kind = itemKindForMode(mode);
  const overlapping = bookings.filter(
    (b) =>
      b.itemKind === kind &&
      b.itemActive &&
      compareDates(b.checkIn, date) <= 0 &&
      compareDates(date, b.checkOut) < 0,
  );

  if (kind === "room") {
    const bookedRoomIds = new Set(overlapping.map((b) => b.bookableItemId));
    const taken = bookedRoomIds.size;
    const total = activeCounts.room;
    if (taken === 0) return "open";
    if (total > 0 && taken >= total) return "booked";
    return "reserved";
  }

  // villa_mode
  if (overlapping.some((b) => b.status === "booked")) return "booked";
  if (overlapping.some((b) => b.status === "reserved")) return "reserved";
  return "open";
}

export interface CalendarDay {
  date: DateOnly;
  dayMode: DayModeKind | null;
  state: CalendarState;
}

/** Derive every date's colour in one pass over a shared booking snapshot. */
export function deriveCalendarDays(
  dates: readonly DateOnly[],
  dayModesByDate: ReadonlyMap<DateOnly, DayModeKind>,
  bookings: readonly CalendarBookingRow[],
  activeCounts: ActiveItemCounts,
): CalendarDay[] {
  return dates.map((date) => {
    const mode = dayModesByDate.get(date) ?? null;
    return {
      date,
      dayMode: mode,
      state: deriveCalendarState(date, mode, bookings, activeCounts),
    };
  });
}
