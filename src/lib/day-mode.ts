/**
 * DayMode assignment logic — the core mechanic of the whole system.
 *
 * Every calendar date is either room_mode, villa_mode, or has no mode at all
 * (not bookable). This is what makes double-booking structurally impossible:
 * a day can never offer both individual rooms and the whole villa at once, so
 * the two inventories can never collide. See docs/PRD.md §9.
 *
 * Kept as pure functions operating on data the caller already fetched, rather
 * than querying the database itself — the same reasoning as lib/dates.ts: the
 * business rule can be tested directly, with no database in the loop.
 */

import type { DayModeKind } from "../db/schema.ts";
import {
  compareDates,
  datesInclusive,
  daysBetween,
  isValidDateOnly,
  isWeekend,
  type DateOnly,
} from "./dates.ts";

/* --------------------------------------------------- pattern resolution */

/** Recurrence patterns BulkDayModeAssignment understands. */
export const DAY_MODE_PATTERNS = ["weekends"] as const;
export type DayModePattern = (typeof DAY_MODE_PATTERNS)[number];

export function isDayModePattern(value: unknown): value is DayModePattern {
  return (
    typeof value === "string" &&
    (DAY_MODE_PATTERNS as readonly string[]).includes(value)
  );
}

/**
 * Widest span a single bulk request may cover.
 *
 * Not a business rule — nothing in the spec limits it — but a typo in `to`
 * (a wrong year, say) should fail loudly rather than silently queue up
 * thousands of date writes. One admin action should not be able to touch more
 * than a couple of years of the calendar at once.
 */
export const MAX_BULK_RANGE_DAYS = 366 * 2;

/** Largest explicit date list a single request may name, for the same reason. */
export const MAX_EXPLICIT_DATES = 500;

export class DayModePatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DayModePatternError";
  }
}

/**
 * Every date in `[from, to]` matching `pattern`.
 *
 * Resolved server-side from the date range and a day-of-week test — no
 * client-side date math, so the rule cannot drift between frontend and
 * backend. Deliberately starting with just `weekends`; extend
 * DAY_MODE_PATTERNS and the switch below if another pattern is ever needed,
 * rather than reaching for a full recurrence-rule engine nothing here needs.
 */
export function resolvePatternDates(
  pattern: DayModePattern,
  from: DateOnly,
  to: DateOnly,
): DateOnly[] {
  if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
    throw new DayModePatternError("`from` and `to` must be valid dates.");
  }
  if (compareDates(from, to) > 0) {
    throw new DayModePatternError("`from` must not be after `to`.");
  }
  if (daysBetween(from, to) > MAX_BULK_RANGE_DAYS) {
    throw new DayModePatternError(
      `The range from ${from} to ${to} spans more than ${MAX_BULK_RANGE_DAYS} days. ` +
        `Split it into smaller requests.`,
    );
  }

  switch (pattern) {
    case "weekends":
      return datesInclusive(from, to).filter(isWeekend);
    default: {
      // Exhaustiveness check: a new entry in DAY_MODE_PATTERNS without a
      // matching case here is a compile error, not a silent no-op at runtime.
      const _never: never = pattern;
      throw new DayModePatternError(`Unknown pattern: ${_never}`);
    }
  }
}

/* --------------------------------------------------- DayModeSwitchBlock */

/**
 * The item kind a mode offers. A room_mode day offers individual rooms; a
 * villa_mode day offers only the villa.
 */
export function itemKindForMode(mode: DayModeKind): "room" | "villa" {
  return mode === "room_mode" ? "room" : "villa";
}

/** The minimal shape needed to check whether a booking occupies a date. */
export interface ActiveBookingRange {
  itemKind: "room" | "villa";
  checkIn: DateOnly;
  checkOut: DateOnly;
}

/**
 * Does any active booking of the given mode's kind occupy this date?
 *
 * Half-open range, matching nightsOfStay in lib/dates.ts: check_in <= date <
 * check_out. A booking whose check_out lands exactly on this date has already
 * vacated it by the half-open rule, so it does not block a switch.
 */
export function dateHasActiveBooking(
  date: DateOnly,
  mode: DayModeKind,
  activeBookings: readonly ActiveBookingRange[],
): boolean {
  const kind = itemKindForMode(mode);
  return activeBookings.some(
    (b) =>
      b.itemKind === kind &&
      compareDates(b.checkIn, date) <= 0 &&
      compareDates(date, b.checkOut) < 0,
  );
}

/** What happens to one date when a bulk or single DayMode write is applied. */
export type DayModeOutcome =
  | { date: DateOnly; action: "noop" }
  | { date: DateOnly; action: "insert" }
  | { date: DateOnly; action: "switch"; from: DayModeKind }
  | { date: DateOnly; action: "delete" }
  | { date: DateOnly; action: "blocked"; reason: string };

/**
 * Decide the outcome for every requested date, given what mode (if any) is
 * currently set and which bookings are active.
 *
 * Pure — the caller fetches `existingModes` and `activeBookings` from the
 * database once for the whole batch, and this function makes every per-date
 * decision from that snapshot. No date's outcome depends on another's, so the
 * order of the input list does not matter.
 */
export function planDayModeChanges(
  dates: readonly DateOnly[],
  targetMode: DayModeKind,
  existingModes: ReadonlyMap<DateOnly, DayModeKind>,
  activeBookings: readonly ActiveBookingRange[],
): DayModeOutcome[] {
  return dates.map((date) => {
    const current = existingModes.get(date);

    if (current === undefined) {
      return { date, action: "insert" };
    }

    if (current === targetMode) {
      return { date, action: "noop" };
    }

    // Switching FROM `current` TO `targetMode` — check bookings under the
    // CURRENT mode, not the target. A room booking is what blocks leaving
    // room_mode; it says nothing about whether villa_mode could be entered.
    if (dateHasActiveBooking(date, current, activeBookings)) {
      return {
        date,
        action: "blocked",
        reason: "Existing booking under current mode",
      };
    }

    return { date, action: "switch", from: current };
  });
}

/**
 * Decide the outcome for every date when unsetting a day mode.
 *
 * Similar to planDayModeChanges but for deletion: dates with active bookings
 * cannot be unset because the mode determines what can be booked on that date.
 */
export function planDayModeClearings(
  dates: readonly DateOnly[],
  existingModes: ReadonlyMap<DateOnly, DayModeKind>,
  activeBookings: readonly ActiveBookingRange[],
): DayModeOutcome[] {
  return dates.map((date) => {
    const current = existingModes.get(date);

    if (current === undefined) {
      return { date, action: "noop" };
    }

    if (dateHasActiveBooking(date, current, activeBookings)) {
      return {
        date,
        action: "blocked",
        reason: "Existing booking under current mode",
      };
    }

    return { date, action: "delete" };
  });
}

/** Dedupe and sort a date list. Callers may submit the same date twice. */
export function normalizeDates(dates: readonly DateOnly[]): DateOnly[] {
  return Array.from(new Set(dates)).sort(compareDates);
}
