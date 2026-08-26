/**
 * Admin dashboard (Slice 12).
 *
 * The landing screen after sign-in: what needs attention right now, and the
 * one structural warning that stops the whole approval process working.
 *
 * Counts are computed here rather than fetched from an endpoint — a server
 * component on the same server has no reason to round-trip through its own API.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { BookingStatusBadge, PaymentStageBadge } from "@/components/ui/badge";
import { CardPanel, EmptyState, PageHeader, PageShell } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { cx, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { db } from "@/db";
import { adminUsers, bookings } from "@/db/schema";
import {
  fetchUpcomingBookings,
  type AdminBookingListItem,
} from "@/lib/admin-bookings-service";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatDateForDisplay, nightsOfStay, todayAtResort } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const auth = await requireAdmin();
  // The layout above already redirects an unauthenticated caller. Repeated
  // here because a layout is not a security boundary on its own, and this
  // page reads data that must be refused to a non-admin.
  if (!auth.ok) redirect("/admin/login");

  const today = todayAtResort();

  const [[{ activeAdmins }], [{ awaitingApproval }], upcomingBookings] =
    await Promise.all([
      db
        .select({ activeAdmins: count() })
        .from(adminUsers)
        .where(eq(adminUsers.active, true)),
      db
        .select({ awaitingApproval: count() })
        .from(bookings)
        .where(eq(bookings.status, "reserved")),
      // The list itself, not a separate count — the "Upcoming stays" table
      // below is built from the same fetch, so the stat tile and the table
      // can never disagree about how many there are.
      fetchUpcomingBookings(today),
    ]);

  // Two different admins must approve before a booking is confirmed, so a
  // single-admin team cannot confirm anything at all. Worth saying plainly
  // rather than letting it be discovered when the first booking gets stuck.
  const canConfirmBookings = activeAdmins >= 2;

  const stats: Array<{ label: string; value: number; href: string }> = [
    { label: "Awaiting approval", value: awaitingApproval, href: "/admin/bookings?status=reserved" },
    // Anchors down to the table below rather than off to the filtered list —
    // the count and the worklist it describes now live on the same page.
    { label: "Upcoming stays", value: upcomingBookings.length, href: "#upcoming-stays" },
    { label: "Active admins", value: activeAdmins, href: "/admin/accounts" },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={formatDateForDisplay(today)}
        title={`Signed in as ${auth.admin.name}`}
        description={`${auth.admin.email} · ${
          auth.admin.role === "super_admin" ? "Super admin" : "Admin"
        }`}
        actions={<LinkButton href="/admin/bookings">Go to bookings</LinkButton>}
      />

      {!canConfirmBookings && (
        <Alert tone="warning" title="No booking can be confirmed yet">
          Confirming a booking takes approval from two different admins, and
          yours is currently the only active account. Until a second admin
          exists, guests can request a stay but nothing can move from requested
          to confirmed.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="flex flex-col gap-1 rounded-md border border-stone-300 bg-white px-4 py-4 transition-colors hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-teal-600"
          >
            <span
              className={cx(
                "text-xs font-medium uppercase tracking-wide",
                TEXT_MUTED,
              )}
            >
              {stat.label}
            </span>
            <span className={cx("text-2xl font-semibold", TEXT_HEADING)}>
              {stat.value}
            </span>
          </Link>
        ))}
      </div>

      <div id="upcoming-stays">
        <CardPanel
          title="Upcoming stays"
          description="Every request or confirmed stay not yet arrived, soonest first — the list to work down for advance calls or emails."
        >
          <UpcomingStaysTable rows={upcomingBookings} />
        </CardPanel>
      </div>

      <CardPanel title="How approval works">
        <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
          A guest&apos;s request arrives as <strong>Reserved</strong>. Two
          different admins must approve it before it becomes{" "}
          <strong>Confirmed</strong>. A single decline from either admin
          declines it outright — there is no tiebreaker, and a declined booking
          cannot be re-opened by voting again.
        </p>
      </CardPanel>
    </PageShell>
  );
}

/**
 * The outreach worklist. Deliberately its own table rather than reusing the
 * filterable `/admin/bookings` list's column set: that screen is a general
 * browse/search tool, this one exists specifically to prep contact — so email
 * sits inline instead of one click away, and there is no page-wide filter form
 * to distract from the thing being reused.
 */
function UpcomingStaysTable({ rows }: { rows: AdminBookingListItem[] }) {
  return (
    <DataTable<AdminBookingListItem>
      caption={`Upcoming stays, ${rows.length} row${rows.length === 1 ? "" : "s"}`}
      rows={rows}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          title="Nothing upcoming"
          description="Guest requests and confirmed stays yet to arrive will appear here."
        />
      }
      columns={[
        {
          key: "guest",
          header: "Guest",
          cell: (row) => (
            <div className="flex flex-col gap-0.5">
              <Link
                href={`/admin/bookings/${row.id}`}
                className="font-medium text-teal-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-teal-500"
              >
                {row.guestName}
              </Link>
              <span className={cx("text-xs", TEXT_MUTED)}>{row.phone}</span>
              <span className={cx("text-xs", TEXT_MUTED)}>{row.email}</span>
            </div>
          ),
        },
        {
          key: "item",
          header: "Room",
          hideOnMobile: true,
          cell: (row) => (
            <span className="text-sm">
              {row.itemName}
              <span className={cx("block text-xs", TEXT_MUTED)}>
                {row.guestsCount} guest{row.guestsCount === 1 ? "" : "s"}
              </span>
            </span>
          ),
        },
        {
          key: "checkIn",
          header: "Check-in",
          cell: (row) => {
            const nights = nightsOfStay(row.checkIn, row.checkOut).length;
            return (
              <span className="text-xs whitespace-nowrap">
                {formatDateForDisplay(row.checkIn)}
                <span className={cx("block", TEXT_MUTED)}>
                  {nights} night{nights === 1 ? "" : "s"}
                </span>
              </span>
            );
          },
        },
        {
          key: "status",
          header: "Status",
          cell: (row) => (
            <div className="flex flex-col items-start gap-1">
              <BookingStatusBadge status={row.status} />
              {row.status === "reserved" && (
                <span className={cx("text-xs", TEXT_MUTED)}>
                  {row.approveCount} of 2 approvals
                </span>
              )}
            </div>
          ),
        },
        {
          key: "payment",
          header: "Payment",
          hideOnMobile: true,
          cell: (row) => <PaymentStageBadge stage={row.paymentStage} />,
        },
        {
          key: "open",
          header: <span className="sr-only">Actions</span>,
          cell: (row) => (
            <LinkButton href={`/admin/bookings/${row.id}`} variant="secondary" size="sm">
              Open
            </LinkButton>
          ),
        },
      ]}
    />
  );
}
