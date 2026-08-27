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
import {
  BookingStatusBadge,
  EmailOutcomeBadge,
  emailEventLabel,
  PaymentStageBadge,
} from "@/components/ui/badge";
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
import {
  formatDateForDisplay,
  formatMoment,
  nightsOfStay,
  todayAtResort,
} from "@/lib/dates";
import { DAILY_SEND_LIMIT, volumeLevel } from "@/lib/email-log";
import {
  countFailuresToday,
  countRecipientsSentToday,
  fetchRecentEmailLog,
  type EmailLogEntry,
} from "@/lib/email-log-service";

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

  const [
    [{ activeAdmins }],
    [{ awaitingApproval }],
    upcomingBookings,
    emailsSentToday,
    emailFailuresToday,
    recentEmails,
  ] = await Promise.all([
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
    countRecipientsSentToday(),
    countFailuresToday(),
    fetchRecentEmailLog(8),
  ]);

  // Two different admins must approve before a booking is confirmed, so a
  // single-admin team cannot confirm anything at all. Worth saying plainly
  // rather than letting it be discovered when the first booking gets stuck.
  const canConfirmBookings = activeAdmins >= 2;

  // `null` means the count could not be read at all (see
  // countRecipientsSentToday) — distinct from a genuine zero, and shown as
  // "unknown" rather than quietly rendering 0 and implying all is well.
  const emailLevel = emailsSentToday === null ? null : volumeLevel(emailsSentToday);

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

      {emailLevel === "at_limit" && (
        <Alert tone="error" title="Email sending has stopped for today">
          {emailsSentToday} recipients have been emailed today, hitting the{" "}
          {DAILY_SEND_LIMIT} safety limit. No further email will go out until
          tomorrow — guests will not receive booking confirmations in the
          meantime. This limit is far above normal traffic for this property,
          so treat it as a sign of a fault or unusual activity rather than a
          busy day.
        </Alert>
      )}

      {emailLevel === "elevated" && (
        <Alert tone="warning" title="Unusually high email volume today">
          {emailsSentToday} recipients emailed today, against a safety limit of{" "}
          {DAILY_SEND_LIMIT}. A normal day here is single digits, so this is
          worth a look — check the recent sends below for anything repeating.
        </Alert>
      )}

      {emailFailuresToday > 0 && (
        <Alert tone="warning" title={`${emailFailuresToday} email${emailFailuresToday === 1 ? "" : "s"} failed today`}>
          The mail provider rejected {emailFailuresToday === 1 ? "an email" : "these emails"}, so
          the intended recipient did not receive{" "}
          {emailFailuresToday === 1 ? "it" : "them"}. See the reasons under
          recent email activity below — a guest may need contacting directly.
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

      <CardPanel
        title="Recent email activity"
        description={
          emailsSentToday === null
            ? "Today's total could not be read — the entries below may be incomplete."
            : `${emailsSentToday} recipient${emailsSentToday === 1 ? "" : "s"} emailed today, of a ${DAILY_SEND_LIMIT} daily safety limit.`
        }
      >
        <RecentEmailTable rows={recentEmails} />
        <p className={cx("mt-3 text-xs leading-relaxed", TEXT_MUTED)}>
          &ldquo;Sent&rdquo; means the mail provider accepted the message, not
          that it reached an inbox — a later bounce is not recorded here.
        </p>
      </CardPanel>

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
 * Recent email attempts, newest first.
 *
 * Exists because `sendEmail` swallows its own errors by design, so without a
 * visible record a total mail outage looks identical to a quiet day — which
 * is exactly what happened on 2026-08-27 (see MEMORY.md). Failures show their
 * reason inline rather than behind a click: the whole point is that nobody
 * should have to go looking to find out something broke.
 */
function RecentEmailTable({ rows }: { rows: EmailLogEntry[] }) {
  return (
    <DataTable<EmailLogEntry>
      caption={`Recent email attempts, ${rows.length} row${rows.length === 1 ? "" : "s"}`}
      rows={rows}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          title="No email sent yet"
          description="Booking confirmations, approval notices and cancellation emails will be listed here as they go out."
        />
      }
      columns={[
        {
          key: "event",
          header: "Email",
          cell: (row) => (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{emailEventLabel(row.event)}</span>
              <span className={cx("text-xs", TEXT_MUTED)}>{row.recipients}</span>
            </div>
          ),
        },
        {
          key: "outcome",
          header: "Outcome",
          cell: (row) => (
            <div className="flex flex-col items-start gap-1">
              <EmailOutcomeBadge outcome={row.outcome} />
              {row.errorMessage !== null && (
                <span className="text-xs text-rose-700 dark:text-rose-400">
                  {row.errorMessage}
                </span>
              )}
            </div>
          ),
        },
        {
          key: "sentAt",
          header: "When",
          hideOnMobile: true,
          cell: (row) => (
            <span className={cx("text-xs whitespace-nowrap", TEXT_MUTED)}>
              {formatMoment(row.sentAt)}
            </span>
          ),
        },
      ]}
    />
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
