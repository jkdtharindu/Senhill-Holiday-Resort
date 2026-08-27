/**
 * Database-backed orchestration for ApprovalVotes.
 *
 * Split from the pure decision logic in lib/vote.ts, same pattern as
 * lib/booking-service.ts and lib/day-mode-service.ts: the route stays a thin
 * HTTP adapter, and this module owns the fetch-decide-write cycle.
 *
 * Everything writable happens inside one transaction: the vote insert-or-
 * update, the booking's status change (when applicable), and one or two
 * booking_audit_log entries. If any step fails, all three roll back — a
 * booking must never be seen as `booked` without the second admin's vote
 * row actually existing, and a status change must never appear in
 * booking_audit_log without the corresponding vote being recorded.
 *
 * The audit log's `changed_by_name` is denormalized on purpose (see
 * schema.ts comment) — the history has to still read correctly if the admin
 * is later renamed or deactivated.
 */

import { and, eq, gt, lte, ne, sql } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import {
  approvalVotes,
  bookableItems,
  bookingAuditLog,
  bookings,
  type BookingStatus,
} from "@/db/schema";
import {
  decideVoteOutcome,
  findApprovalQueueBlocker,
  type CompetingBooking,
  type StandingVote,
} from "./vote";
import { sendEmail } from "./email";
import { bookingApprovedEmail, bookingDeclinedEmail } from "./email-templates";

export interface CastVoteInput {
  bookingId: string;
  adminId: string;
  adminName: string; // denormalized into the audit log per schema
  vote: "approve" | "decline";
}

export type CastVoteResult =
  | {
      ok: true;
      previousVote: "approve" | "decline" | null;
      previousStatus: BookingStatus;
      nextStatus: BookingStatus;
      statusChanged: boolean;
    }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string; currentStatus: BookingStatus }
  | { ok: false; status: 409; error: string; blockedBy: { bookingId: string; guestName: string } };

/**
 * Cast (or overwrite) one admin's vote on a booking, atomically updating
 * the booking's status if this vote resolves it.
 *
 * A vote on a booking whose status is already `booked` or `declined` is
 * rejected 409 rather than silently no-op'd — a stale form submission
 * should surface as a real error to the caller, not appear to succeed.
 */
