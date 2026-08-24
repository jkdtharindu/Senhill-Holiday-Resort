/**
 * ApprovalVote state-transition logic — the core trust mechanism of the
 * whole system (docs/PRD.md §10, docs/HITL.md).
 *
 * Two distinct admins' `approve` votes move a booking from `reserved` to
 * `booked`. A single `decline` from either required admin moves it to
 * `declined` immediately, with no tiebreaker. An admin re-voting overwrites
 * their own prior vote rather than adding to the tally — the unique
 * constraint on (booking_id, admin_id) in the schema enforces the same rule
 * structurally, so this module and the database cannot disagree about who
 * has voted.
 *
 * Kept pure, same pattern as lib/day-mode.ts and lib/booking.ts: the caller
 * fetches the current votes and the booking's current status once, and this
 * module decides the outcome — testable without a database, and the one
 * place this rule lives.
 */

import type { BookingStatus } from "../db/schema.ts";

/** One admin's currently-standing vote on a booking. */
export interface StandingVote {
  adminId: string;
  vote: "approve" | "decline";
}

/**
 * What happens when a new vote is applied to a booking.
 *
 * `nextStatus` is the booking status AFTER the vote is written, computed
 * from every distinct admin's currently-standing vote (including the new
 * one). `previousVote` is what this admin's vote was BEFORE this call, or
 * null on first vote — used for the audit-log entry and to distinguish an
 * insert from an update at the caller.
 */
export type VoteOutcome =
  | {
      action: "rejected";
      reason: "booking_already_resolved";
      currentStatus: BookingStatus;
    }
  | {
      action: "applied";
      previousVote: "approve" | "decline" | null;
      nextStatus: BookingStatus;
      statusChanged: boolean;
    };

/**
 * Decide the outcome of a new vote.
 *
 * A vote on a booking whose status is anything other than `reserved` is
 * rejected outright — once the two-admin process has resolved a booking to
 * `booked` or `declined`, further voting is a bug in the caller (a stale
 * form submission, say), not a legitimate action.
 *
 * Otherwise the vote is applied. The next status is computed by projecting
 * what the standing-votes list looks like AFTER this vote overwrites any
 * prior vote from the same admin:
 *   - any `decline` in the resulting set → `declined` (no tiebreaker: even
 *     if the vote list also contains an `approve`, a decline is terminal)
 *   - two or more `approve` votes from distinct admins → `booked`
 *   - otherwise → still `reserved` (one approve so far, or nothing)
 */
export function decideVoteOutcome(
  currentStatus: BookingStatus,
  standingVotes: readonly StandingVote[],
  newVote: { adminId: string; vote: "approve" | "decline" },
): VoteOutcome {
  if (currentStatus !== "reserved") {
    return { action: "rejected", reason: "booking_already_resolved", currentStatus };
  }

  const previousVote = standingVotes.find((v) => v.adminId === newVote.adminId)?.vote ?? null;

  // Project what the votes will look like AFTER this vote is written:
  // the new vote replaces any prior vote from the same admin.
  const projected: StandingVote[] = [
    ...standingVotes.filter((v) => v.adminId !== newVote.adminId),
    { adminId: newVote.adminId, vote: newVote.vote },
  ];

  const nextStatus: BookingStatus = deriveStatusFromVotes(projected);

  return {
    action: "applied",
    previousVote,
    nextStatus,
    statusChanged: nextStatus !== currentStatus,
  };
}

/**
 * Booking status derived from the currently-standing votes on it.
 *
 * Exported for tests, not for callers — the real flow goes through
 * `decideVoteOutcome` above, which projects the post-write state before
 * calling this. A booking with no votes yet is `reserved` (its default);
 * this function assumes the caller only passes it for bookings that are
 * genuinely in the voting phase.
 */
export function deriveStatusFromVotes(votes: readonly StandingVote[]): BookingStatus {
  if (votes.some((v) => v.vote === "decline")) return "declined";

  const distinctApprovers = new Set(
    votes.filter((v) => v.vote === "approve").map((v) => v.adminId),
  );
  if (distinctApprovers.size >= 2) return "booked";

  return "reserved";
}
