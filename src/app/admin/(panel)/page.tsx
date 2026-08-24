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
import { and, count, eq, gte, inArray } from "drizzle-orm";

import { LinkButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CardPanel, PageHeader, PageShell } from "@/components/ui/card";
import { cx, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { db } from "@/db";
import { adminUsers, bookings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatDateForDisplay, todayAtResort } from "@/lib/dates";

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

  const [[{ activeAdmins }], [{ awaitingApproval }], [{ upcoming }]] =
    await Promise.all([
      db
        .select({ activeAdmins: count() })
        .from(adminUsers)
        .where(eq(adminUsers.active, true)),
      db
        .select({ awaitingApproval: count() })
        .from(bookings)
        .where(eq(bookings.status, "reserved")),
      db
        .select({ upcoming: count() })
        .from(bookings)
        .where(
          and(
            inArray(bookings.status, ["reserved", "booked"]),
            gte(bookings.checkIn, today),
          ),
        ),
    ]);

  // Two different admins must approve before a booking is confirmed, so a
  // single-admin team cannot confirm anything at all. Worth saying plainly
  // rather than letting it be discovered when the first booking gets stuck.
  const canConfirmBookings = activeAdmins >= 2;

  const stats: Array<{ label: string; value: number; href: string }> = [
    { label: "Awaiting approval", value: awaitingApproval, href: "/admin/bookings?status=reserved" },
    { label: "Upcoming stays", value: upcoming, href: "/admin/bookings" },
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