export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  let notification: VoteResolvedNotification | null = null;

  const result = await db.transaction(async (tx): Promise<CastVoteResult> => {
    // Lock the booking row for the duration of the transaction so a
    // concurrent second vote arriving at the same instant cannot both read
    // "reserved" and both apply — one will queue behind the other, see the
    // updated status, and (correctly) get rejected 409 if the first vote
    // resolved the booking.
    const [booking] = await tx
      .select({
        id: bookings.id,
        status: bookings.status,
        bookableItemId: bookings.bookableItemId,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        createdAt: bookings.createdAt,
        advancePaidDate: bookings.advancePaidDate,
        guestName: bookings.guestName,
        email: bookings.email,
        guestsCount: bookings.guestsCount,
      })
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .for("update")
      .limit(1);

    if (!booking) {
      return { ok: false, status: 404 as const, error: "Booking not found." };
    }

    const existingVotes = await tx
      .select({ adminId: approvalVotes.adminId, vote: approvalVotes.vote })
      .from(approvalVotes)
      .where(eq(approvalVotes.bookingId, input.bookingId));

    const standing: StandingVote[] = existingVotes.map((v) => ({
      adminId: v.adminId,
      vote: v.vote,
    }));

    // Only fetched for an approve vote — a decline never needs the queue
    // check, since it only frees a date rather than locking one (owner
    // decision, 2026-08-27; see docs/MAINTENANCE.md §13 and lib/vote.ts).
    let queueBlocker: CompetingBooking | null = null;
    if (input.vote === "approve") {
      const competitors = await tx
        .select({
          id: bookings.id,
          guestName: bookings.guestName,
          createdAt: bookings.createdAt,
          advancePaidDate: bookings.advancePaidDate,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.bookableItemId, booking.bookableItemId),
            eq(bookings.status, "reserved"),
            ne(bookings.id, booking.id),
            lte(bookings.checkIn, booking.checkOut),
            gt(bookings.checkOut, booking.checkIn),
          ),
        );

      queueBlocker = findApprovalQueueBlocker(
        { createdAt: booking.createdAt, advancePaidDate: booking.advancePaidDate },
        competitors,
      );
    }

    const outcome = decideVoteOutcome(
      booking.status,
      standing,
      { adminId: input.adminId, vote: input.vote },
      queueBlocker,
    );

    if (outcome.action === "rejected") {
      if (outcome.reason === "earlier_claim_pending") {
        return {
          ok: false,
          status: 409 as const,
          error:
            `${outcome.blocker.guestName}'s booking for overlapping dates was received first` +
            (outcome.blocker.advancePaidDate ? " and has an advance payment recorded" : "") +
            " — decide that one before approving this one.",
          blockedBy: { bookingId: outcome.blocker.id, guestName: outcome.blocker.guestName },
        };
      }
      return {
        ok: false,
        status: 409 as const,
        error: `This booking is already ${outcome.currentStatus} — voting is closed on it.`,
        currentStatus: outcome.currentStatus,
      };
    }

    // Insert or overwrite this admin's vote. ON CONFLICT respects the
    // schema's unique constraint on (booking_id, admin_id).
    await tx
      .insert(approvalVotes)
      .values({
        bookingId: input.bookingId,
        adminId: input.adminId,
        vote: input.vote,
      })
      .onConflictDoUpdate({
        target: [approvalVotes.bookingId, approvalVotes.adminId],
        set: { vote: input.vote, votedAt: sql`now()` },
      });

    // Audit-log entry for the vote itself — always written, whether the
    // vote changed status or not, so the trail is complete.
    await tx.insert(bookingAuditLog).values({
      bookingId: input.bookingId,
      changedBy: input.adminId,
      changedByName: input.adminName,
      fieldChanged: "approval_vote",
      oldValue: outcome.previousVote,
      newValue: input.vote,
    });

    if (outcome.statusChanged) {
      await tx
        .update(bookings)
        .set({ status: outcome.nextStatus, updatedAt: sql`now()` })
        .where(eq(bookings.id, input.bookingId));

      await tx.insert(bookingAuditLog).values({
        bookingId: input.bookingId,
        changedBy: input.adminId,
        changedByName: input.adminName,
        fieldChanged: "status",
        oldValue: booking.status,
        newValue: outcome.nextStatus,
      });
    }

    // Only booked/declined are worth emailing about — a vote that doesn't
    // resolve the booking yet (e.g. the first of two approvals) is not
    // guest-visible news. Captured here, sent AFTER the transaction commits
    // (below) — same reasoning as booking-service.ts: a mail failure, or
    // even just mail latency, must never affect whether the vote itself
    // commits.
    if (outcome.statusChanged && (outcome.nextStatus === "booked" || outcome.nextStatus === "declined")) {
      notification = {
        bookableItemId: booking.bookableItemId,
        guestName: booking.guestName,
        email: booking.email,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guestsCount: booking.guestsCount,
        nextStatus: outcome.nextStatus,
      };
    }

    return {
      ok: true,
      previousVote: outcome.previousVote,
      previousStatus: booking.status,
      nextStatus: outcome.nextStatus,
      statusChanged: outcome.statusChanged,
    };
  });

  // See booking-service.ts's `createBooking` for why this is `after(...)`
  // rather than a bare fire-and-forget promise — the latter can be killed by
  // Vercel's serverless runtime before it finishes, once the response is sent.
  if (notification) {
    const toSend = notification;
    after(() =>
      notifyVoteResolved(toSend).catch((err: unknown) => {
        console.error("[vote-service] notifyVoteResolved failed:", err);
      }),
    );
  }

  return result;
}

interface VoteResolvedNotification {
  bookableItemId: string;
  guestName: string;
  email: string;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  nextStatus: "booked" | "declined";
}

async function notifyVoteResolved(input: VoteResolvedNotification): Promise<void> {
  const [item] = await db
    .select({ name: bookableItems.name })
    .from(bookableItems)
    .where(eq(bookableItems.id, input.bookableItemId))
    .limit(1);
  const itemName = item?.name ?? "your booking";

  const details = {
    guestName: input.guestName,
    itemName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestsCount: input.guestsCount,
  };

  const content =
    input.nextStatus === "booked" ? bookingApprovedEmail(details) : bookingDeclinedEmail(details);

  await sendEmail({
    to: input.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
}
