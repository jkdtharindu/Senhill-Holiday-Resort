/**
 * Tests for the admin comprehensive booking update diff/validation logic
 * (Slice 10). The property worth proving most carefully: a field set to its
 * current value produces no change entry (no-op PUT writes nothing to
 * booking_audit_log), and phone can never be blanked out since it's
 * compulsory per schema.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeBookingUpdate } from "./booking-update.ts";

const CURRENT = {
  guestName: "Jane Doe",
  phone: "0771234567",
  email: "jane@example.com",
  paymentStage: "unpaid" as const,
  advanceAmount: null,
  advancePaidDate: null,
  internalNotes: "",
};

describe("computeBookingUpdate — no-op detection", () => {
  it("rejects an empty patch", () => {
    const outcome = computeBookingUpdate(CURRENT, {});
    assert.equal(outcome.ok, false);
  });

  it("produces no changes when every field is set to its current value", () => {
    const outcome = computeBookingUpdate(CURRENT, {
      guestName: "Jane Doe",
      phone: "0771234567",
    });
    assert.deepEqual(outcome, { ok: true, changes: [] });
  });
});

describe("computeBookingUpdate — validation", () => {
  it("rejects a blank phone", () => {
    const outcome = computeBookingUpdate(CURRENT, { phone: "   " });
    assert.equal(outcome.ok, false);
  });

  it("rejects a blank guest name", () => {
    const outcome = computeBookingUpdate(CURRENT, { guestName: "" });
    assert.equal(outcome.ok, false);
  });

  it("rejects a negative advance amount", () => {
    const outcome = computeBookingUpdate(CURRENT, { advanceAmount: "-5" });
    assert.equal(outcome.ok, false);
  });

  it("rejects a non-numeric advance amount", () => {
    const outcome = computeBookingUpdate(CURRENT, { advanceAmount: "abc" });
    assert.equal(outcome.ok, false);
  });

  it("rejects a malformed advancePaidDate", () => {
    const outcome = computeBookingUpdate(CURRENT, { advancePaidDate: "24/08/2026" });
    assert.equal(outcome.ok, false);
  });

  it("accepts null to clear advanceAmount and advancePaidDate", () => {
    const withAdvance = {
      ...CURRENT,
      advanceAmount: "100.00",
      advancePaidDate: "2026-08-20",
    };
    const outcome = computeBookingUpdate(withAdvance, {
      advanceAmount: null,
      advancePaidDate: null,
    });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.changes.length, 2);
    }
  });
});

describe("computeBookingUpdate — field diff", () => {
  it("changes only the fields that differ from current", () => {
    const outcome = computeBookingUpdate(CURRENT, {
      guestName: "Jane Doe", // unchanged
      phone: "0779999999", // changed
      paymentStage: "advance_paid", // changed
      internalNotes: "", // unchanged
    });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.deepEqual(outcome.changes, [
        { field: "phone", oldValue: "0771234567", newValue: "0779999999" },
        { field: "payment_stage", oldValue: "unpaid", newValue: "advance_paid" },
      ]);
    }
  });

  it("records advance_amount and advance_paid_date changes together", () => {
    const outcome = computeBookingUpdate(CURRENT, {
      advanceAmount: "50.00",
      advancePaidDate: "2026-08-24",
    });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.deepEqual(outcome.changes, [
        { field: "advance_amount", oldValue: null, newValue: "50.00" },
        { field: "advance_paid_date", oldValue: null, newValue: "2026-08-24" },
      ]);
    }
  });

  it("records internal_notes changes", () => {
    const outcome = computeBookingUpdate(CURRENT, { internalNotes: "VIP guest" });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.deepEqual(outcome.changes, [
        { field: "internal_notes", oldValue: "", newValue: "VIP guest" },
      ]);
    }
  });
});
