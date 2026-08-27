/**
 * WhatsApp message templates — one function per booking-lifecycle event,
 * each returning a plain string that `whatsappLink()` (contact-info.ts)
 * URL-encodes into a `wa.me` draft. Every send here is guest- or
 * admin-initiated by clicking a link and pressing send in WhatsApp — the app
 * never sends anything itself (PRD §4 rules out automated SMS/WhatsApp).
 *
 * Same one-function-per-event shape as email-templates.ts, but plain text
 * only (no subject/html). Dates use `formatDateForDisplay` from dates.ts —
 * the same formatter already shown to guests and admins throughout the UI —
 * rather than email-templates.ts's own private `formatDate`, which is fixed
 * to UTC for email rendering and isn't the convention these surfaces use.
 */

import { CONTACT_INFO } from "./contact-info.ts";
import { formatDateForDisplay, type DateOnly } from "./dates.ts";

export interface BookingWhatsAppDetails {
  guestName: string;
  itemName: string;
  checkIn: DateOnly;
  checkOut: DateOnly;
}

function dateRange(checkIn: DateOnly, checkOut: DateOnly): string {
  return `${formatDateForDisplay(checkIn)} - ${formatDateForDisplay(checkOut)}`;
}

/** Guest-initiated: drafted for the guest to send TO the hotel. */
export function guestContactMessage(details: BookingWhatsAppDetails): string {
  return (
    `Hi, I'm ${details.guestName}. I'd like to ask about my booking request for ` +
    `${details.itemName}, ${dateRange(details.checkIn, details.checkOut)}.`
  );
}

/**
 * Admin-initiated: asks the guest to arrange their advance payment. Mirrors
 * `ADVANCE_PAYMENT_NOTICE`'s tone (lib/booking.ts) — this message IS the
 * "our team will contact you with the details" it promises.
 */
export function paymentReminderMessage(details: BookingWhatsAppDetails): string {
  return (
    `Hi ${details.guestName}, this is ${CONTACT_INFO.propertyName}. Your request for ` +
    `${details.itemName}, ${dateRange(details.checkIn, details.checkOut)}, is progressing — ` +
    `could you arrange your advance payment so we can confirm it? Let us know once it's done.`
  );
}

/** Admin-initiated: sent once a booking reaches `booked` (two approvals). */
export function bookingConfirmedMessage(details: BookingWhatsAppDetails): string {
  return (
    `Hi ${details.guestName}, this is ${CONTACT_INFO.propertyName}. Good news — your booking ` +
    `for ${details.itemName}, ${dateRange(details.checkIn, details.checkOut)}, is now confirmed. ` +
    `We look forward to hosting you.`
  );
}

export interface CancellationWhatsAppDetails extends BookingWhatsAppDetails {
  cancelledByGuestSelf: boolean;
}

/**
 * Admin-initiated: confirms a cancellation without disclosing the internal
 * cancellation reason — matches `bookingCancelledEmail`'s own non-disclosure
 * (email-templates.ts). No `reason` param exists on this interface at all,
 * so there is nothing for a future caller to leak by accident.
 */
export function bookingCancelledMessage(details: CancellationWhatsAppDetails): string {
  const opening = details.cancelledByGuestSelf
    ? "this confirms your booking has been withdrawn, as you requested"
    : "this confirms your booking has been cancelled";
  return (
    `Hi ${details.guestName}, this is ${CONTACT_INFO.propertyName} — ${opening}: ` +
    `${details.itemName}, ${dateRange(details.checkIn, details.checkOut)}. If you have a payment ` +
    `on record with us and are expecting a refund, we'll be in touch about that separately. ` +
    `We'd love to host you another time.`
  );
}
