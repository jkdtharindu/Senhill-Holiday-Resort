/**
 * Tests for the WhatsApp message templates.
 *
 * The property worth proving for each: the guest name, item name and both
 * dates actually appear in the drafted text (a silent template bug here
 * would mean an admin sends a message with the wrong stay details and no
 * one notices until the guest is confused). For the cancellation message
 * specifically, the two `cancelledByGuestSelf` branches must read visibly
 * differently, and neither can possibly disclose an internal reason since
 * the interface carries none.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bookingCancelledMessage,
  bookingConfirmedMessage,
  guestContactMessage,
  paymentReminderMessage,
} from "./whatsapp-templates.ts";

const DETAILS = {
  guestName: "Priya Fernando",
  itemName: "Garden Room",
  checkIn: "2026-09-14" as const,
  checkOut: "2026-09-16" as const,
};

describe("guestContactMessage", () => {
  it("includes the guest name, item name and both dates", () => {
    const message = guestContactMessage(DETAILS);
    assert.match(message, /Priya Fernando/);
    assert.match(message, /Garden Room/);
    assert.match(message, /14 Sept? 2026/);
    assert.match(message, /16 Sept? 2026/);
  });
});

describe("paymentReminderMessage", () => {
  it("includes the guest name, item name and both dates", () => {
    const message = paymentReminderMessage(DETAILS);
    assert.match(message, /Priya Fernando/);
    assert.match(message, /Garden Room/);
    assert.match(message, /14 Sept? 2026/);
    assert.match(message, /16 Sept? 2026/);
  });

  it("asks for the advance payment, not an amount (no pricing is ever calculated)", () => {
    const message = paymentReminderMessage(DETAILS);
    assert.match(message, /advance payment/i);
  });
});

describe("bookingConfirmedMessage", () => {
  it("includes the guest name, item name and both dates", () => {
    const message = bookingConfirmedMessage(DETAILS);
    assert.match(message, /Priya Fernando/);
    assert.match(message, /Garden Room/);
    assert.match(message, /14 Sept? 2026/);
    assert.match(message, /16 Sept? 2026/);
  });
});

describe("bookingCancelledMessage", () => {
  it("includes the guest name, item name and both dates", () => {
    const message = bookingCancelledMessage({ ...DETAILS, cancelledByGuestSelf: false });
    assert.match(message, /Priya Fernando/);
    assert.match(message, /Garden Room/);
    assert.match(message, /14 Sept? 2026/);
    assert.match(message, /16 Sept? 2026/);
  });

  it("reads differently for a guest self-withdrawal vs an admin cancellation", () => {
    const selfWithdrawn = bookingCancelledMessage({ ...DETAILS, cancelledByGuestSelf: true });
    const adminCancelled = bookingCancelledMessage({ ...DETAILS, cancelledByGuestSelf: false });
    assert.notEqual(selfWithdrawn, adminCancelled);
    assert.match(selfWithdrawn, /withdrawn, as you requested/);
    assert.match(adminCancelled, /has been cancelled/);
  });

  it("never discloses an internal cancellation reason (the interface carries none)", () => {
    const message = bookingCancelledMessage({ ...DETAILS, cancelledByGuestSelf: false });
    // Nothing to assert against a specific reason string — the guarantee is
    // structural: CancellationWhatsAppDetails has no `reason` field at all.
    assert.match(message, /we'll be in touch about that separately/);
  });
});
