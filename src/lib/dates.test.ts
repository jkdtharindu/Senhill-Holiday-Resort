import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addDays,
  clampToBookingWindow,
  compareDates,
  currentBookingWindow,
  dateAtResort,
  datesInclusive,
  dayOfWeek,
  daysBetween,
  isValidDateOnly,
  isWeekend,
  isWithinBookingWindow,
  InvalidDateError,
  nightCount,
  nightsOfStay,
  parseDateOnly,
  staysOverlap,
  todayAtResort,
} from "./dates.ts";

describe("dateAtResort — the timezone rule", () => {
  it("reports the Sri Lankan date, not the UTC one, after 18:30 UTC", () => {
    // 19:00 UTC on 13 Sep is already 00:30 on 14 Sep in Colombo (UTC+5:30).
    // A naive implementation would answer "2026-09-13" here, which is the bug
    // this whole module exists to prevent.
    assert.equal(dateAtResort(new Date("2026-09-13T19:00:00Z")), "2026-09-14");
  });

  it("still reports the same date before 18:30 UTC", () => {
    assert.equal(dateAtResort(new Date("2026-09-13T18:29:00Z")), "2026-09-13");
  });

  it("rolls over exactly at 18:30 UTC", () => {
    assert.equal(dateAtResort(new Date("2026-09-13T18:29:59Z")), "2026-09-13");
    assert.equal(dateAtResort(new Date("2026-09-13T18:30:00Z")), "2026-09-14");
  });

  it("crosses the year boundary correctly", () => {
    // 31 Dec 20:00 UTC is already 01:30 on 1 Jan in Colombo.
    assert.equal(dateAtResort(new Date("2026-12-31T20:00:00Z")), "2027-01-01");
  });

  it("todayAtResort returns a well-formed date", () => {
    assert.ok(isValidDateOnly(todayAtResort()));
  });
});

describe("isValidDateOnly", () => {
  it("accepts real dates", () => {
    assert.ok(isValidDateOnly("2026-09-14"));
    assert.ok(isValidDateOnly("2024-02-29")); // leap year
  });

  it("rejects dates that match the pattern but do not exist", () => {
    assert.ok(!isValidDateOnly("2026-02-31"));
    assert.ok(!isValidDateOnly("2026-13-01"));
    assert.ok(!isValidDateOnly("2025-02-29")); // not a leap year
  });

  it("rejects malformed input", () => {
    assert.ok(!isValidDateOnly("14-09-2026"));
    assert.ok(!isValidDateOnly("2026-9-14"));
    assert.ok(!isValidDateOnly("2026-09-14T00:00:00Z"));
    assert.ok(!isValidDateOnly(""));
    assert.ok(!isValidDateOnly(null));
    assert.ok(!isValidDateOnly(20260914));
  });
});

describe("parseDateOnly", () => {
  it("returns the date when valid", () => {
    assert.equal(parseDateOnly("2026-09-14", "check_in"), "2026-09-14");
  });

  it("throws naming the offending field, so the API error is actionable", () => {
    assert.throws(
      () => parseDateOnly("nonsense", "check_in"),
      (err: unknown) =>
        err instanceof InvalidDateError && /check_in/.test((err as Error).message),
    );
  });
});

describe("arithmetic", () => {
  it("adds and subtracts days across month boundaries", () => {
    assert.equal(addDays("2026-09-30", 1), "2026-10-01");
    assert.equal(addDays("2026-10-01", -1), "2026-09-30");
  });

  it("adds days across a year boundary", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });

  it("handles February in a leap year", () => {
    assert.equal(addDays("2024-02-28", 1), "2024-02-29");
    assert.equal(addDays("2025-02-28", 1), "2025-03-01");
  });

  it("counts days between dates, signed", () => {
    assert.equal(daysBetween("2026-09-10", "2026-09-13"), 3);
    assert.equal(daysBetween("2026-09-13", "2026-09-10"), -3);
    assert.equal(daysBetween("2026-09-10", "2026-09-10"), 0);
  });

  it("compares dates chronologically", () => {
    assert.ok(compareDates("2026-09-10", "2026-09-11") < 0);
    assert.ok(compareDates("2026-09-11", "2026-09-10") > 0);
    assert.equal(compareDates("2026-09-10", "2026-09-10"), 0);
  });

  it("identifies weekends for the bulk day-mode pattern", () => {
    // 12 Sep 2026 is a Saturday, 13th a Sunday, 14th a Monday.
    assert.equal(dayOfWeek("2026-09-13"), 0);
    assert.ok(isWeekend("2026-09-12"));
    assert.ok(isWeekend("2026-09-13"));
    assert.ok(!isWeekend("2026-09-14"));
  });
});

