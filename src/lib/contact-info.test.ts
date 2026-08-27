/**
 * Tests for the WhatsApp link builder (2026-08-27).
 *
 * The property worth proving: the leading-`0` -> `94` country-code swap,
 * since a wrong digit here silently produces a link that opens WhatsApp to
 * the wrong number (or no number at all) with no error anyone would notice
 * until a guest complains it didn't work.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { whatsappLink } from "./contact-info.ts";

describe("whatsappLink — local Sri Lankan format to wa.me", () => {
  it("replaces a leading 0 with the 94 country code", () => {
    assert.equal(whatsappLink("0766689215"), "https://wa.me/94766689215");
  });

  it("strips spaces before converting", () => {
    assert.equal(whatsappLink("071 557 9070"), "https://wa.me/94715579070");
  });

  it("strips dashes and other non-digit characters", () => {
    assert.equal(whatsappLink("076-668-9215"), "https://wa.me/94766689215");
  });

  it("leaves a number already in international format unchanged", () => {
    // No leading 0 to replace — some future number might already be stored
    // in full international form, and this must not double up the 94.
    assert.equal(whatsappLink("94766689215"), "https://wa.me/94766689215");
  });

  it("appends a URL-encoded message when one is given", () => {
    const link = whatsappLink("0766689215", "Hi, room availability?");
    assert.equal(link, "https://wa.me/94766689215?text=Hi%2C%20room%20availability%3F");
  });

  it("omits the query string entirely when no message is given", () => {
    assert.ok(!whatsappLink("0766689215").includes("?"));
  });
});
