/**
 * Tests for ApprovalVote state-transition logic. The property worth proving
 * most carefully: an admin re-voting NEVER double-counts — their new vote
 * replaces the old one wherever they had one, per the unique constraint on
 * (booking_id, admin_id) — and a decline is terminal: once cast, it beats
 * any number of approves in the same standing set.
 *
 * The rules exercised here are the same trust mechanism enforced by the
 * unique constraint in the schema; disagreement between the two would be a
 * silent correctness bug. Every transition below has a corresponding live-DB
 * verification pass logged in docs/tasks.md.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideVoteOutcome, deriveStatusFromVotes, type StandingVote } from "./vote.ts";

const ALICE = "admin-alice";
const BOB = "admin-bob";
const CAROL = "admin-carol";

describe("decideVoteOutcome — rejects votes on resolved bookings", () => {
  it("rejects a vote on a booked booking", () => {
    const outcome = decideVoteOutcome("booked", [], { adminId: ALICE, vote: "approve" });
    assert.deepEqual(outcome, {
      action: "rejected",
      reason: "booking_already_resolved",
      currentStatus: "booked",
    });
  });

  it("rejects a vote on a declined booking, even trying to flip it back with approve", () => {
    const outcome = decideVoteOutcome("declined", [], { adminId: ALICE, vote: "approve" });
    assert.equal(outcome.action, "rejected");
  });
});

describe("decideVoteOutcome — first vote on a reserved booking", () => {
  it("one approve stays reserved (need two distinct admins)", () => {
    const outcome = decideVoteOutcome("reserved", [], { adminId: ALICE, vote: "approve" });
    assert.deepEqual(outcome, {
      action: "applied",
      previousVote: null,
      nextStatus: "reserved",
      statusChanged: false,
    });
  });

  it("one decline moves straight to declined", () => {
    const outcome = decideVoteOutcome("reserved", [], { adminId: ALICE, vote: "decline" });
    assert.deepEqual(outcome, {
      action: "applied",
      previousVote: null,
      nextStatus: "declined",
      statusChanged: true,
    });
  });
});

describe("decideVoteOutcome — second vote from a distinct admin", () => {
  it("second approve from a distinct admin moves reserved -> booked", () => {
    const existing: StandingVote[] = [{ adminId: ALICE, vote: "approve" }];
    const outcome = decideVoteOutcome("reserved", existing, { adminId: BOB, vote: "approve" });
    assert.deepEqual(outcome, {
      action: "applied",
      previousVote: null,
      nextStatus: "booked",
      statusChanged: true,
    });
  });

  it("decline from a distinct admin overrides a prior approve — declined wins", () => {
    const existing: StandingVote[] = [{ adminId: ALICE, vote: "approve" }];
    const outcome = decideVoteOutcome("reserved", existing, { adminId: BOB, vote: "decline" });
    assert.deepEqual(outcome, {
      action: "applied",
      previousVote: null,
      nextStatus: "declined",
      statusChanged: true,
    });
  });
});

describe("decideVoteOutcome — same admin re-voting", () => {
  it("re-approving with the same vote is a no-op on the tally, but records previousVote", () => {
    const existing: StandingVote[] = [{ adminId: ALICE, vote: "approve" }];
    const outcome = decideVoteOutcome("reserved", existing, { adminId: ALICE, vote: "approve" });
    assert.deepEqual(outcome, {
      action: "applied",
      previousVote: "approve",
      nextStatus: "reserved",
      statusChanged: false,
    });
  });

  it("flipping own vote from approve to decline moves reserved -> declined", () => {
    const existing: StandingVote[] = [{ adminId: ALICE, vote: "approve" }];
    const outcome = decideVoteOutcome("reserved", existing, { adminId: ALICE, vote: "decline" });
    assert.deepEqual(outcome, {
      action: "applied",
      previousVote: "approve",
      nextStatus: "declined",
      statusChanged: true,
    });
  });

  it("flipping own vote from decline to approve — with one other approve standing — reaches booked", () => {
    // Alice previously declined. That decline is about to be OVERWRITTEN by
    // her new approve. Combined with Bob's approve already on file, the
    // resulting set is two approves from distinct admins -> booked.
    // But note: in reality, the booking would already be `declined` from
    // Alice's earlier vote, so this outcome would be rejected at the guard
    // check above. The pure derivation is still exercised here for
    // completeness — see the guard test at the top of this file.
    const votesWithoutAlice: StandingVote[] = [{ adminId: BOB, vote: "approve" }];
    const status = deriveStatusFromVotes([...votesWithoutAlice, { adminId: ALICE, vote: "approve" }]);
    assert.equal(status, "booked");
  });
});

describe("decideVoteOutcome — never double-counts", () => {
  it("two 'approve' rows for the same admin count as one, not two", () => {
    // Should never happen given the unique constraint, but the derivation
    // must still be safe if a malformed snapshot reaches it: 1 admin, 1 vote.
    const status = deriveStatusFromVotes([
      { adminId: ALICE, vote: "approve" },
      { adminId: ALICE, vote: "approve" },
    ]);
    assert.equal(status, "reserved");
  });
});

describe("decideVoteOutcome — approver diversity", () => {
  it("three approves from three distinct admins is booked (2 is enough, 3 is more than enough)", () => {
    const votes: StandingVote[] = [
      { adminId: ALICE, vote: "approve" },
      { adminId: BOB, vote: "approve" },
      { adminId: CAROL, vote: "approve" },
    ];
    assert.equal(deriveStatusFromVotes(votes), "booked");
  });

  it("one decline in the middle of approvers still wins", () => {
    const votes: StandingVote[] = [
      { adminId: ALICE, vote: "approve" },
      { adminId: BOB, vote: "decline" },
      { adminId: CAROL, vote: "approve" },
    ];
    assert.equal(deriveStatusFromVotes(votes), "declined");
  });
});

describe("deriveStatusFromVotes — edge cases", () => {
  it("empty vote list is reserved", () => {
    assert.equal(deriveStatusFromVotes([]), "reserved");
  });
});
