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
import type { DateOnly } from "./dates.ts";

/** One admin's currently-standing vote on a booking. */
export interface StandingVote {
  adminId: string;
  vote: "approve" | "decline";
}

/**
 * Another `reserved` booking on the same item, competing for overlapping
 * dates — MAINTENANCE.md §13 allows several of these to coexist, since only
 * `booked` blocks new reservations. This is the queue that decides which one
 * gets approved first when there is more than one.
 */
export interface CompetingBooking {
  id: string;
  guestName: string;
  createdAt: Date;
  advancePaidDate: DateOnly | null;
}

/**
 * Priority key for the approval queue: a guest who has actually paid the
 * advance outranks one who merely asked first but hasn't paid — the payment
 * is what secures the date in practice, submission order is only a
 * tiebreaker between equally-unpaid requests. Owner decision, 2026-08-27.
 */
function priorityKey(b: { createdAt: Date; advancePaidDate: DateOnly | null }): readonly [0 | 1, string] {
  return b.advancePaidDate !== null ? [0, b.advancePaidDate] : [1, b.createdAt.toISOString()];
}

/** True if `candidate` has a stronger claim than `other` on the same dates. */
function outranks(
  candidate: { createdAt: Date; advancePaidDate: DateOnly | null },
  other: { createdAt: Date; advancePaidDate: DateOnly | null },
): boolean {
  const [tierA, keyA] = priorityKey(candidate);
  const [tierB, keyB] = priorityKey(other);
  return tierA !== tierB ? tierA < tierB : keyA < keyB;
}

/**
 * Among bookings still competing with `target` for the same item and
 * overlapping dates, find the one that should be decided first — or `null`
 * if `target` already has the strongest claim (or there is no competitor).
 * Only ever consulted before an `approve` vote: declining never needs this,
 * since it only frees a date rather than locking one.
 */
export function findApprovalQueueBlocker(
  target: { createdAt: Date; advancePaidDate: DateOnly | null },
  competitors: readonly CompetingBooking[],
): CompetingBooking | null {
  if (competitors.length === 0) return null;
  const strongest = competitors.reduce((best, c) => (outranks(c, best) ? c : best));
  return outranks(strongest, target) ? strongest : null;
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
      action: "rejected";
      reason: "earlier_claim_pending";
      blocker: CompetingBooking;
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
 * An `approve` vote is also rejected outright if `queueBlocker` names a
 * competing `reserved` booking with a stronger claim on the same dates
 * (owner decision, 2026-08-27 — see `findApprovalQueueBlocker` above). This
 * is a hard block, not a warning: the admin must decide the stronger claim
 * first. `decline` is never blocked this way — it only frees a date, so
 * there is nothing to jump ahead of.
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
  queueBlocker: CompetingBooking | null = null,
): VoteOutcome {
  if (currentStatus !== "reserved") {
    return { action: "rejected", reason: "booking_already_resolved", currentStatus };
  }

  if (newVote.vote === "approve" && queueBlocker !== null) {
    return { action: "rejected", reason: "earlier_claim_pending", blocker: queueBlocker };
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
