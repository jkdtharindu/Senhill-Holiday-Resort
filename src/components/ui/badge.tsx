/**
 * Status badges (Slice 12).
 *
 * The domain badges below are the single place each status vocabulary is
 * turned into a colour and a human label. Two rules they enforce:
 *
 * 1. Colour is consistent across every screen — `reserved` is amber on the
 *    calendar, in the bookings table and on the booking detail page. An admin
 *    scanning a list should not have to re-learn the palette per screen.
 * 2. The customer-facing wording differs from the internal vocabulary on
 *    purpose. `reserved` means "two admins haven't both approved yet", which
 *    is our process, not the guest's concern — so a guest sees "Awaiting
 *    confirmation". See docs/UBIQUITOUS_LANGUAGE.md.
 */

import type { ReactNode } from "react";

import type { BookingStatus, CalendarState, PaymentStage, RoomStatus } from "@/db/schema";
import { cx } from "./styles";

export type BadgeTone = "neutral" | "open" | "pending" | "closed" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  open: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
  info: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------- domain-specific badges */

const CALENDAR_STATE: Record<CalendarState, { label: string; tone: BadgeTone }> = {
  unavailable: { label: "Not open for booking", tone: "neutral" },
  open: { label: "Open", tone: "open" },
  reserved: { label: "Partly taken", tone: "pending" },
  booked: { label: "Fully booked", tone: "closed" },
};

export function calendarStateMeta(state: CalendarState) {
  return CALENDAR_STATE[state];
}

export function CalendarStateBadge({ state }: { state: CalendarState }) {
  const meta = CALENDAR_STATE[state];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** Per-room availability on the day-detail screen. */
export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  return status === "open" ? (
    <Badge tone="open">Available</Badge>
  ) : (
    <Badge tone="closed">Taken</Badge>
  );
}

/**
 * Booking status.
 *
 * `audience` changes the wording, never the colour. An admin needs the exact
 * internal state because it tells them what action is outstanding; a guest
 * needs to know whether their stay is confirmed.
 */
export function BookingStatusBadge({
  status,
  audience = "admin",
}: {
  status: BookingStatus;
  audience?: "admin" | "guest";
}) {
  if (status === "booked") return <Badge tone="open">Confirmed</Badge>;
  if (status === "declined") return <Badge tone="closed">Declined</Badge>;
  // Cancelled reads neutral, not red: a declined booking is a decision the
  // resort made about a guest, whereas a cancellation is usually the guest's
  // own or an agreed change. Colouring them alike would misreport what
  // happened at a glance.
  if (status === "cancelled") return <Badge tone="neutral">Cancelled</Badge>;
  return (
    <Badge tone="pending">
      {audience === "guest" ? "Awaiting confirmation" : "Reserved"}
    </Badge>
  );
}

const PAYMENT_STAGE: Record<PaymentStage, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "neutral" },
  advance_paid: { label: "Advance paid", tone: "pending" },
  fully_paid: { label: "Fully paid", tone: "open" },
  refunded: { label: "Refunded", tone: "info" },
};

export function paymentStageLabel(stage: PaymentStage): string {
  return PAYMENT_STAGE[stage].label;
}

export function PaymentStageBadge({ stage }: { stage: PaymentStage }) {
  const meta = PAYMENT_STAGE[stage];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** The two DayModes, as shown on the admin calendar controls. */
export function DayModeBadge({ mode }: { mode: "room_mode" | "villa_mode" | null }) {
  if (mode === null) return <Badge tone="neutral">Not set</Badge>;
  return mode === "room_mode" ? (
    <Badge tone="info">Rooms</Badge>
  ) : (
    <Badge tone="info">Whole villa</Badge>
  );
}
