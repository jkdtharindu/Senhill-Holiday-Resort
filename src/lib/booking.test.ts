/**
 * Tests for booking-request validation (FR5/FR5a) — the strictest rule in the
 * system. Worth proving most carefully: a single bad night anywhere in a
 * multi-night range rejects the WHOLE request and names every offending
 * date, not just the first one found; the half-open boundary applies to
 * conflict detection the same way it does everywhere else; and DayMode is
 * checked against the requested item's own kind, never the other one.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateBookingRequest,
  type BookingItemInfo,
  type ExistingBookingRange,
} from "./booking.ts";
import type { BookingWindow } from "./dates.ts";
import type { DayModeKind } from "../db/schema.ts";

const WINDOW: BookingWindow = { from: "2026-09-01", to: "2026-11-30" };

const ROOM: BookingItemInfo = { id: "r1", kind: "room", capacity: 4, active: true };
const VILLA: BookingItemInfo = { id: "v1", kind: "villa", capacity: 15, active: true };

function modes(entries: [string, DayModeKind][]): Map<string, DayModeKind> {
  return new Map(entries);
}

function roomModeRange(from: string, to: string): [string, DayModeKind][] {
  const out: [string, DayModeKind][] = [];
  for (let d = new Date(from); d <= new Date(to); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push([d.toISOString().slice(0, 10), "room_mode"]);
  }
  return out;
}

describe("validateBookingRequest — item existence", () => {
  it("rejects a null item (not found)", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 2 },
      null,
      WINDOW,
      new Map(),
      [],
    );
    assert.equal(result.ok, false);
  });

  it("rejects a deactivated item", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 2 },
      { ...ROOM, active: false },
      WINDOW,
      modes(roomModeRange("2026-09-10", "2026-09-12")),
      [],
    );
    assert.equal(result.ok, false);
  });
});

describe("validateBookingRequest — basic range shape", () => {
  it("rejects checkOut equal to checkIn (zero nights)", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-10", guestsCount: 2 },
      ROOM,
      WINDOW,
      new Map(),
      [],
    );
    assert.equal(result.ok, false);
  });

  it("rejects checkOut before checkIn", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-09-12", checkOut: "2026-09-10", guestsCount: 2 },
      ROOM,
      WINDOW,
      new Map(),
      [],
    );
    assert.equal(result.ok, false);
  });
});

describe("validateBookingRequest — capacity", () => {
  it("rejects zero guests", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 0 },
      ROOM,
      WINDOW,
      modes(roomModeRange("2026-09-10", "2026-09-11")),
      [],
    );
    assert.equal(result.ok, false);
  });

  it("rejects guests_count exceeding the item's capacity", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 5 },
      ROOM,
      WINDOW,
      modes(roomModeRange("2026-09-10", "2026-09-11")),
      [],
    );
    assert.equal(result.ok, false);
  });

  it("accepts guests_count exactly at capacity", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 4 },
      ROOM,
      WINDOW,
      modes(roomModeRange("2026-09-10", "2026-09-11")),
      [],
    );
    assert.equal(result.ok, true);
  });
});

describe("validateBookingRequest — BookingWindow", () => {
  it("rejects a range starting before the window", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-08-30", checkOut: "2026-09-02", guestsCount: 2 },
      ROOM,
      WINDOW,
      modes(roomModeRange("2026-08-30", "2026-09-01")),
      [],
    );
    assert.equal(result.ok, false);
  });

  it("rejects a range ending after the window", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-11-29", checkOut: "2026-12-02", guestsCount: 2 },
      ROOM,
      WINDOW,
      modes(roomModeRange("2026-11-29", "2026-12-01")),
      [],
    );
    assert.equal(result.ok, false);
  });

  it("accepts a range exactly on the window's edges", () => {
    const result = validateBookingRequest(
      { checkIn: "2026-11-29", checkOut: "2026-11-30", guestsCount: 2 },
      ROOM,
      WINDOW,
      modes(roomModeRange("2026-11-29", "2026-11-29")),
      [],
    );
    assert.equal(result.ok, true);
  });

  it("the checkout day itself is not a 'night' — it may sit one day past the window's `to`", () => {
    // Nights occupied are 11-29 and 11-30 (half-open) — both within the
    // window. Checkout on 12-01 is not itself a night and must not be
    // window-checked, so this range is accepted even though checkOut > to.
    const result = validateBookingRequest(
      { checkIn: "2026-11-29", checkOut: "2026-12-01", guestsCount: 2 },
      ROOM,
      WINDOW,
      modes(roomModeRange("2026-11-29", "2026-11-30")),
      [],
    );
    assert.equal(result.ok, true);
  });
});

describe("validateBookingRequest — unavailable dates (no DayMode)", () => {
  it("rejects and names a night with no DayMode set", () => {
    const dayModes = modes([["2026-09-10", "room_mode"]]); // 09-11 missing
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      [],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.conflictingDates, [{ date: "2026-09-11", reason: "unavailable" }]);
    }
  });

  it("names every unavailable night, not just the first", () => {
    const dayModes = new Map<string, DayModeKind>(); // nothing set
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-13", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      [],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(
        result.conflictingDates?.map((c) => c.date),
        ["2026-09-10", "2026-09-11", "2026-09-12"],
      );
    }
  });
});

describe("validateBookingRequest — DayMode mismatch", () => {
  it("rejects a room booking on a villa_mode day, naming that date", () => {
    const dayModes = modes([
      ["2026-09-10", "room_mode"],
      ["2026-09-11", "villa_mode"], // boundary crossing
    ]);
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      [],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.conflictingDates, [
        { date: "2026-09-11", reason: "day_mode_mismatch" },
      ]);
    }
  });

  it("rejects a villa booking on a room_mode day", () => {
    const dayModes = modes([["2026-09-20", "room_mode"]]);
    const result = validateBookingRequest(
      { checkIn: "2026-09-20", checkOut: "2026-09-21", guestsCount: 5 },
      VILLA,
      WINDOW,
      dayModes,
      [],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.conflictingDates, [
        { date: "2026-09-20", reason: "day_mode_mismatch" },
      ]);
    }
  });

  it("never lets a matching-kind mode on one night mask a mismatch on another", () => {
    const dayModes = modes([
      ["2026-09-10", "room_mode"],
      ["2026-09-11", "room_mode"],
      ["2026-09-12", "villa_mode"],
    ]);
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-13", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      [],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(
        result.conflictingDates?.map((c) => c.date),
        ["2026-09-12"],
      );
    }
  });
});

describe("validateBookingRequest — existing booking conflicts", () => {
  it("rejects a night already covered by another active booking on the same item", () => {
    const dayModes = modes(roomModeRange("2026-09-10", "2026-09-12"));
    const existing: ExistingBookingRange[] = [{ checkIn: "2026-09-11", checkOut: "2026-09-13" }];
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      existing,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.conflictingDates, [
        { date: "2026-09-11", reason: "already_booked" },
      ]);
    }
  });

  it("respects the half-open range — back-to-back bookings do not conflict", () => {
    // Existing booking occupies 09-10 and 09-11 (checkout 09-12). A new
    // request starting exactly on 09-12 must be accepted.
    const dayModes = modes(roomModeRange("2026-09-12", "2026-09-13"));
    const existing: ExistingBookingRange[] = [{ checkIn: "2026-09-10", checkOut: "2026-09-12" }];
    const result = validateBookingRequest(
      { checkIn: "2026-09-12", checkOut: "2026-09-14", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      existing,
    );
    assert.equal(result.ok, true);
  });

  it("rejects a request ending the day another booking starts overlapping by one night short of it", () => {
    // Existing booking starts 09-12. New request 09-10 -> 09-12 occupies
    // 09-10 and 09-11 only (half-open) — must NOT conflict.
    const dayModes = modes(roomModeRange("2026-09-10", "2026-09-11"));
    const existing: ExistingBookingRange[] = [{ checkIn: "2026-09-12", checkOut: "2026-09-14" }];
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      existing,
    );
    assert.equal(result.ok, true);
  });

  it("ignores a booking against a different item (caller must pre-filter, but double-check)", () => {
    // This item's own existingBookings should already be filtered by the
    // caller, but proves the function only reasons about what it is given.
    const dayModes = modes(roomModeRange("2026-09-10", "2026-09-11"));
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-12", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      [],
    );
    assert.equal(result.ok, true);
  });
});

describe("validateBookingRequest — mixed conflict reasons in one request", () => {
  it("collects unavailable, mismatch, and already_booked reasons together across the range", () => {
    const dayModes = modes([
      // 09-10: no entry -> unavailable
      ["2026-09-11", "villa_mode"], // mismatch (item is a room)
      ["2026-09-12", "room_mode"], // ok mode, but...
    ]);
    const existing: ExistingBookingRange[] = [{ checkIn: "2026-09-12", checkOut: "2026-09-13" }]; // already_booked
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-13", guestsCount: 2 },
      ROOM,
      WINDOW,
      dayModes,
      existing,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.conflictingDates, [
        { date: "2026-09-10", reason: "unavailable" },
        { date: "2026-09-11", reason: "day_mode_mismatch" },
        { date: "2026-09-12", reason: "already_booked" },
      ]);
    }
  });
});

describe("validateBookingRequest — happy path", () => {
  it("accepts a clean multi-night room booking", () => {
    const dayModes = modes(roomModeRange("2026-09-10", "2026-09-12"));
    const result = validateBookingRequest(
      { checkIn: "2026-09-10", checkOut: "2026-09-13", guestsCount: 3 },
      ROOM,
      WINDOW,
      dayModes,
      [],
    );
    assert.deepEqual(result, { ok: true });
  });

  it("accepts a clean villa booking", () => {
    const dayModes = modes([
      ["2026-09-20", "villa_mode"],
      ["2026-09-21", "villa_mode"],
    ]);
    const result = validateBookingRequest(
      { checkIn: "2026-09-20", checkOut: "2026-09-22", guestsCount: 12 },
      VILLA,
      WINDOW,
      dayModes,
      [],
    );
    assert.deepEqual(result, { ok: true });
  });
});
