/**
 * Tests for the cancellation rules (lib/cancellation.ts).
 *
 * Covers the full actor x status matrix, since the asymmetry between what an
 * admin may cancel and what a guest may withdraw is the whole point of the
 * module and a regression in either direction is silent: a guest gaining the
 * ability to cancel a confirmed stay would unwind an advance payment nobody
 * approved, and an admin losing it would leave staff unable to release a date.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  actorAuditName,
  decideCancellation,
  refusalHttpStatus,
  refusalMessage,
  type CancelActor,
} from "./cancellation.ts";
import type { BookingStatus } from "../db/schema.ts";

const OWNER = "cust-owner";
const OTHER = "cust-other";

const ADMIN: CancelActor = {
  kind: "admin",
  adminId: "admin-1",
  adminName: "Nadia",
};
const GUEST: CancelActor = { kind: "guest", customerId: OWNER };

function booking(status: BookingStatus, customerId = OWNER) {
  return { status, customerId };
}

describe("decideCancellation — admin", () => {
  it("allows cancelling a reserved booking", () => {
    assert.deepEqual(decideCancellation(booking("reserved"), ADMIN), { ok: true });
  });

  it("allows cancelling a confirmed (booked) booking", () => {
    assert.deepEqual(decideCancellation(booking("booked"), ADMIN), { ok: true });
  });

  it("refuses a booking that is already cancelled", () => {
    const result = decideCancellation(booking("cancelled"), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.refusal.reason, "already_cancelled");
  });

  it("refuses a declined booking, naming its current status", () => {
    const result = decideCancellation(booking("declined"), ADMIN);
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.refusal.reason === "already_resolved");
    assert.equal(
      result.ok === false && result.refusal.reason === "already_resolved"
        ? result.refusal.currentStatus
        : null,
      "declined",
    );
  });

  it("is not blocked by owning a different customer's booking", () => {
    // Ownership is a guest-only constraint — staff cancel on anyone's behalf.
    assert.deepEqual(decideCancellation(booking("booked", OTHER), ADMIN), { ok: true });
  });
});

describe("decideCancellation — guest", () => {
  it("allows withdrawing their own reserved request", () => {
    assert.deepEqual(decideCancellation(booking("reserved"), GUEST), { ok: true });
  });

  it("refuses their own CONFIRMED stay — must go through staff", () => {
    const result = decideCancellation(booking("booked"), GUEST);
    assert.equal(result.ok, false);
    assert.equal(
      result.ok === false && result.refusal.reason,
      "guest_cannot_cancel_confirmed",
    );
  });

  it("refuses another guest's booking as not_owner", () => {
    const result = decideCancellation(booking("reserved", OTHER), GUEST);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.refusal.reason, "not_owner");
  });

  it("checks ownership BEFORE status, so a stranger cannot probe booking state", () => {
    // Every status must give a stranger the same refusal. If status were
    // checked first, the differing reasons would leak whether someone else's
    // booking is pending, confirmed, declined or cancelled.
    for (const status of ["reserved", "booked", "declined", "cancelled"] as const) {
      // GUEST owns OWNER; every booking here belongs to OTHER.
      const result = decideCancellation(booking(status, OTHER), GUEST);
      assert.equal(result.ok, false, `expected refusal for ${status}`);
      assert.equal(
        result.ok === false && result.refusal.reason,
        "not_owner",
        `status ${status} leaked a different refusal reason`,
      );
    }
  });

  it("refuses their own already-cancelled booking", () => {
    const result = decideCancellation(booking("cancelled"), GUEST);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.refusal.reason, "already_cancelled");
  });

  it("refuses their own declined request", () => {
    const result = decideCancellation(booking("declined"), GUEST);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.refusal.reason, "already_resolved");
  });
});

describe("refusal presentation", () => {
  it("reports a non-owner as 404, not 403 — existence must not leak", () => {
    assert.equal(refusalHttpStatus({ reason: "not_owner" }), 404);
    assert.equal(refusalMessage({ reason: "not_owner" }, "guest"), "Booking not found.");
  });

  it("reports terminal states as 409", () => {
    assert.equal(refusalHttpStatus({ reason: "already_cancelled" }), 409);
    assert.equal(
      refusalHttpStatus({ reason: "already_resolved", currentStatus: "declined" }),
      409,
    );
  });

  it("reports a guest reaching for a confirmed stay as 403", () => {
    assert.equal(refusalHttpStatus({ reason: "guest_cannot_cancel_confirmed" }), 403);
  });

  it("keeps internal status vocabulary out of guest-facing wording", () => {
    const guestText = refusalMessage(
      { reason: "already_resolved", currentStatus: "declined" },
      "guest",
    );
    assert.ok(!guestText.includes("declined"), "guest wording leaked internal status");

    const adminText = refusalMessage(
      { reason: "already_resolved", currentStatus: "declined" },
      "admin",
    );
    assert.ok(adminText.includes("declined"), "admin wording should name the status");
  });
});

describe("actorAuditName", () => {
  it("uses the admin's name so history survives a rename", () => {
    assert.equal(actorAuditName(ADMIN), "Nadia");
  });

  it("labels a guest withdrawal, since there is no admin row to point at", () => {
    assert.equal(actorAuditName(GUEST), "Guest (self-service)");
  });
});
