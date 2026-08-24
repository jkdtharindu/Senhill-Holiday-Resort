/**
 * Tests for site-settings validation logic (Slice 11).
 *
 * The property worth proving: a blank or whitespace-only `defaultNotes` is
 * rejected, and a patch with the current value produces `changed: false`
 * (no-op updates are detected and not written).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateSiteSettingsUpdate } from "./site-settings.ts";

const CURRENT = {
  defaultNotes: "Check-in from 2pm. WiFi password on the fridge.",
};

describe("validateSiteSettingsUpdate — no-op detection", () => {
  it("produces changed: false when no fields are provided", () => {
    const outcome = validateSiteSettingsUpdate({}, CURRENT);
    assert.deepEqual(outcome, { ok: true, changed: false });
  });

  it("produces changed: false when defaultNotes is set to its current value", () => {
    const outcome = validateSiteSettingsUpdate(
      { defaultNotes: "Check-in from 2pm. WiFi password on the fridge." },
      CURRENT,
    );
    assert.deepEqual(outcome, { ok: true, changed: false });
  });
});

describe("validateSiteSettingsUpdate — validation", () => {
  it("rejects a blank defaultNotes", () => {
    const outcome = validateSiteSettingsUpdate({ defaultNotes: "" }, CURRENT);
    assert.equal(outcome.ok, false);
  });

  it("rejects a whitespace-only defaultNotes", () => {
    const outcome = validateSiteSettingsUpdate({ defaultNotes: "   \n  " }, CURRENT);
    assert.equal(outcome.ok, false);
  });
});

describe("validateSiteSettingsUpdate — real change", () => {
  it("produces changed: true when defaultNotes differs", () => {
    const outcome = validateSiteSettingsUpdate(
      { defaultNotes: "New terms" },
      CURRENT,
    );
    assert.deepEqual(outcome, { ok: true, changed: true, field: "default_notes" });
  });

  it("accepts a multiline defaultNotes", () => {
    const multiline = "Check-in: 2pm\nCheckout: 11am\nWiFi: ask at desk";
    const outcome = validateSiteSettingsUpdate({ defaultNotes: multiline }, CURRENT);
    assert.deepEqual(outcome, { ok: true, changed: true, field: "default_notes" });
  });
});
