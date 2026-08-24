/**
 * Day detail — which rooms are free on one date (Slice 12).
 *
 * Sign-in gated per FR3/FR15: the colour-coded month view is public, but
 * room-level detail is not. A signed-out visitor gets a prompt rather than a
 * redirect, so they can see what they would be signing in for and the date
 * survives in the URL for the round trip.
 *
 * Guest-facing, so it calls `fetchDayDetail` (RoomStatus only) and never
 * `fetchDayDetailAdmin` — the admin variant carries guest names, phone
 * numbers and payment state, which no customer may see.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { RoomStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CardPanel, EmptyState, PageHeader, PageShell } from "@/components/ui/card";
import { BORDER, cx, SURFACE, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { fetchDayDetail } from "@/lib/day-detail-service";
import {
  currentBookingWindow,
  formatDateForDisplay,
  isValidDateOnly,
  type DateOnly,
} from "@/lib/dates";

export async function generateMetadata({
  params,
}: PageProps<"/calendar/[date]">): Promise<Metadata> {
  const { date } = await params;
  if (!isValidDateOnly(date)) return { title: "Not found" };
  return { title: formatDateForDisplay(date as DateOnly) };
}

export default async function DayDetailPage({
  params,
}: PageProps<"/calendar/[date]">) {
  const { date } = await params;

  // A malformed date is a 404, not a 500: `/calendar/banana` is a wrong URL,
  // not a server fault.
  if (!isValidDateOnly(date)) notFound();
  const day = date as DateOnly;

  const window = currentBookingWindow();
  const inWindow = day >= window.from && day <= window.to;

  const session = await auth();
  const signedIn = session?.user?.id != null;

  const header = (
    <PageHeader
      eyebrow={<Link href="/calendar" className="hover:underline">&larr; Calendar</Link>}
      title={formatDateForDisplay(day)}
      description="Which rooms are free for a stay starting on this date."
    />
  );

  if (!signedIn) {
    return (
      <PageShell>
        {header}
        <CardPanel title="Sign in to see room availability">
          <div className="flex flex-col gap-4">
            <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
              The calendar colours are open to everyone, but which specific
              rooms are free is shown once you sign in. It takes one tap with a
              Google account, and it&apos;s what lets us hold a booking in your
              name.
            </p>
            <div>
              {/*
                Carries the date through the round trip so the guest lands back
                on the day they were looking at, not on the home page.
              */}
              <LinkButton href={`/signin?next=${encodeURIComponent(`/calendar/${day}`)}`}>
                Sign in with Google
              </LinkButton>
            </div>
          </div>
        </CardPanel>
      </PageShell>
    );
  }

  if (!inWindow) {
    return (
      <PageShell>
        {header}
        <Alert tone="warning" title="Outside the booking window">
          Bookings run from {formatDateForDisplay(window.from)} to{" "}
          {formatDateForDisplay(window.to)}. This date is outside that range, so
          there is nothing to show yet.
        </Alert>
      </PageShell>
    );
  }

  const detail = await fetchDayDetail(day);

  if (detail.unavailable || detail.dayMode === null) {
    return (
      <PageShell>
        {header}
        <EmptyState
          title="Not open for booking"
          description="Our team hasn't opened this date yet. Dates are opened as room nights or as whole-villa nights — check back, or pick another date on the calendar."
          action={
            <LinkButton href="/calendar" variant="secondary" size="sm">
              Back to calendar
            </LinkButton>
          }
        />
      </PageShell>
    );
  }

  const isVillaMode = detail.dayMode === "villa_mode";
  const openItems = detail.items.filter((i) => i.status === "open");

  return (
    <PageShell>
      {header}

      <Alert tone="info" title={isVillaMode ? "Whole-villa night" : "Room night"}>
        {isVillaMode
          ? "On this date the property is let as a whole villa — individual rooms aren't offered."
          : "On this date rooms are let individually. Other guests may be staying in the other rooms."}
      </Alert>

      {detail.items.length === 0 ? (
        <EmptyState
          title="Nothing offered on this date"
          description="This date is open, but no rooms are currently published for it."
        />
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className={cx("text-sm font-semibold uppercase tracking-wide", TEXT_MUTED)}>
            {isVillaMode ? "The villa" : "Rooms"}
          </h2>

          <ul className="flex flex-col gap-2">
            {detail.items.map((item) => (
              <li
                key={item.itemId}
                className={cx(
                  "flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3",
                  BORDER,
                  SURFACE,
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={`/rooms/${item.itemId}`}
                    className={cx(
                      "text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                      TEXT_HEADING,
                    )}
                  >
                    {item.name}
                  </Link>
                  <span className={cx("text-xs", TEXT_MUTED)}>
                    Sleeps up to {item.capacity}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <RoomStatusBadge status={item.status} />
                  {item.status === "open" && (
                    <LinkButton
                      href={`/book?item=${item.itemId}&from=${day}`}
                      size="sm"
                    >
                      Request
                    </LinkButton>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {openItems.length === 0 && (
            <p className={cx("text-sm", TEXT_BODY)}>
              Everything is taken on this date. Try another date on the{" "}
              <Link
                href="/calendar"
                className="font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-500"
              >
                calendar
              </Link>
              .
            </p>
          )}
        </section>
      )}
    </PageShell>
  );
}
