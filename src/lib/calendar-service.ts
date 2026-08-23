/**
 * Database-backed orchestration for CalendarState.
 *
 * Split from the pure derivation in lib/calendar.ts, and shared by both the
 * public API route and any server-rendered page that wants the same
 * calendar — same pattern as lib/day-mode-service.ts, so the fetch-derive
 * cycle exists in exactly one place rather than being copied per caller.
 */

import { and, count, eq, gt, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { bookableItems, bookings, dayModes } from "@/db/schema";
import {
  clampToBookingWindow,
  currentBookingWindow,
  datesInclusive,
  type DateOnly,
} from "./dates";
import {
  deriveCalendarDays,
  type ActiveItemCounts,
  type CalendarBookingRow,
  type CalendarDay,
} from "./calendar";

/**
 * CalendarState for every date in `[from, to]`, clamped to the 90-day
 * BookingWindow. Returns an empty array if the requested range falls
 * entirely outside the window — see docs/API_DOCUMENTATION.md.
 */
export async function fetchCalendarDays(
  from: DateOnly,
  to: DateOnly,
): Promise<CalendarDay[]> {
  const clamped = clampToBookingWindow(from, to, currentBookingWindow());
  if (clamped === null) return [];

  const dates = datesInclusive(clamped.from, clamped.to);

  const dayModeRows = await db
    .select({ date: dayModes.date, mode: dayModes.mode })
    .from(dayModes)
    .where(inArray(dayModes.date, dates));
  const dayModesByDate = new Map(dayModeRows.map((r) => [r.date, r.mode]));

  const itemCountRows = await db
    .select({ kind: bookableItems.kind, n: count() })
    .from(bookableItems)
    .where(eq(bookableItems.active, true))
    .groupBy(bookableItems.kind);
  const activeCounts: ActiveItemCounts = { room: 0, villa: 0 };
  for (const row of itemCountRows) activeCounts[row.kind] = row.n;

  const rawBookingRows = await db
    .select({
      bookableItemId: bookings.bookableItemId,
      itemKind: bookableItems.kind,
      itemActive: bookableItems.active,
      status: bookings.status,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .innerJoin(bookableItems, eq(bookings.bookableItemId, bookableItems.id))
    .where(
      and(
        inArray(bookings.status, ["reserved", "booked"]),
        lte(bookings.checkIn, clamped.to),
        gt(bookings.checkOut, clamped.from),
      ),
    );

  // The WHERE clause guarantees status is only "reserved" | "booked", but
  // Drizzle's inferred type is the full 3-value enum regardless — narrow
  // explicitly rather than widen CalendarBookingRow. See route.ts's original
  // comment on this same pattern.
  const bookingRows: CalendarBookingRow[] = rawBookingRows.map((row) => ({
    ...row,
    status: row.status as "reserved" | "booked",
  }));

  return deriveCalendarDays(dates, dayModesByDate, bookingRows, activeCounts);
}
