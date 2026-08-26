/**
 * Admin "availability at a glance" grid (Priority 1.2 of docs/UPCOMING_UPDATES.md).
 *
 * Same 4-colour CalendarState scheme the guest-facing `/calendar` page uses
 * (open/reserved/booked/unavailable) — an admin scanning for "which dates
 * still need attention" should not have to learn a second palette. Clicking a
 * date expands an inline panel below the grid rather than navigating away,
 * fetched from the existing `GET /api/calendar/:date` endpoint, which already
 * returns the admin-detail shape (guest identity, payment stage) when an
 * admin session is present — see src/app/api/calendar/[date]/route.ts.
 *
 * Client component: the click-to-expand interaction needs state, but the
 * month grid itself is computed server-side (page.tsx) and passed in as
 * plain data, same split as day-mode-controls.tsx.
 */

"use client";

import { useState } from "react";

import {
  BookingStatusBadge,
  calendarStateMeta,
  RoomStatusBadge,
} from "@/components/ui/badge";
import { BORDER, cx, SURFACE, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import type { CalendarState } from "@/db/schema";
import { formatDateForDisplay, type DateOnly } from "@/lib/dates";

export interface AvailabilityDayCell {
  date: DateOnly;
  state: CalendarState;
}

export interface AvailabilityMonthGrid {
  label: string;
  cells: (AvailabilityDayCell | null)[];
}

/** Same palette as the guest calendar (src/app/(guest)/calendar/page.tsx) — do not diverge. */
const STATE_CLASSES: Record<CalendarState, string> = {
  unavailable: "bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600",
  open: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  reserved: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  booked: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CELL_BASE =
  "flex aspect-square items-center justify-center rounded-md text-xs font-medium transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 cursor-pointer";

/** Only the fields this panel renders — kept local so this client component never imports server-only modules (day-detail-service.ts pulls in @/db). */
interface AdminItemDetail {
  itemId: string;
  name: string;
  capacity: number;
  images: { id: string; url: string }[];
  status: "open" | "booked";
  booking: {
    guestName: string;
    phone: string;
    guestsCount: number;
    status: "reserved" | "booked";
  } | null;
}

interface AdminDayDetailResponse {
  role: "admin";
  dayMode: "room_mode" | "villa_mode" | null;
  unavailable: boolean;
  items: AdminItemDetail[];
}

export function AvailabilityCalendar({ months }: { months: AvailabilityMonthGrid[] }) {
  const [selected, setSelected] = useState<DateOnly | null>(null);
  const [detail, setDetail] = useState<AdminDayDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(date: DateOnly) {
    if (selected === date) {
      setSelected(null);
      setDetail(null);
      setError(null);
      return;
    }

    setSelected(date);
    setDetail(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/${date}`);
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Could not load that date.";
        setError(message);
      } else {
        setDetail(data as AdminDayDetailResponse);
      }
    } catch {
      setError("Could not load that date.");
    } finally {
      setLoading(false);
    }
  }

  const legend: CalendarState[] = ["open", "reserved", "booked", "unavailable"];

  return (
    <div className="flex flex-col gap-4">
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
            <h3 className={cx("text-sm font-semibold", TEXT_HEADING)}>{month.label}</h3>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-500">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {month.cells.map((cell, i) => {
                if (cell === null) return <div key={i} />;
                const dayNumber = Number(cell.date.slice(8, 10));
                const label = `${formatDateForDisplay(cell.date)} — ${calendarStateMeta(cell.state).label}`;
                const isSelected = selected === cell.date;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => handleSelect(cell.date)}
                    aria-label={label}
                    title={label}
                    aria-pressed={isSelected}
                    className={cx(
                      CELL_BASE,
                      STATE_CLASSES[cell.state],
                      isSelected && "ring-2 ring-teal-700",
                    )}
                  >
                    {dayNumber}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selected && (
        <div className={cx("rounded-md border p-4", BORDER, SURFACE)} aria-live="polite">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className={cx("text-sm font-semibold", TEXT_HEADING)}>
              {formatDateForDisplay(selected)}
            </h3>
            <a
              href={`/admin/bookings?from=${selected}&to=${selected}`}
              className="text-xs font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-500"
            >
              Full bookings list &rarr;
            </a>
          </div>

          {loading && <p className={cx("text-sm", TEXT_MUTED)}>Loading&hellip;</p>}
          {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}

          {detail && detail.unavailable && (
            <p className={cx("text-sm", TEXT_MUTED)}>
              Not open for booking — no day mode has been set for this date yet.
            </p>
          )}

          {detail && !detail.unavailable && (
            <div className="flex flex-col gap-3">
              <p className={cx("text-xs uppercase tracking-wide", TEXT_MUTED)}>
                {detail.dayMode === "villa_mode" ? "Whole-villa night" : "Room night"}
              </p>

              {detail.items.length === 0 ? (
                <p className={cx("text-sm", TEXT_MUTED)}>Nothing offered on this date.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.items.map((item) => (
                    <li key={item.itemId} className={cx("rounded-md border px-3 py-2", BORDER)}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {item.images[0] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.images[0].url}
                              alt={item.name}
                              className="h-10 w-14 rounded object-cover"
                            />
                          )}
                          <div className="flex flex-col">
                            <span className={cx("text-sm font-medium", TEXT_HEADING)}>
                              {item.name}
                            </span>
                            <span className={cx("text-xs", TEXT_MUTED)}>
                              Sleeps up to {item.capacity}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <RoomStatusBadge status={item.status} />
                          {item.booking && <BookingStatusBadge status={item.booking.status} />}
                        </div>
                      </div>

                      {item.booking && (
                        <div className={cx("mt-2 text-xs", TEXT_BODY)}>
                          {item.booking.guestName} &middot; {item.booking.phone} &middot;{" "}
                          {item.booking.guestsCount} guest
                          {item.booking.guestsCount === 1 ? "" : "s"}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
