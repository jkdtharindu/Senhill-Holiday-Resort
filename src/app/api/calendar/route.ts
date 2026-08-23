/**
 * GET /api/calendar — the public calendar.
 *
 * Public: no authentication, and the response is identical for everyone,
 * signed in or not — CalendarState is deliberately coarse (docs/PRD.md §9),
 * with no guest identity or room-level detail. That detail lives behind login
 * at GET /calendar/:date, a separate slice.
 *
 * BookingWindow is enforced here, not just hidden in the UI: the requested
 * range is clamped to today through today+90 days regardless of what the
 * caller asks for, so a request straight at the API cannot see further ahead
 * than the frontend calendar would ever navigate to.
 */

import type { NextRequest } from "next/server";
import { and, count, eq, gt, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bookableItems, bookings, dayModes } from "@/db/schema";
import { deriveCalendarDays, type ActiveItemCounts, type CalendarBookingRow } from "@/lib/calendar";
import { currentBookingWindow, clampToBookingWindow, datesInclusive, isValidDateOnly } from "@/lib/dates";

const querySchema = z.object({
  from: z.string().refine(isValidDateOnly, "`from` must be a valid date."),
  to: z.string().refine(isValidDateOnly, "`to` must be a valid date."),
});

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Provide `from` and `to` as YYYY-MM-DD query parameters." },
      { status: 400 },
    );
  }

  const { from, to } = parsed.data;
  if (from > to) {
    return Response.json({ error: "`from` must not be after `to`." }, { status: 400 });
  }

  const clamped = clampToBookingWindow(from, to, currentBookingWindow());

  // Entirely outside the 90-day window — every date is simply absent, per
  // API_DOCUMENTATION.md, not an error. A determined customer hitting the API
  // directly with an out-of-window range gets exactly what the calendar UI
  // would never let them navigate to: nothing.
  if (clamped === null) {
    return Response.json({ calendar: [] });
  }

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

  // Interval overlap against the half-open [checkIn, checkOut) range: a
  // booking is relevant if it starts on or before the window's last day and
  // ends after the window's first day. Joined to bookable_items for both
  // `kind` (which mode a booking belongs to) and `active` (see calendar.ts on
  // why a deactivated item's bookings are excluded from the count).
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

  // The WHERE clause above guarantees `status` is only "reserved" or "booked"
  // — "declined" bookings never carry a CalendarState, so they must not
  // reach the derivation function at all. Drizzle's inferred type is the
  // full 3-value enum regardless of the filter, since it can't see the
  // runtime constraint; narrow it explicitly rather than widen
  // CalendarBookingRow to accept a status the business logic should never see.
  const bookingRows: CalendarBookingRow[] = rawBookingRows.map((row) => ({
    ...row,
    status: row.status as "reserved" | "booked",
  }));

  const calendar = deriveCalendarDays(dates, dayModesByDate, bookingRows, activeCounts);

  return Response.json({ calendar });
}
