/**
 * Admin calendar and DayMode controls (Slice 12).
 *
 * Shows the raw DayMode assignment per date — which mode an admin has set,
 * or nothing at all — rather than the guest-facing CalendarState. Those are
 * different questions: a guest needs "can I book this?", an admin setting up
 * the calendar needs "what have I actually opened, and as what?".
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, gte, lte } from "drizzle-orm";

import { CardPanel, PageHeader, PageShell } from "@/components/ui/card";
import { BORDER, cx, SURFACE, TEXT_BODY, TEXT_HEADING } from "@/components/ui/styles";
import { db } from "@/db";
import { dayModes, type CalendarState, type DayModeKind } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fetchCalendarDays } from "@/lib/calendar-service";
import {
  addDays,
  currentBookingWindow,
  dayOfWeek,
  formatDateForDisplay,
  type DateOnly,
} from "@/lib/dates";
import { AvailabilityCalendar, type AvailabilityMonthGrid } from "./availability-calendar";
import { DayModeControls } from "./day-mode-controls";

export const metadata: Metadata = {
  title: "Calendar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MODE_CLASSES: Record<DayModeKind, string> = {
  room_mode: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300",
  villa_mode:
    "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300",
};

const UNSET_CLASSES =
  "bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600";

const MODE_LABEL: Record<DayModeKind, string> = {
  room_mode: "Room mode",
  villa_mode: "Villa mode",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthGrid {
  label: string;
  cells: Array<{ date: DateOnly; mode: DayModeKind | null } | null>;
}

function buildMonthGrids(
  from: DateOnly,
  to: DateOnly,
  modes: ReadonlyMap<string, DayModeKind>,
): MonthGrid[] {
  const months: MonthGrid[] = [];
  let cursor = `${from.slice(0, 7)}-01` as DateOnly;

  while (cursor <= to) {
    const [year, month] = cursor.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: MonthGrid["cells"] = Array.from(
      { length: dayOfWeek(cursor) },
      () => null,
    );

    for (let day = 1; day <= daysInMonth; day++) {
      const date =
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as DateOnly;
      if (date < from || date > to) {
        cells.push(null);
        continue;
      }
      cells.push({ date, mode: modes.get(date) ?? null });
    }

    months.push({
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      cells,
    });

    cursor = addDays(`${cursor.slice(0, 8)}${daysInMonth}` as DateOnly, 1);
  }

  return months;
}

/**
 * Same grid-building shape as `buildMonthGrids` above, just keyed on
 * CalendarState instead of raw DayMode — kept as its own function rather than
 * generalised, matching this file's existing pattern (the guest calendar page
 * has its own near-identical copy too; see docs/ARCHITECTURE.md's bias toward
 * the minimum that solves the stated problem over a shared abstraction three
 * call sites don't yet ask for).
 */
function buildAvailabilityMonthGrids(
  from: DateOnly,
  to: DateOnly,
  states: ReadonlyMap<DateOnly, CalendarState>,
): AvailabilityMonthGrid[] {
  const months: AvailabilityMonthGrid[] = [];
  let cursor = `${from.slice(0, 7)}-01` as DateOnly;

  while (cursor <= to) {
    const [year, month] = cursor.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: AvailabilityMonthGrid["cells"] = Array.from(
      { length: dayOfWeek(cursor) },
      () => null,
    );

    for (let day = 1; day <= daysInMonth; day++) {
      const date =
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as DateOnly;
      if (date < from || date > to) {
        cells.push(null);
        continue;
      }
      cells.push({ date, state: states.get(date) ?? "unavailable" });
    }

    months.push({
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      cells,
    });

    cursor = addDays(`${cursor.slice(0, 8)}${daysInMonth}` as DateOnly, 1);
  }

  return months;
}

export default async function AdminCalendarPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  const window = currentBookingWindow();

  const [rows, calendarDays] = await Promise.all([
    db
      .select({ date: dayModes.date, mode: dayModes.mode })
      .from(dayModes)
      .where(and(gte(dayModes.date, window.from), lte(dayModes.date, window.to))),
    fetchCalendarDays(window.from, window.to),
  ]);

  const modes = new Map(rows.map((r) => [r.date, r.mode]));
  const months = buildMonthGrids(window.from, window.to, modes);

  const states = new Map(calendarDays.map((d) => [d.date, d.state]));
  const availabilityMonths = buildAvailabilityMonthGrids(window.from, window.to, states);

  const roomCount = rows.filter((r) => r.mode === "room_mode").length;
  const villaCount = rows.filter((r) => r.mode === "villa_mode").length;
  const totalDays = months
    .flatMap((m) => m.cells)
    .filter((c) => c !== null).length;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Admin"
        title="Calendar & day modes"
        description={`${roomCount} room-mode and ${villaCount} villa-mode dates set across the next ${totalDays} days. Everything else is closed to bookings.`}
      />

      <CardPanel
        title="Availability at a glance"
        description="Same colours as the guest calendar — open, partly taken, fully booked, or not yet opened. Click a date to see which rooms are taken and by whom, without leaving this page."
      >
        <AvailabilityCalendar months={availabilityMonths} />
      </CardPanel>

      <CardPanel
        title="Set day modes"
        description="Open dates for booking by assigning a mode. Switching a date that already has bookings under the other mode is blocked."
      >
        <DayModeControls windowFrom={window.from} windowTo={window.to} />
      </CardPanel>

      <div
        className={cx(
          "flex flex-wrap gap-x-5 gap-y-2 rounded-md border px-4 py-3 text-xs",
          BORDER,
          SURFACE,
        )}
      >
        {(Object.keys(MODE_LABEL) as DayModeKind[]).map((mode) => (
          <div key={mode} className="flex items-center gap-1.5">
            <span
              className={cx("inline-block h-3 w-3 rounded-sm", MODE_CLASSES[mode])}
              aria-hidden="true"
            />
            <span className={TEXT_BODY}>{MODE_LABEL[mode]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span
            className={cx("inline-block h-3 w-3 rounded-sm", UNSET_CLASSES)}
            aria-hidden="true"
          />
          <span className={TEXT_BODY}>Not set — closed to bookings</span>
        </div>
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
                ) : (
                  <div
                    key={cell.date}
                    aria-label={`${formatDateForDisplay(cell.date)} — ${
                      cell.mode === null ? "not set" : MODE_LABEL[cell.mode]
                    }`}
                    title={`${formatDateForDisplay(cell.date)} — ${
                      cell.mode === null ? "not set" : MODE_LABEL[cell.mode]
                    }`}
                    className={cx(
                      "flex aspect-square items-center justify-center rounded-md text-xs font-medium",
                      cell.mode === null ? UNSET_CLASSES : MODE_CLASSES[cell.mode],
                    )}
                  >
                    {Number(cell.date.slice(8, 10))}
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
