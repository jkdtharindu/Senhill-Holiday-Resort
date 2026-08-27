/**
 * Tests for email volume policy (2026-08-27).
 *
 * The properties worth proving are the boundaries, because both constants
 * are safety limits and an off-by-one at either edge is the difference
 * between "stops a runaway" and "silently blocks a real guest's booking
 * confirmation".
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DAILY_SEND_LIMIT,
  DAILY_WARN_THRESHOLD,
  decideSendAllowed,
  restrictAdminRecipients,
  volumeLevel,
} from "./email-log.ts";

describe("decideSendAllowed — the circuit breaker boundary", () => {
  it("allows a send on a completely quiet day", () => {
    assert.deepEqual(decideSendAllowed(0), { allowed: true });
  });

  it("allows a send one recipient below the limit", () => {
    assert.deepEqual(decideSendAllowed(DAILY_SEND_LIMIT - 1), { allowed: true });
  });

  it("blocks exactly AT the limit, not one past it", () => {
    // The limit is a ceiling that has been reached, not one still to cross.
    const decision = decideSendAllowed(DAILY_SEND_LIMIT);
    assert.equal(decision.allowed, false);
  });

  it("stays blocked well past the limit", () => {
    const decision = decideSendAllowed(DAILY_SEND_LIMIT * 10);
    assert.equal(decision.allowed, false);
  });

  it("explains itself when it blocks — the reason reaches a log a human reads", () => {
    const decision = decideSendAllowed(DAILY_SEND_LIMIT);
    assert.equal(decision.allowed, false);
    if (decision.allowed) return; // narrow for TypeScript
    assert.match(decision.reason, /Daily email limit reached/);
    // The actual numbers matter — a reason that omits them sends whoever
    // reads it hunting for the threshold in source.
    assert.match(decision.reason, new RegExp(String(DAILY_SEND_LIMIT)));
  });
});

describe("volumeLevel — how a day reads to a human", () => {
  it("a normal day is normal", () => {
    assert.equal(volumeLevel(0), "normal");
    assert.equal(volumeLevel(8), "normal");
  });

  it("stays normal one below the warning threshold", () => {
    assert.equal(volumeLevel(DAILY_WARN_THRESHOLD - 1), "normal");
  });

  it("becomes elevated exactly at the warning threshold", () => {
    assert.equal(volumeLevel(DAILY_WARN_THRESHOLD), "elevated");
  });

  it("is still only elevated just below the hard limit", () => {
    assert.equal(volumeLevel(DAILY_SEND_LIMIT - 1), "elevated");
  });

  it("reports at_limit once sending has actually stopped", () => {
    assert.equal(volumeLevel(DAILY_SEND_LIMIT), "at_limit");
  });
});

describe("restrictAdminRecipients — the unverified-domain workaround", () => {
  const ADMINS = [
    "jkdtharindu@gmail.com",
    "srivacation0@gmail.com",
    "cs.jayasinghe1990@gmail.com",
  ];

  it("passes everything through when no restriction is configured", () => {
    // The post-domain-verification state: unset the env var, nothing changes.
    const r = restrictAdminRecipients(ADMINS, undefined);
    assert.deepEqual(r.recipients, ADMINS);
    assert.deepEqual(r.suppressed, []);
  });

  it("treats a blank or whitespace-only value as no restriction", () => {
    // An env var present but empty must not silently mute every admin.
    assert.deepEqual(restrictAdminRecipients(ADMINS, "").recipients, ADMINS);
    assert.deepEqual(restrictAdminRecipients(ADMINS, "   ").recipients, ADMINS);
  });

  it("keeps only the deliverable address, and reports who was dropped", () => {
    const r = restrictAdminRecipients(ADMINS, "jkdtharindu@gmail.com");
    assert.deepEqual(r.recipients, ["jkdtharindu@gmail.com"]);
    assert.deepEqual(r.suppressed, [
      "srivacation0@gmail.com",
      "cs.jayasinghe1990@gmail.com",
    ]);
  });

  it("matches case-insensitively — stored casing must not decide delivery", () => {
    const r = restrictAdminRecipients(
      ["JKDTharindu@Gmail.com", "other@example.com"],
      "jkdtharindu@gmail.com",
    );
    assert.deepEqual(r.recipients, ["JKDTharindu@Gmail.com"]);
  });

  it("tolerates surrounding whitespace on both sides", () => {
    const r = restrictAdminRecipients([" jkdtharindu@gmail.com "], " jkdtharindu@gmail.com ");
    assert.equal(r.recipients.length, 1);
  });

  it("returns empty when the restricted address is not an admin at all", () => {
    // Correct, and the caller must notice: sending to nobody is better than
    // sending to someone the provider will reject, which fails the whole send.
    const r = restrictAdminRecipients(ADMINS, "nobody@example.com");
    assert.deepEqual(r.recipients, []);
    assert.equal(r.suppressed.length, 3);
  });

  it("does not mutate the caller's array", () => {
    const original = [...ADMINS];
    restrictAdminRecipients(ADMINS, "jkdtharindu@gmail.com");
    assert.deepEqual(ADMINS, original);
  });
});

describe("the two thresholds relate correctly", () => {
  it("warns before it blocks", () => {
    // If these ever cross, the dashboard would jump straight from "normal"
    // to "sending has stopped" with no warning state in between — the whole
    // point of having two numbers.
    assert.ok(
      DAILY_WARN_THRESHOLD < DAILY_SEND_LIMIT,
      "warn threshold must sit below the hard send limit",
    );
  });

  it("leaves headroom under Resend's 100/day free tier", () => {
    // Deliberate: room to send by hand while investigating, and slack for
    // multi-recipient sends counting as more than one against the quota.
    assert.ok(
      DAILY_SEND_LIMIT < 100,
      "send limit must stay below the provider's own cap",
    );
  });
});
