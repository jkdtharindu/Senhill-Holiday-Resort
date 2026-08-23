/**
 * Tests for CalendarState derivation — the 4-colour view every guest sees.
 * The property worth proving most carefully: the villa branch and the room
 * branch never leak into each other, the half-open boundary holds here too,
 * and a booking against a deactivated item is ignored rather than skewing
 * "every room taken" for inventory nobody can currently book.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveCalendarDays,
  deriveCalendarState,
  type ActiveItemCounts,
  type CalendarBookingRow,
} from "./calendar.ts";

const THREE_ROOMS_ONE_VILLA: ActiveItemCounts = { room: 3, villa: 1 };

function room(
  id: string,
  status: "reserved" | "booked",
  checkIn: string,
  checkOut: string,
  itemActive = true,
): CalendarBookingRow {
  return { bookableItemId: id, itemKind: "room", itemActive, status, checkIn, checkOut };
}

function villa(
  status: "reserved" | "booked",
  checkIn: string,
  checkOut: string,
  itemActive = true,
): CalendarBookingRow {
  return { bookableItemId: "villa-1", itemKind: "villa", itemActive, status, checkIn, checkOut };
}

describe("deriveCalendarState — unavailable", () => {
  it("is unavailable when no DayMode is set, regardless of bookings", () => {
    assert.equal(
      deriveCalendarState("2026-09-10", null, [room("r1", "booked", "2026-09-10", "2026-09-11")], THREE_ROOMS_ONE_VILLA),
      "unavailable",
    );
  });
});

describe("deriveCalendarState — room_mode", () => {
  it("is open when no active room is taken", () => {
    assert.equal(deriveCalendarState("2026-09-10", "room_mode", [], THREE_ROOMS_ONE_VILLA), "open");
  });

  it("is reserved when some but not all rooms are taken", () => {
    const bookings = [room("r1", "reserved", "2026-09-10", "2026-09-12")];
    assert.equal(deriveCalendarState("2026-09-10", "room_mode", bookings, THREE_ROOMS_ONE_VILLA), "reserved");
  });

  it("is booked when every active room is taken", () => {
    const bookings = [
      room("r1", "booked", "2026-09-10", "2026-09-12"),
      room("r2", "reserved", "2026-09-10", "2026-09-12"),
      room("r3", "booked", "2026-09-10", "2026-09-12"),
    ];
    assert.equal(deriveCalendarState("2026-09-10", "room_mode", bookings, THREE_ROOMS_ONE_VILLA), "booked");
  });

  it("counts distinct rooms, not booking rows", () => {
    // Same room somehow has two overlapping rows — should not double-count
    // toward "every room taken" with only 1 of 3 rooms actually affected.
    const bookings = [
      room("r1", "reserved", "2026-09-10", "2026-09-12"),
      room("r1", "reserved", "2026-09-11", "2026-09-13"),
    ];
    assert.equal(deriveCalendarState("2026-09-11", "room_mode", bookings, THREE_ROOMS_ONE_VILLA), "reserved");
  });

  it("treats zero active rooms as open, not booked", () => {
    const zeroRooms: ActiveItemCounts = { room: 0, villa: 1 };
    assert.equal(deriveCalendarState("2026-09-10", "room_mode", [], zeroRooms), "open");
  });

  it("ignores a booking against a deactivated room", () => {
    // The room was booked, then deactivated. It should not appear as "taken"
    // among the (now 2) active rooms — a stale booking on removed inventory
    // must not skew what is shown as available today.
    const bookings = [room("r1-deactivated", "booked", "2026-09-10", "2026-09-12", false)];
    const twoActiveRooms: ActiveItemCounts = { room: 2, villa: 1 };
    assert.equal(deriveCalendarState("2026-09-10", "room_mode", bookings, twoActiveRooms), "open");
  });

  it("respects the half-open range — checkout day is not taken", () => {
    const bookings = [
      room("r1", "booked", "2026-09-10", "2026-09-12"),
      room("r2", "booked", "2026-09-10", "2026-09-12"),
      room("r3", "booked", "2026-09-10", "2026-09-12"),
    ];
    // All three rooms free up on the 12th — should read open, not booked.
    assert.equal(deriveCalendarState("2026-09-12", "room_mode", bookings, THREE_ROOMS_ONE_VILLA), "open");
  });

  it("never lets a villa booking affect a room_mode date", () => {
    const bookings = [villa("booked", "2026-09-10", "2026-09-12")];
    assert.equal(deriveCalendarState("2026-09-10", "room_mode", bookings, THREE_ROOMS_ONE_VILLA), "open");
  });
});

describe("deriveCalendarState — villa_mode", () => {
  it("is open with no villa booking", () => {
    assert.equal(deriveCalendarState("2026-09-20", "villa_mode", [], THREE_ROOMS_ONE_VILLA), "open");
  });

  it("mirrors a reserved villa booking", () => {
    const bookings = [villa("reserved", "2026-09-20", "2026-09-22")];
    assert.equal(deriveCalendarState("2026-09-20", "villa_mode", bookings, THREE_ROOMS_ONE_VILLA), "reserved");
  });

  it("mirrors a booked villa booking", () => {
    const bookings = [villa("booked", "2026-09-20", "2026-09-22")];
    assert.equal(deriveCalendarState("2026-09-20", "villa_mode", bookings, THREE_ROOMS_ONE_VILLA), "booked");
  });

  it("prefers booked over reserved if both somehow overlap the same date", () => {
    // Should not occur once booking creation validates non-overlap (a later
    // slice), but derivation must not crash or pick arbitrarily if it does.
    const bookings = [villa("reserved", "2026-09-20", "2026-09-22"), villa("booked", "2026-09-21", "2026-09-23")];
    assert.equal(deriveCalendarState("2026-09-21", "villa_mode", bookings, THREE_ROOMS_ONE_VILLA), "booked");
  });

  it("ignores a booking against a deactivated villa", () => {
    const bookings = [villa("booked", "2026-09-20", "2026-09-22", false)];
    assert.equal(deriveCalendarState("2026-09-20", "villa_mode", bookings, THREE_ROOMS_ONE_VILLA), "open");
  });

  it("respects the half-open range — checkout day is open", () => {
    const bookings = [villa("booked", "2026-09-20", "2026-09-22")];
    assert.equal(deriveCalendarState("2026-09-22", "villa_mode", bookings, THREE_ROOMS_ONE_VILLA), "open");
  });

  it("never lets a room booking affect a villa_mode date", () => {
    const bookings = [room("r1", "booked", "2026-09-20", "2026-09-22")];
    assert.equal(deriveCalendarState("2026-09-20", "villa_mode", bookings, THREE_ROOMS_ONE_VILLA), "open");
  });
});

describe("deriveCalendarDays", () => {
  it("derives a mixed range matching the API_DOCUMENTATION.md example", () => {
    const dayModes = new Map<string, "room_mode" | "villa_mode">([
      ["2026-09-10", "room_mode"],
      ["2026-09-11", "room_mode"],
      ["2026-09-12", "villa_mode"],
    ]);
    const bookings: CalendarBookingRow[] = [
      room("r1", "reserved", "2026-09-11", "2026-09-12"),
      villa("booked", "2026-09-12", "2026-09-13"),
    ];
    const dates = ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];

    const days = deriveCalendarDays(dates, dayModes, bookings, THREE_ROOMS_ONE_VILLA);

    assert.deepEqual(days, [
      { date: "2026-09-09", dayMode: null, state: "unavailable" },
      { date: "2026-09-10", dayMode: "room_mode", state: "open" },
      { date: "2026-09-11", dayMode: "room_mode", state: "reserved" },
      { date: "2026-09-12", dayMode: "villa_mode", state: "booked" },
    ]);
  });

  it("returns an empty array for an empty date list", () => {
    assert.deepEqual(deriveCalendarDays([], new Map(), [], THREE_ROOMS_ONE_VILLA), []);
  });
});