describe("datesInclusive", () => {
  it("includes both endpoints", () => {
    assert.deepEqual(datesInclusive("2026-09-10", "2026-09-12"), [
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("returns a single date when the endpoints match", () => {
    assert.deepEqual(datesInclusive("2026-09-10", "2026-09-10"), ["2026-09-10"]);
  });

  it("returns empty for an inverted range rather than looping forever", () => {
    assert.deepEqual(datesInclusive("2026-09-12", "2026-09-10"), []);
  });
});

describe("nightsOfStay — the half-open rule", () => {
  it("occupies check-in through the night before check-out", () => {
    // The rule the whole booking system depends on: a 10th->13th stay does not
    // occupy the 13th, so someone else can arrive that day.
    assert.deepEqual(nightsOfStay("2026-09-10", "2026-09-13"), [
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("occupies exactly one night for a one-night stay", () => {
    assert.deepEqual(nightsOfStay("2026-09-10", "2026-09-11"), ["2026-09-10"]);
  });

  it("returns nothing for a zero-length or inverted stay", () => {
    assert.deepEqual(nightsOfStay("2026-09-10", "2026-09-10"), []);
    assert.deepEqual(nightsOfStay("2026-09-13", "2026-09-10"), []);
  });

  it("counts nights", () => {
    assert.equal(nightCount("2026-09-10", "2026-09-13"), 3);
    assert.equal(nightCount("2026-09-10", "2026-09-10"), 0);
  });
});

describe("staysOverlap", () => {
  it("does NOT flag back-to-back stays as a conflict", () => {
    // One guest leaves on the 13th, the next arrives on the 13th. This is the
    // single most valuable case here: getting it wrong silently loses bookings.
    assert.ok(
      !staysOverlap("2026-09-10", "2026-09-13", "2026-09-13", "2026-09-16"),
    );
  });

  it("flags a genuine overlap", () => {
    assert.ok(
      staysOverlap("2026-09-10", "2026-09-14", "2026-09-13", "2026-09-16"),
    );
  });

  it("flags one stay fully containing another", () => {
    assert.ok(
      staysOverlap("2026-09-10", "2026-09-20", "2026-09-12", "2026-09-14"),
    );
  });

  it("flags identical stays", () => {
    assert.ok(
      staysOverlap("2026-09-10", "2026-09-13", "2026-09-10", "2026-09-13"),
    );
  });

  it("is symmetric", () => {
    const a = ["2026-09-10", "2026-09-14"] as const;
    const b = ["2026-09-13", "2026-09-16"] as const;
    assert.equal(
      staysOverlap(a[0], a[1], b[0], b[1]),
      staysOverlap(b[0], b[1], a[0], a[1]),
    );
  });
});

describe("booking window", () => {
  it("spans today through today + 90 days", () => {
    const w = currentBookingWindow();
    assert.equal(w.from, todayAtResort());
    assert.equal(daysBetween(w.from, w.to), 90);
  });

  it("includes both endpoints", () => {
    const w = { from: "2026-09-01", to: "2026-11-30" };
    assert.ok(isWithinBookingWindow("2026-09-01", w));
    assert.ok(isWithinBookingWindow("2026-11-30", w));
    assert.ok(isWithinBookingWindow("2026-10-15", w));
  });

  it("excludes dates outside it", () => {
    const w = { from: "2026-09-01", to: "2026-11-30" };
    assert.ok(!isWithinBookingWindow("2026-08-31", w));
    assert.ok(!isWithinBookingWindow("2026-12-01", w));
  });
});

describe("clampToBookingWindow", () => {
  const w = { from: "2026-09-01", to: "2026-11-30" };

  it("trims a range that overhangs the far end", () => {
    assert.deepEqual(clampToBookingWindow("2026-11-01", "2027-01-01", w), {
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("trims a range that starts in the past", () => {
    assert.deepEqual(clampToBookingWindow("2026-08-01", "2026-09-10", w), {
      from: "2026-09-01",
      to: "2026-09-10",
    });
  });

  it("leaves a fully-contained range alone", () => {
    assert.deepEqual(clampToBookingWindow("2026-10-01", "2026-10-31", w), {
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("returns null when the range is entirely outside the window", () => {
    assert.equal(clampToBookingWindow("2027-01-01", "2027-02-01", w), null);
    assert.equal(clampToBookingWindow("2026-01-01", "2026-02-01", w), null);
  });
});
