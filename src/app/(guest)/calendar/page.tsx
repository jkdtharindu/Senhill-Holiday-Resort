/**
 * Public colour-coded calendar (Slice 6; rebuilt onto the shared component
 * system and made navigable in Slice 12).
 *
 * Each in-window day is now a link to its day-detail screen. Days outside the
 * BookingWindow, and days no admin has opened yet, stay inert `div`s rather
 * than disabled links — a link to a page that can only say "nothing here" is
 * a dead end, and a keyboard user should not have to tab through 90 of them.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { calendarStateMeta } from "@/components/ui/badge";
import { PageHeader, PageShell } from "@/components/ui/card";
import { BORDER, cx, SURFACE, TEXT_BODY, TEXT_HEADING } from "@/components/ui/styles";
import type { CalendarState } from "@/db/schema";
import { fetchCalendarDays } from "@/lib/calendar-service";
import {
  addDays,
  currentBookingWindow,
  dayOfWeek,
  formatDateForDisplay,
  type DateOnly,
} from "@/lib/dates";

export const metadata: Metadata = {
  title: "Calendar",
  description:
    "Which dates are open at Senhill Holiday Resort over the next 90 days.",
};

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

/** Cell background per CalendarState, tuned to read clearly in both themes. */
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

const CELL_BASE =
  "flex aspect-square items-center justify-center rounded-md text-xs font-medium";

function DayCellView({ cell }: { cell: DayCell }) {
  const meta = calendarStateMeta(cell.state!);
  const dayNumber = Number(cell.date.slice(8, 10));
  const label = `${formatDateForDisplay(cell.date)} — ${meta.label}`;

  // `aria-label` carries the full "date — state" sentence, since the visible
  // text is only the day number and a screen reader would otherwise announce a
  // bare "17". `title` repeats it as a tooltip for mouse users. Deliberately
  // NOT an extra sr-only span alongside these: that produced the label twice.
  const labelling = { "aria-label": label, title: label };

  // Nothing to show behind an unopened date, so it is not a link.
  if (cell.state === "unavailable") {
    return (
      <div className={cx(CELL_BASE, STATE_CLASSES.unavailable)} {...labelling}>
        {dayNumber}
      </div>
    );
  }

  return (
    <Link
      href={`/calendar/${cell.date}`}
      {...labelling}
      className={cx(
        CELL_BASE,
        STATE_CLASSES[cell.state!],
        "transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
      )}
    >
      {dayNumber}
    </Link>
  );
}

export default async function CalendarPage() {
  const window = currentBookingWindow();
  const days = await fetchCalendarDays(window.from, window.to);
  const states = new Map(days.map((d) => [d.date, d.state]));
  const months = buildMonthGrids(window.from, window.to, states);

  const legend: CalendarState[] = ["open", "reserved", "booked", "unavailable"];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Availability"
        title="Calendar"
        description={`Bookable from ${formatDateForDisplay(window.from)} through ${formatDateForDisplay(window.to)} — 90 days from today, in Sri Lanka time. Pick a date to see which rooms are free.`}
      />

      <div
        className={cx(
          "flex flex-wrap gap-x-5 gap-y-2 rounded-md border px-4 py-3 text-xs",
          BORDER,
          SURFACE,
        )}
      >
        {legend.map((state) => (
          <div key={state} className="flex items-center gap-1.5">
            <span
              className={cx("inline-block h-3 w-3 rounded-sm", STATE_CLASSES[state])}
              aria-hidden="true"
            />
            <span className={TEXT_BODY}>{calendarStateMeta(state).label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-10">
        {months.map((month) => (
          <section key={month.label} className="flex flex-col gap-3">
            <h2 className={cx("text-sm font-semibold", TEXT_HEADING)}>
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
                    className={cx(
                      CELL_BASE,
                      "text-stone-300 dark:text-stone-700",
                    )}
                    title="Outside the 90-day booking window"
                  >
                    {Number(cell.date.slice(8, 10))}
                  </div>
                ) : (
                  <DayCellView key={cell.date} cell={cell} />
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
