/**
 * Calendar dates, resolved in Sri Lanka time.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The property is in Hedigalla, Sri Lanka (Asia/Colombo, UTC+5:30, no DST).
 * Vercel's runtime clock is UTC, 5.5 hours behind. If any part of the app asks
 * the server "what is today?" via a plain `new Date()`, the answer is wrong
 * between 18:30 and 24:00 UTC — which is 00:00 to 05:30 in Colombo. During
 * those 5.5 hours every night:
 *
 *   - the 90-day BookingWindow would be shifted by a day, so the last bookable
 *     date silently moves;
 *   - a date that just became "today" locally would still be treated as
 *     yesterday, and could be booked;
 *   - CalendarState colours would be computed against the wrong day.
 *
 * So: nothing outside this module may call `new Date()` to obtain a calendar
 * date, and nothing may use `Date.prototype.getDate()`/`getMonth()`/etc., which
 * read the server's local zone. Ask this module instead.
 *
 * HOW DATES ARE REPRESENTED
 * -------------------------
 * A calendar date is a plain "YYYY-MM-DD" string, not a Date object. A Date is
 * an instant in time; "the 14th of September" is not an instant, it is a label
 * on a calendar, and the two are only equivalent if you pin a timezone. Postgres
 * `date` columns hold exactly this, so the string round-trips without
 * conversion. Arithmetic below happens in UTC space purely as a mechanism —
 * UTC has no DST, so day-stepping can never land on a 23- or 25-hour day.
 */

/** A calendar date as "YYYY-MM-DD". Not an instant — see module notes. */
export type DateOnly = string;

/** The property's timezone. Sri Lanka has observed UTC+5:30 with no DST. */
export const RESORT_TIMEZONE = "Asia/Colombo";

/**
 * How far ahead customers may view and book, in days.
 * Rolling, not fixed: always "today through today + 90 days", recalculated on
 * every request. Admins are deliberately NOT limited by this — they need to
 * configure DayMode further out than customers can book. See docs/PRD.md 9a.
 */
export const BOOKING_WINDOW_DAYS = 90;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// en-CA formats as YYYY-MM-DD, which is what we want. Constructed once —
// Intl.DateTimeFormat is expensive to build and this runs on every request.
const colomboFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESORT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Which calendar date a given instant falls on, at the property.
 *
 * Split out from `todayAtResort` so the timezone behaviour can be tested
 * against fixed instants — the 18:30-24:00 UTC window is exactly where naive
 * date handling breaks, and a test that calls `new Date()` could only catch it
 * if it happened to run during those hours.
 */
export function dateAtResort(instant: Date): DateOnly {
  return colomboFormatter.format(instant);
}

/**
 * Today's date at the property. This is the only correct way to ask "what day
 * is it" anywhere in this codebase.
 */
export function todayAtResort(): DateOnly {
  return dateAtResort(new Date());
}

/** True if the string is a well-formed, real calendar date. */
export function isValidDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) return false;
  // Rejects impossible dates that still match the pattern, e.g. 2026-02-31:
  // Date.UTC would roll them over to a different day than the input.
  return toUtcMidnight(value).toISOString().slice(0, 10) === value;
}

/**
 * Parse a date, or throw. Use at trust boundaries (API input, env config).
 * `label` names the field in the error so the message is actionable.
 */
