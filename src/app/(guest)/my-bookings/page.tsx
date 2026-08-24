/**
 * A customer's own bookings (Slice 12).
 *
 * Scoped by `customer_id` from the session — never by anything in the URL, so
 * there is no id to tamper with to read someone else's stays.
 *
 * Reads the database directly rather than calling `GET /bookings/my`: that
 * endpoint was never built, and a server component on the same server has no
 * reason to round-trip through its own API. See docs/API_DOCUMENTATION.md.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { BookingStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, PageShell } from "@/components/ui/card";
import { BORDER, cx, SURFACE, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { db } from "@/db";
import { bookableItems, bookings, type BookingStatus } from "@/db/schema";
import {
  formatDateForDisplay,
  nightsOfStay,
  todayAtResort,
  type DateOnly,
} from "@/lib/dates";

export const metadata: Metadata = {
  title: "My bookings",
  robots: { index: false, follow: false },
};

/** What the guest should understand each status to mean, in their terms. */
const STATUS_EXPLANATION: Record<BookingStatus, string> = {
  reserved:
    "We have your request and our team is reviewing it. Nothing is confirmed yet.",
  booked: "Confirmed — your stay is held. We'll be in touch about payment.",
  declined:
    "We weren't able to take this booking. Please get in touch if you'd like to look at other dates.",
};

export default async function MyBookingsPage({
  searchParams,
}: PageProps<"/my-bookings">) {
  const session = await auth();
  const customerId = session?.user?.id;
  if (customerId == null) {
    redirect(`/signin?next=${encodeURIComponent("/my-bookings")}`);
  }

  const params = await searchParams;
  const justCreated = params.created === "1";

  const rows = await db
    .select({
      id: bookings.id,
      itemName: bookableItems.name,
      itemId: bookableItems.id,
      kind: bookableItems.kind,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      guestsCount: bookings.guestsCount,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(bookableItems, eq(bookings.bookableItemId, bookableItems.id))
    .where(eq(bookings.customerId, customerId))
    .orderBy(desc(bookings.checkIn));

  const today = todayAtResort();
  const upcoming = rows.filter((r) => r.checkOut > today);
  const past = rows.filter((r) => r.checkOut <= today);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Your stays"
        title="My bookings"
        description="Every request you've sent us, and where each one stands."
        actions={<LinkButton href="/calendar">Book another stay</LinkButton>}
      />

      {justCreated && (
        <Alert tone="success" title="Request sent">
          Our team will review it shortly. It stays as &ldquo;awaiting
          confirmation&rdquo; until two of our admins have approved it.
        </Alert>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="When you request a stay it'll appear here, along with whether it's been confirmed."
          action={<LinkButton href="/calendar" size="sm">Check availability</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <BookingGroup
            heading="Upcoming"
            rows={upcoming}
            emptyText="Nothing upcoming."
          />
          {past.length > 0 && (
            <BookingGroup heading="Past" rows={past} emptyText="" muted />
          )}
        </div>
      )}
    </PageShell>
  );
}

interface BookingRow {
  id: string;
  itemName: string;
  itemId: string;
  kind: "room" | "villa";
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  status: BookingStatus;
}

function BookingGroup({
  heading,
  rows,
  emptyText,
  muted = false,
}: {
  heading: string;
  rows: BookingRow[];
  emptyText: string;
  muted?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={cx("text-sm font-semibold uppercase tracking-wide", TEXT_MUTED)}>
        {heading}
      </h2>

      {rows.length === 0 ? (
        <p className={cx("text-sm", TEXT_BODY)}>{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const nights = nightsOfStay(
              row.checkIn as DateOnly,
              row.checkOut as DateOnly,
            ).length;

            return (
              <li
                key={row.id}
                className={cx(
                  "flex flex-col gap-3 rounded-md border px-4 py-4",
                  BORDER,
                  SURFACE,
                  muted && "opacity-75",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={`/rooms/${row.itemId}`}
                      className={cx(
                        "text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                        TEXT_HEADING,
                      )}
                    >
                      {row.itemName}
                    </Link>
                    <span className={cx("text-xs", TEXT_MUTED)}>
                      {row.kind === "villa" ? "Whole villa" : "Room"} ·{" "}
                      {row.guestsCount} guest{row.guestsCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <BookingStatusBadge status={row.status} audience="guest" />
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                  <div className="flex flex-col gap-0.5">
                    <dt className={cx("text-xs font-medium uppercase tracking-wide", TEXT_MUTED)}>
                      Check-in
                    </dt>
                    <dd className={cx("text-sm", TEXT_HEADING)}>
                      {formatDateForDisplay(row.checkIn as DateOnly)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className={cx("text-xs font-medium uppercase tracking-wide", TEXT_MUTED)}>
                      Check-out
                    </dt>
                    <dd className={cx("text-sm", TEXT_HEADING)}>
                      {formatDateForDisplay(row.checkOut as DateOnly)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className={cx("text-xs font-medium uppercase tracking-wide", TEXT_MUTED)}>
                      Nights
                    </dt>
                    <dd className={cx("text-sm", TEXT_HEADING)}>{nights}</dd>
                  </div>
                </dl>

                <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
                  {STATUS_EXPLANATION[row.status]}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
