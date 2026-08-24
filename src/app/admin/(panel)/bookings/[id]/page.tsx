/**
 * Admin booking detail (Slice 12).
 *
 * Three things on one screen, in the order an admin actually needs them:
 * the approval decision, then the editable record, then the audit trail that
 * explains how it got to this state.
 *
 * The audit trail is rendered from `booking_audit_log`, which denormalizes
 * the admin's name at write time — so history reads correctly even for an
 * admin who has since been renamed or deactivated.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BookingStatusBadge,
  PaymentStageBadge,
  Badge,
} from "@/components/ui/badge";
import { CardPanel, DescriptionList, PageHeader, PageShell } from "@/components/ui/card";
import { BORDER, cx, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { fetchAdminBooking } from "@/lib/admin-bookings-service";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatDateForDisplay, nightsOfStay } from "@/lib/dates";
import { BookingEditForm } from "./booking-edit-form";
import { VotePanel } from "./vote-panel";

export const metadata: Metadata = {
  title: "Booking",
  robots: { index: false, follow: false },
};

/** Audit-log field names, in words an admin reads rather than column names. */
const FIELD_LABEL: Record<string, string> = {
  approval_vote: "Approval vote",
  status: "Status",
  guest_name: "Guest name",
  phone: "Phone",
  email: "Email",
  payment_stage: "Payment stage",
  advance_amount: "Advance amount",
  advance_paid_date: "Advance paid on",
  internal_notes: "Internal notes",
};

function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field.replace(/_/g, " ");
}

/** Timestamps are shown in resort time — the timezone every date here means. */
function formatMoment(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Colombo",
  }).format(value);
}

export default async function AdminBookingDetailPage({
  params,
}: PageProps<"/admin/bookings/[id]">) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  const { id } = await params;
  const booking = await fetchAdminBooking(id);
  if (booking === null) notFound();

  const nights = nightsOfStay(booking.checkIn, booking.checkOut).length;
  const approveCount = booking.votes.filter((v) => v.vote === "approve").length;
  const myVote = booking.votes.find((v) => v.adminId === auth.admin.id)?.vote ?? null;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={
          <Link href="/admin/bookings" className="hover:underline">
            &larr; Bookings
          </Link>
        }
        title={booking.guestName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={booking.status} />
            <PaymentStageBadge stage={booking.paymentStage} />
            <span>
              {booking.itemName} · {nights} night{nights === 1 ? "" : "s"}
            </span>
          </span>
        }
      />

      <CardPanel
        title="Approval"
        description="Two different admins must approve before this booking is confirmed. A single decline is final."
      >
        <VotePanel
          bookingId={booking.id}
          status={booking.status}
          myVote={myVote}
          approveCount={approveCount}
        />

        {booking.votes.length > 0 && (
          <ul className="mt-5 flex flex-col gap-2 border-t pt-4 dark:border-stone-800">
            {booking.votes.map((vote) => (
              <li
                key={vote.adminId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className={TEXT_HEADING}>{vote.adminName}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={vote.vote === "approve" ? "open" : "closed"}>
                    {vote.vote === "approve" ? "Approved" : "Declined"}
                  </Badge>
                  <span className={cx("text-xs", TEXT_MUTED)}>
                    {formatMoment(vote.votedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardPanel>

      <CardPanel title="The stay">
        <DescriptionList
          items={[
            { label: "Room / villa", value: booking.itemName },
            {
              label: "Check-in",
              value: formatDateForDisplay(booking.checkIn),
            },
            {
              label: "Check-out",
              value: formatDateForDisplay(booking.checkOut),
            },
            { label: "Nights", value: nights },
            {
              label: "Guests",
              value: `${booking.guestsCount} of ${booking.itemCapacity} capacity`,
            },
            { label: "Requested", value: formatMoment(booking.createdAt) },
          ]}
        />
      </CardPanel>

      <CardPanel
        title="Guest & payment details"
        description="Changes here are recorded in the history below. Status is not editable — it changes only through approval."
      >
        <BookingEditForm
          bookingId={booking.id}
          initial={{
            guestName: booking.guestName,
            phone: booking.phone,
            email: booking.email,
            paymentStage: booking.paymentStage,
            advanceAmount: booking.advanceAmount,
            advancePaidDate: booking.advancePaidDate,
            internalNotes: booking.internalNotes,
          }}
        />
      </CardPanel>

      <CardPanel
        title="History"
        description={`${booking.history.length} recorded change${booking.history.length === 1 ? "" : "s"}, newest first.`}
      >
        {booking.history.length === 0 ? (
          <p className={cx("text-sm", TEXT_BODY)}>
            Nothing has changed since this booking was created.
          </p>
        ) : (
          <ol className="flex flex-col">
            {booking.history.map((entry, i) => (
              <li
                key={entry.id}
                className={cx(
                  "flex flex-col gap-1 py-3",
                  i > 0 && "border-t",
                  i > 0 && BORDER,
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={cx("text-sm font-medium", TEXT_HEADING)}>
                    {fieldLabel(entry.fieldChanged)}
                  </span>
                  <span className={cx("text-xs", TEXT_MUTED)}>
                    {entry.changedByName} · {formatMoment(entry.changedAt)}
                  </span>
                </div>
                <p className={cx("text-sm", TEXT_BODY)}>
                  <span className="line-through opacity-70">
                    {entry.oldValue === null || entry.oldValue === ""
                      ? "(empty)"
                      : entry.oldValue}
                  </span>
                  {" → "}
                  <span className={TEXT_HEADING}>
                    {entry.newValue === null || entry.newValue === ""
                      ? "(empty)"
                      : entry.newValue}
                  </span>
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardPanel>
    </PageShell>
  );
}
