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

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  approvalVotes,
  bookingAuditLog,
  bookings,
  type BookingStatus,
} from "@/db/schema";
import { decideVoteOutcome, type StandingVote } from "./vote";

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
  | { ok: false; status: 409; error: string; currentStatus: BookingStatus };

/**
 * Cast (or overwrite) one admin's vote on a booking, atomically updating
 * the booking's status if this vote resolves it.
 *
 * A vote on a booking whose status is already `booked` or `declined` is
 * rejected 409 rather than silently no-op'd — a stale form submission
 * should surface as a real error to the caller, not appear to succeed.
 */
export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  return db.transaction(async (tx) => {
    // Lock the booking row for the duration of the transaction so a
    // concurrent second vote arriving at the same instant cannot both read
    // "reserved" and both apply — one will queue behind the other, see the
    // updated status, and (correctly) get rejected 409 if the first vote
    // resolved the booking.
    const [booking] = await tx
      .select({ id: bookings.id, status: bookings.status })
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

    const outcome = decideVoteOutcome(booking.status, standing, {
      adminId: input.adminId,
      vote: input.vote,
    });

    if (outcome.action === "rejected") {
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

    return {
      ok: true,
      previousVote: outcome.previousVote,
      previousStatus: booking.status,
      nextStatus: outcome.nextStatus,
      statusChanged: outcome.statusChanged,
    };
  });
}
