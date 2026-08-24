/**
 * Tests for day-detail RoomStatus derivation. The property worth proving
 * most carefully: a `reserved` booking reads identically to `booked` here
 * (RoomStatus only has 2 values), the half-open boundary still holds, and
 * items with no overlapping booking are never linked to a stale bookingId.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveItemStatuses, type DayDetailBookingRow, type DayDetailItemRow } from "./day-detail.ts";

const ROOMS: DayDetailItemRow[] = [
  { id: "r1", name: "Room 1", capacity: 2 },
  { id: "r2", name: "Room 2", capacity: 2 },
  { id: "r3", name: "Room 3", capacity: 4 },
];

const VILLA: DayDetailItemRow[] = [{ id: "v1", name: "The Villa", capacity: 15 }];

function booking(
  id: string,
  bookableItemId: string,
  status: "reserved" | "booked",
  checkIn: string,
  checkOut: string,
): DayDetailBookingRow {
  return { id, bookableItemId, status, checkIn, checkOut };
}

describe("deriveItemStatuses — room_mode", () => {
  it("marks every room open when there are no bookings", () => {
    const result = deriveItemStatuses("2026-09-10", ROOMS, []);
    assert.deepEqual(
      result.map((r) => r.status),
      ["open", "open", "open"],
    );
  });

  it("marks only the booked room as booked, per FR3's example", () => {
    const bookings = [
      booking("b1", "r1", "booked", "2026-09-10", "2026-09-11"),
      booking("b2", "r2", "booked", "2026-09-10", "2026-09-11"),
    ];
    const result = deriveItemStatuses("2026-09-10", ROOMS, bookings);
    assert.deepEqual(
      result.map((r) => ({ name: r.name, status: r.status })),
      [
        { name: "Room 1", status: "booked" },
        { name: "Room 2", status: "booked" },
        { name: "Room 3", status: "open" },
      ],
    );
  });

  it("treats a merely 'reserved' booking the same as 'booked' — RoomStatus has no 3rd value", () => {
    const bookings = [booking("b1", "r1", "reserved", "2026-09-10", "2026-09-12")];
    const result = deriveItemStatuses("2026-09-10", ROOMS, bookings);
    assert.equal(result[0].status, "booked");
  });

  it("attaches the overlapping booking's id for a booked room, null for an open one", () => {
    const bookings = [booking("b1", "r1", "booked", "2026-09-10", "2026-09-11")];
    const result = deriveItemStatuses("2026-09-10", ROOMS, bookings);
    assert.equal(result[0].bookingId, "b1");
    assert.equal(result[1].bookingId, null);
  });

  it("respects the half-open range — checkout day reads open", () => {
    const bookings = [booking("b1", "r1", "booked", "2026-09-10", "2026-09-12")];
    const result = deriveItemStatuses("2026-09-12", ROOMS, bookings);
    assert.equal(result[0].status, "open");
    assert.equal(result[0].bookingId, null);
  });

  it("ignores a booking against a different item", () => {
    const bookings = [booking("b1", "r2", "booked", "2026-09-10", "2026-09-11")];
    const result = deriveItemStatuses("2026-09-10", ROOMS, bookings);
    assert.equal(result[0].status, "open");
  });
});

describe("deriveItemStatuses — villa_mode", () => {
  it("is open with no booking", () => {
    const result = deriveItemStatuses("2026-09-20", VILLA, []);
    assert.equal(result[0].status, "open");
  });

  it("is booked when a reserved or booked villa booking overlaps", () => {
    const bookings = [booking("b1", "v1", "reserved", "2026-09-20", "2026-09-22")];
    const result = deriveItemStatuses("2026-09-20", VILLA, bookings);
    assert.equal(result[0].status, "booked");
    assert.equal(result[0].bookingId, "b1");
  });

  it("respects the half-open range on the villa too", () => {
    const bookings = [booking("b1", "v1", "booked", "2026-09-20", "2026-09-22")];
    const result = deriveItemStatuses("2026-09-22", VILLA, bookings);
    assert.equal(result[0].status, "open");
  });
});

describe("deriveItemStatuses — edge cases", () => {
  it("returns an empty array for an empty item list", () => {
    assert.deepEqual(deriveItemStatuses("2026-09-10", [], []), []);
  });

  it("carries capacity through unchanged", () => {
    const result = deriveItemStatuses("2026-09-10", ROOMS, []);
    assert.equal(result[2].capacity, 4);
  });
});
