import type { Metadata } from "next";

import { fetchCalendarDays } from "@/lib/calendar-service";
import {
  addDays,
  currentBookingWindow,
  dayOfWeek,
  formatDateForDisplay,
  type DateOnly,
} from "@/lib/dates";
import type { CalendarState } from "@/db/schema";

export const metadata: Metadata = { title: "Calendar" };

/**
 * Must render per-request, not at build time.
 *
 * Nothing here reads cookies or headers — the only signals Next's static
 * analysis treats as a reason to render dynamically — so without this the
 * page would be prerendered once at build time. `currentBookingWindow()`
 * calls `new Date()` internally, and the query reads live day_modes and
 * bookings rows; a statically frozen version of this page would show a
 * BookingWindow computed the moment of the last deploy and would never
 * reflect a DayMode an admin sets tomorrow.
 */
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<CalendarState, string> = {
  unavailable: "Not open for booking",
  open: "Open",
  reserved: "Partly taken",
  booked: "Fully booked",
};

/** Tailwind classes per CalendarState, tuned to read clearly in both themes. */
const STATE_CLASSES: Record<CalendarState, string> = {
  unavailable:
    "bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600",
  open: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  reserved: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  booked: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayCell {
  date: DateOnly;
  inWindow: boolean;
  state: CalendarState | null;
}

interface MonthGrid {
  label: string;
  cells: (DayCell | null)[];
}

/**
 * Group the fetched window into calendar months, padded to full weeks so each
 * month renders as a proper grid. Dates outside the 90-day BookingWindow but
 * still inside a displayed month (e.g. the tail end of month 3) render as a
 * distinct empty cell — not `unavailable`, which specifically means "inside
 * the window, but the admin hasn't opened this date yet".
 */
function buildMonthGrids(
  windowFrom: DateOnly,
  windowTo: DateOnly,
  states: ReadonlyMap<DateOnly, CalendarState>,
): MonthGrid[] {
  const months: MonthGrid[] = [];
  let cursor = `${windowFrom.slice(0, 7)}-01` as DateOnly;

  while (cursor <= windowTo) {
    const [year, month] = cursor.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leadingBlanks = dayOfWeek(cursor);

    const cells: (DayCell | null)[] = Array.from({ length: leadingBlanks }, () => null);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as DateOnly;
      const inWindow = date >= windowFrom && date <= windowTo;
      cells.push({ date, inWindow, state: inWindow ? (states.get(date) ?? "unavailable") : null });
    }

    months.push({
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      cells,
    });

    // Advance to the 1st of next month: the last day of the current one,
    // plus one day, rolls over correctly across both month and year ends.
    cursor = addDays(`${cursor.slice(0, 8)}${daysInMonth}` as DateOnly, 1);
  }

  return months;
}

export default async function CalendarPage() {
  const window = currentBookingWindow();
  const days = await fetchCalendarDays(window.from, window.to);
  const states = new Map(days.map((d) => [d.date, d.state]));
  const months = buildMonthGrids(window.from, window.to, states);

  return (
    <main className="min-h-dvh bg-stone-100 px-6 py-12 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-800 dark:text-teal-500">
            Senhill Holiday Resort
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Calendar
          </h1>
          <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Bookable from {formatDateForDisplay(window.from)} through{" "}
            {formatDateForDisplay(window.to)} — 90 days from today, in Sri
            Lanka time. This view only shows the colour, same as every guest
            sees; signing in and picking a date will show room-level detail
            once that screen exists.
          </p>
        </header>

        <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-stone-300 bg-white px-4 py-3 text-xs dark:border-stone-800 dark:bg-stone-900">
          {(Object.keys(STATE_LABEL) as CalendarState[]).map((state) => (
            <div key={state} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-3 w-3 rounded-sm ${STATE_CLASSES[state]}`}
                aria-hidden="true"
              />
              <span className="text-stone-600 dark:text-stone-400">
                {STATE_LABEL[state]}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-10">
          {months.map((month) => (
            <section key={month.label} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {month.label}
              </h2>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-500">
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {month.cells.map((cell, i) =>
                  cell === null ? (
                    <div key={i} />
                  ) : !cell.inWindow ? (
                    <div
                      key={cell.date}
                      className="flex aspect-square items-center justify-center rounded-md text-xs text-stone-300 dark:text-stone-700"
                      title="Outside the 90-day booking window"
                    >
                      {Number(cell.date.slice(8, 10))}
                    </div>
                  ) : (
                    <div
                      key={cell.date}
                      title={`${formatDateForDisplay(cell.date)} — ${STATE_LABEL[cell.state!]}`}
                      className={`flex aspect-square items-center justify-center rounded-md text-xs font-medium ${STATE_CLASSES[cell.state!]}`}
                    >
                      {Number(cell.date.slice(8, 10))}
                    </div>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
