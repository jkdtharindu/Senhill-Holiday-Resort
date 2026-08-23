/**
 * Database-backed orchestration for DayMode writes.
 *
 * Split from lib/day-mode.ts, which is pure and DB-free, and from the two
 * route handlers (single-date and bulk-by-pattern), which both need this exact
 * same fetch-plan-write-report cycle and must never be allowed to drift apart
 * on what counts as a blocked switch. A route file should stay a thin HTTP
 * adapter — request in, response out — not a place other routes import
 * business logic from.
 */

import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { bookableItems, bookings, dayModes, type DayModeKind } from "@/db/schema";
import type { DateOnly } from "./dates";
import { planDayModeChanges, type ActiveBookingRange } from "./day-mode";

/** Active bookings joined to their item's kind, for the switch-block check. */
export async function loadActiveBookingRanges(): Promise<ActiveBookingRange[]> {
  return db
    .select({
      itemKind: bookableItems.kind,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .innerJoin(bookableItems, eq(bookings.bookableItemId, bookableItems.id))
    .where(inArray(bookings.status, ["reserved", "booked"]));
}

export interface DayModePlanResult {
  updated: DateOnly[];
  blocked: { date: DateOnly; reason: string }[];
}

/**
 * Apply a set of DayMode changes and report what happened to each date.
 *
 * Used by both the explicit-dates and pattern-based (bulk) endpoints — each
 * resolves its own date list, then hands it here for the identical
 * fetch-existing / check-bookings / plan / write cycle.
 */
export async function applyDayModePlan(
  dates: DateOnly[],
  mode: DayModeKind,
  adminId: string,
): Promise<DayModePlanResult> {
  if (dates.length === 0) {
    return { updated: [], blocked: [] };
  }

  const existingRows = await db
    .select({ date: dayModes.date, mode: dayModes.mode })
    .from(dayModes)
    .where(inArray(dayModes.date, dates));

  const existingModes = new Map(existingRows.map((r) => [r.date, r.mode]));
  const activeBookings = await loadActiveBookingRanges();

  const outcomes = planDayModeChanges(dates, mode, existingModes, activeBookings);

  const toWrite = outcomes.filter(
    (o) => o.action === "insert" || o.action === "switch",
  );
  const updated: DateOnly[] = [];
  const blocked: { date: DateOnly; reason: string }[] = [];

  for (const outcome of outcomes) {
    if (outcome.action === "blocked") {
      blocked.push({ date: outcome.date, reason: outcome.reason });
    } else {
      // Both "noop" (already correct) and the about-to-be-written dates count
      // as updated — from the caller's point of view the date now holds the
      // mode they asked for, either way.
      updated.push(outcome.date);
    }
  }

  if (toWrite.length > 0) {
    // One INSERT ... ON CONFLICT for the whole batch, not a query per date.
    // `excluded` refers to the row Postgres would have inserted, so each date
    // keeps its own mode/admin/timestamp even sharing one statement.
    await db
      .insert(dayModes)
      .values(toWrite.map((o) => ({ date: o.date, mode, setBy: adminId })))
      .onConflictDoUpdate({
        target: dayModes.date,
        set: {
          mode: sql`excluded.mode`,
          setBy: sql`excluded.set_by`,
          updatedAt: sql`now()`,
        },
      });
  }

  return { updated, blocked };
}
