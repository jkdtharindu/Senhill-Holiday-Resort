/**
 * Tests for the DayMode assignment logic — the mechanic that keeps room and
 * villa bookings from ever conflicting. The property worth proving most
 * carefully here: a switch is blocked by a booking under the date's CURRENT
 * mode, never the mode being switched to, and never a booking of the other
 * kind entirely.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DayModePatternError,
  MAX_BULK_RANGE_DAYS,
  dateHasActiveBooking,
  isDayModePattern,
  itemKindForMode,
  normalizeDates,
  planDayModeChanges,
  resolvePatternDates,
  type ActiveBookingRange,
} from "./day-mode.ts";

describe("isDayModePattern", () => {
  it("accepts the supported pattern", () => {
    assert.ok(isDayModePattern("weekends"));
  });

  it("rejects anything else", () => {
    assert.ok(!isDayModePattern("weekdays"));
    assert.ok(!isDayModePattern(""));
    assert.ok(!isDayModePattern(null));
    assert.ok(!isDayModePattern(42));
  });
});

describe("resolvePatternDates — weekends", () => {
  it("returns only Saturdays and Sundays in the range", () => {
    // 2026-09-12 is a Saturday, 13th Sunday, 14th Monday.
    const dates = resolvePatternDates("weekends", "2026-09-11", "2026-09-15");
    assert.deepEqual(dates, ["2026-09-12", "2026-09-13"]);
  });

  it("includes both endpoints when they themselves are weekends", () => {
    const dates = resolvePatternDates("weekends", "2026-09-12", "2026-09-13");
    assert.deepEqual(dates, ["2026-09-12", "2026-09-13"]);
  });

  it("returns nothing for a range with no weekend in it", () => {
    // Monday through Friday, same week.
    const dates = resolvePatternDates("weekends", "2026-09-14", "2026-09-18");
    assert.deepEqual(dates, []);
  });

  it("spans a month boundary correctly", () => {
    const dates = resolvePatternDates("weekends", "2026-08-29", "2026-09-01");
    // 29th Sat, 30th Sun, 31st Mon, 1st Tue.
    assert.deepEqual(dates, ["2026-08-29", "2026-08-30"]);
  });

  it("rejects an inverted range", () => {
    assert.throws(
      () => resolvePatternDates("weekends", "2026-09-15", "2026-09-11"),
      DayModePatternError,
    );
  });

  it("rejects invalid dates", () => {
    assert.throws(
      () => resolvePatternDates("weekends", "not-a-date", "2026-09-15"),
      DayModePatternError,
    );
  });

  it("rejects a range wider than the safety cap", () => {
    assert.throws(
      () => resolvePatternDates("weekends", "2020-01-01", "2030-01-01"),
      (err: unknown) =>
        err instanceof DayModePatternError &&
        new RegExp(String(MAX_BULK_RANGE_DAYS)).test(err.message),
    );
  });
});

describe("itemKindForMode", () => {
  it("maps modes to the item kind they offer", () => {
    assert.equal(itemKindForMode("room_mode"), "room");
    assert.equal(itemKindForMode("villa_mode"), "villa");
  });
});

describe("dateHasActiveBooking", () => {
  const roomBooking: ActiveBookingRange = {
    itemKind: "room",
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
  };
  const villaBooking: ActiveBookingRange = {
    itemKind: "villa",
    checkIn: "2026-09-20",
    checkOut: "2026-09-22",
  };
  const bookings = [roomBooking, villaBooking];

  it("finds a room booking occupying the date under room_mode", () => {
    assert.ok(dateHasActiveBooking("2026-09-11", "room_mode", bookings));
  });

  it("does not match a villa booking against room_mode", () => {
    // The date is inside the villa booking's range, but villa bookings must
    // never block a room_mode switch — the two inventories are independent.
    assert.ok(!dateHasActiveBooking("2026-09-21", "room_mode", bookings));
  });

  it("respects the half-open range — checkout day is not occupied", () => {
    assert.ok(!dateHasActiveBooking("2026-09-13", "room_mode", bookings));
  });

  it("respects the half-open range — check-in day is occupied", () => {
    assert.ok(dateHasActiveBooking("2026-09-10", "room_mode", bookings));
  });

  it("finds nothing outside any booking's range", () => {
    assert.ok(!dateHasActiveBooking("2026-09-15", "room_mode", bookings));
    assert.ok(!dateHasActiveBooking("2026-09-15", "villa_mode", bookings));
  });
});

describe("planDayModeChanges", () => {
  it("inserts a date with no existing mode", () => {
    const [outcome] = planDayModeChanges(
      ["2026-10-01"],
      "room_mode",
      new Map(),
      [],
    );
    assert.deepEqual(outcome, { date: "2026-10-01", action: "insert" });
  });

  it("no-ops a date already at the target mode", () => {
    const existing = new Map([["2026-10-01", "room_mode" as const]]);
    const [outcome] = planDayModeChanges(
      ["2026-10-01"],
      "room_mode",
      existing,
      [],
    );
    assert.deepEqual(outcome, { date: "2026-10-01", action: "noop" });
  });

  it("switches a date whose current mode has no conflicting booking", () => {
    const existing = new Map([["2026-10-01", "room_mode" as const]]);
    const [outcome] = planDayModeChanges(
      ["2026-10-01"],
      "villa_mode",
      existing,
      [],
    );
    assert.deepEqual(outcome, {
      date: "2026-10-01",
      action: "switch",
      from: "room_mode",
    });
  });

  it("blocks a switch when a booking occupies the date under the CURRENT mode", () => {
    const existing = new Map([["2026-09-11", "room_mode" as const]]);
    const bookings: ActiveBookingRange[] = [
      { itemKind: "room", checkIn: "2026-09-10", checkOut: "2026-09-13" },
    ];
    const [outcome] = planDayModeChanges(
      ["2026-09-11"],
      "villa_mode",
      existing,
      bookings,
    );
    assert.deepEqual(outcome, {
      date: "2026-09-11",
      action: "blocked",
      reason: "Existing booking under current mode",
    });
  });

  it("does NOT block on a booking of the mode being switched TO", () => {
    // A villa booking exists on this date, but the date is currently
    // room_mode with no room booking — switching room_mode -> villa_mode must
    // succeed. (In practice a villa booking couldn't exist on a room_mode day
    // at all; this proves the function checks the current mode, not the
    // target, regardless.)
    const existing = new Map([["2026-09-11", "room_mode" as const]]);
    const bookings: ActiveBookingRange[] = [
      { itemKind: "villa", checkIn: "2026-09-10", checkOut: "2026-09-13" },
    ];
    const [outcome] = planDayModeChanges(
      ["2026-09-11"],
      "villa_mode",
      existing,
      bookings,
    );
    assert.deepEqual(outcome, {
      date: "2026-09-11",
      action: "switch",
      from: "room_mode",
    });
  });

  it("decides every date independently within one batch", () => {
    const existing = new Map<string, "room_mode" | "villa_mode">([
      ["2026-09-10", "room_mode"],
      ["2026-09-11", "room_mode"],
    ]);
    const bookings: ActiveBookingRange[] = [
      { itemKind: "room", checkIn: "2026-09-11", checkOut: "2026-09-12" },
    ];
    const outcomes = planDayModeChanges(
      ["2026-09-10", "2026-09-11", "2026-09-12"],
      "villa_mode",
      existing,
      bookings,
    );
    assert.deepEqual(
      outcomes.map((o) => [o.date, o.action]),
      [
        ["2026-09-10", "switch"], // no booking here, free to switch
        ["2026-09-11", "blocked"], // booked under current room_mode
        ["2026-09-12", "insert"], // no existing mode at all
      ],
    );
  });
});

describe("normalizeDates", () => {
  it("dedupes and sorts", () => {
    assert.deepEqual(
      normalizeDates(["2026-09-15", "2026-09-10", "2026-09-15", "2026-09-12"]),
      ["2026-09-10", "2026-09-12", "2026-09-15"],
    );
  });

  it("handles an empty list", () => {
    assert.deepEqual(normalizeDates([]), []);
  });
});
