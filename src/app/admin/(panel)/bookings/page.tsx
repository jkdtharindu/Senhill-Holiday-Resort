/**
 * Admin bookings list (Slice 12).
 *
 * Filters live in the URL rather than component state, so a filtered view is
 * a link an admin can bookmark or send to a colleague — "the ones waiting on
 * approval" is `?status=reserved`, which is exactly what the dashboard tile
 * links to.
 *
 * The filter form submits with GET for the same reason: no JavaScript needed,
 * and the result is a real URL rather than a POST an admin cannot re-share.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { BookingStatusBadge, PaymentStageBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CardPanel, EmptyState, PageHeader, PageShell } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { cx, TEXT_MUTED } from "@/components/ui/styles";
import type { BookingStatus } from "@/db/schema";
import {
  fetchAdminBookings,
  type AdminBookingListItem,
} from "@/lib/admin-bookings-service";
import { formatDateForDisplay, isValidDateOnly, type DateOnly } from "@/lib/dates";
import { fetchItems } from "@/lib/items-service";

export const metadata: Metadata = {
  title: "Bookings",
  robots: { index: false, follow: false },
};

const STATUSES: BookingStatus[] = ["reserved", "booked", "declined"];

function asStatus(raw: unknown): BookingStatus | undefined {
  return typeof raw === "string" && (STATUSES as string[]).includes(raw)
    ? (raw as BookingStatus)
    : undefined;
}

function asDate(raw: unknown): DateOnly | undefined {
  return typeof raw === "string" && isValidDateOnly(raw) ? (raw as DateOnly) : undefined;
}

export default async function AdminBookingsPage({
  searchParams,
}: PageProps<"/admin/bookings">) {
  const params = await searchParams;

  const status = asStatus(params.status);
  const from = asDate(params.from);
  const to = asDate(params.to);
  const q = typeof params.q === "string" ? params.q : undefined;
  const itemId = typeof params.item === "string" ? params.item : undefined;

  const [rows, items] = await Promise.all([
    fetchAdminBookings({ status, from, to, q, itemId }),
    fetchItems({ includeInactive: true }),
  ]);

  const anyFilter =
    status !== undefined ||
    from !== undefined ||
    to !== undefined ||
    itemId !== undefined ||
    (q !== undefined && q !== "");

  const inputClass =
    "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Admin"
        title="Bookings"
        description={`${rows.length} booking${rows.length === 1 ? "" : "s"}${anyFilter ? " matching these filters" : " in total"}.`}
        actions={
          anyFilter ? (
            <LinkButton href="/admin/bookings" variant="secondary" size="sm">
              Clear filters
            </LinkButton>
          ) : undefined
        }
      />

      <CardPanel title="Filter">
        <form method="GET" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-status" className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Status
              </label>
              <select id="f-status" name="status" defaultValue={status ?? ""} className={inputClass}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "reserved" ? "Reserved (awaiting approval)" : s === "booked" ? "Confirmed" : "Declined"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-item" className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Room / villa
              </label>
              <select id="f-item" name="item" defaultValue={itemId ?? ""} className={inputClass}>
                <option value="">Any</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-from" className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Staying on or after
              </label>
              <input id="f-from" name="from" type="date" defaultValue={from ?? ""} className={inputClass} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-to" className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Staying on or before
              </label>
              <input id="f-to" name="to" type="date" defaultValue={to ?? ""} className={inputClass} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-q" className="text-sm font-medium text-stone-800 dark:text-stone-200">
              Search guest
            </label>
            <input
              id="f-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Name, phone or email"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            className="self-start rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
          >
            Apply filters
          </button>
        </form>
      </CardPanel>

      <DataTable<AdminBookingListItem>
        caption={`Bookings, ${rows.length} row${rows.length === 1 ? "" : "s"}`}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            title={anyFilter ? "No bookings match these filters" : "No bookings yet"}
            description={
              anyFilter
                ? "Try widening the date range or clearing the search."
                : "Guest requests will appear here as they come in."
            }
            action={
              anyFilter ? (
                <LinkButton href="/admin/bookings" variant="secondary" size="sm">
                  Clear filters
                </LinkButton>
              ) : undefined
            }
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
            key: "dates",
            header: "Dates",
            cell: (row) => (
              <span className="text-xs whitespace-nowrap">
                {formatDateForDisplay(row.checkIn)}
                <span className={cx("block", TEXT_MUTED)}>
                  to {formatDateForDisplay(row.checkOut)}
                </span>
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (row) => (
              <div className="flex flex-col items-start gap-1">
                <BookingStatusBadge status={row.status} />
                {row.status === "reserved" && (
                  // Surfaced in the list because it is the single thing an
                  // admin scanning this table wants to know: is this one
                  // waiting on me, or on someone else?
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
    </PageShell>
  );
}