export function parseDateOnly(value: unknown, label = "date"): DateOnly {
  if (!isValidDateOnly(value)) {
    throw new InvalidDateError(
      `${label} must be a real calendar date formatted YYYY-MM-DD, received: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export class InvalidDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDateError";
  }
}

/* ----------------------------------------------------------- arithmetic */

function toUtcMidnight(d: DateOnly): Date {
  const [year, month, day] = d.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcMidnight(d: Date): DateOnly {
  return d.toISOString().slice(0, 10);
}

/** The date `days` after `d`. Negative values step backwards. */
export function addDays(d: DateOnly, days: number): DateOnly {
  const instant = toUtcMidnight(d);
  instant.setUTCDate(instant.getUTCDate() + days);
  return fromUtcMidnight(instant);
}

/** Whole days from `from` to `to`. Negative if `to` precedes `from`. */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  const MS_PER_DAY = 86_400_000;
  return (toUtcMidnight(to).getTime() - toUtcMidnight(from).getTime()) / MS_PER_DAY;
}

/** Chronological comparison. Negative if `a` is earlier. Sortable. */
export function compareDates(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Day of week: 0 = Sunday through 6 = Saturday. */
export function dayOfWeek(d: DateOnly): number {
  return toUtcMidnight(d).getUTCDay();
}

/** True for Saturday and Sunday — the `weekends` BulkDayModeAssignment pattern. */
export function isWeekend(d: DateOnly): boolean {
  const dow = dayOfWeek(d);
  return dow === 0 || dow === 6;
}

/* --------------------------------------------------------------- ranges */

/**
 * Every date from `from` to `to` INCLUSIVE.
 * Use for calendar grids and admin bulk operations, where both endpoints are
 * days the user picked and both should be included.
 * For a booking's occupied nights use `nightsOfStay` instead — the rules differ.
 */
export function datesInclusive(from: DateOnly, to: DateOnly): DateOnly[] {
  if (compareDates(from, to) > 0) return [];
  const out: DateOnly[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The nights a stay actually occupies: `checkIn` up to but NOT including
 * `checkOut`. A 10th->13th stay returns the 10th, 11th and 12th — the 13th is
 * free for the next guest to arrive.
 *
 * This half-open rule is the whole reason back-to-back bookings work. Every
 * conflict check, RoomStatus lookup and CalendarState computation must use
 * this function rather than rolling its own loop, or two bookings that merely
 * touch will be reported as clashing.
 */
export function nightsOfStay(checkIn: DateOnly, checkOut: DateOnly): DateOnly[] {
  if (compareDates(checkIn, checkOut) >= 0) return [];
  return datesInclusive(checkIn, addDays(checkOut, -1));
}

/** Number of nights in a stay. Zero if the range is empty or inverted. */
export function nightCount(checkIn: DateOnly, checkOut: DateOnly): number {
  return Math.max(0, daysBetween(checkIn, checkOut));
}

/**
 * Do two stays overlap?
 *
 * Half-open, so a stay ending on the 13th and one starting on the 13th do NOT
 * overlap. Compared as strings, which is safe because ISO dates sort
 * lexicographically in the same order they sort chronologically.
 */
export function staysOverlap(
  aCheckIn: DateOnly,
  aCheckOut: DateOnly,
  bCheckIn: DateOnly,
  bCheckOut: DateOnly,
): boolean {
  return aCheckIn < bCheckOut && bCheckIn < aCheckOut;
}

/* ------------------------------------------------------- booking window */

export interface BookingWindow {
  /** Today at the property. The earliest bookable date. */
  from: DateOnly;
  /** Today + 90 days. The latest bookable date, inclusive. */
  to: DateOnly;
}

/**
 * The rolling window customers may view and book within.
 * Recomputed per call rather than cached — it must roll over at midnight in
 * Colombo without anything needing to be restarted or invalidated.
 */
export function currentBookingWindow(): BookingWindow {
  const from = todayAtResort();
  return { from, to: addDays(from, BOOKING_WINDOW_DAYS) };
}

/** Is this date inside the customer-facing window? Admin routes skip this. */
export function isWithinBookingWindow(
  d: DateOnly,
  window: BookingWindow = currentBookingWindow(),
): boolean {
  return compareDates(d, window.from) >= 0 && compareDates(d, window.to) <= 0;
}

/**
 * Narrow a requested range to the bookable window.
 *
 * Used by `GET /calendar`, which clamps rather than erroring: a customer whose
 * browser asks for a month partly beyond the window should see the dates that
 * ARE bookable, not a failure. Returns null when the request lies entirely
 * outside, which callers render as an empty calendar.
 *
 * `POST /bookings` must NOT clamp — an out-of-window booking attempt is
 * rejected outright, naming the offending dates.
 */
export function clampToBookingWindow(
  from: DateOnly,
  to: DateOnly,
  window: BookingWindow = currentBookingWindow(),
): { from: DateOnly; to: DateOnly } | null {
  const clampedFrom = compareDates(from, window.from) < 0 ? window.from : from;
  const clampedTo = compareDates(to, window.to) > 0 ? window.to : to;
  if (compareDates(clampedFrom, clampedTo) > 0) return null;
  return { from: clampedFrom, to: clampedTo };
}

/* --------------------------------------------------------- presentation */

const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RESORT_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Human-readable form for UI and admin emails, e.g. "Mon, 14 Sep 2026". */
export function formatDateForDisplay(d: DateOnly): string {
  return longDateFormatter.format(toUtcMidnight(d));
}
