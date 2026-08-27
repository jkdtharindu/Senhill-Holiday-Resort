/**
 * Email templates — one function per booking-lifecycle event, each
 * returning a plain `{ subject, html, text }` triple that `lib/email.ts`
 * sends as-is.
 *
 * Deliberately plain functions over a shared string layout, not a React
 * email framework or a database-editable template system: the event set is
 * small and fixed (confirmation, admin alert, approved, declined,
 * cancelled), and the owner asked for these to stay editable "as templates
 * for the future" — a future admin-editable version would read these
 * functions' copy as the starting content, the same relationship
 * DefaultNotes has to its seeded placeholder text.
 *
 * Every template shares `emailShell` for the header/footer chrome so a
 * branding change is one edit, not five.
 */

import { CONTACT_INFO, primaryContactEmail } from "./contact-info";
import type { DateOnly } from "./dates";

function formatDate(date: DateOnly): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const BRAND_COLOR = "#0f766e"; // teal-700, matches the site's accent

/** Shared HTML chrome — a simple header, the caller's body, and a contact footer. */
function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND_COLOR};padding:20px 28px;">
              <span style="color:#ffffff;font-size:16px;font-weight:600;">${CONTACT_INFO.propertyName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:14px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;">
              ${CONTACT_INFO.address}<br />
              ${CONTACT_INFO.phones.join(" &middot; ")} &middot; ${primaryContactEmail}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function contactFooterText(): string {
  return [
    "",
    "---",
    CONTACT_INFO.address,
    `${CONTACT_INFO.phones.join(" / ")} / ${primaryContactEmail}`,
  ].join("\n");
}

export interface BookingEmailDetails {
  guestName: string;
  itemName: string;
  checkIn: DateOnly;
  checkOut: DateOnly;
  guestsCount: number;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Sent to the guest immediately after they submit a booking request. */
export function bookingConfirmationEmail(details: BookingEmailDetails): EmailContent {
  const dates = `${formatDate(details.checkIn)} &ndash; ${formatDate(details.checkOut)}`;
  const datesText = `${formatDate(details.checkIn)} - ${formatDate(details.checkOut)}`;

  return {
    subject: `We've received your booking request — ${details.itemName}`,
    html: emailShell(`
      <p>Hi ${details.guestName},</p>
      <p>Thanks for your request. Here's what we received:</p>
      <table role="presentation" style="width:100%;margin:16px 0;font-size:14px;">
        <tr><td style="padding:4px 0;color:#78716c;">Item</td><td style="padding:4px 0;font-weight:600;">${details.itemName}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Dates</td><td style="padding:4px 0;font-weight:600;">${dates}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Guests</td><td style="padding:4px 0;font-weight:600;">${details.guestsCount}</td></tr>
      </table>
      <p>This is a <strong>request</strong>, not a confirmed booking yet — two of our admins need to review and approve it before it's final. We'll email you again as soon as that happens.</p>
      <p>An advance payment is required to confirm your stay; we'll be in touch about that separately.</p>
      <p>Questions in the meantime? Just reply to this email or call us.</p>
    `),
    text: `Hi ${details.guestName},

Thanks for your request. Here's what we received:

Item: ${details.itemName}
Dates: ${datesText}
Guests: ${details.guestsCount}

This is a request, not a confirmed booking yet — two of our admins need to review and approve it before it's final. We'll email you again as soon as that happens.

An advance payment is required to confirm your stay; we'll be in touch about that separately.

Questions in the meantime? Just reply to this email or call us.
${contactFooterText()}`,
  };
}

export interface AdminAlertDetails extends BookingEmailDetails {
  bookingId: string;
  phone: string;
  email: string;
}

/** Sent to every active admin when a guest submits a new booking request. */
export function adminNewBookingAlertEmail(details: AdminAlertDetails): EmailContent {
  const dates = `${formatDate(details.checkIn)} &ndash; ${formatDate(details.checkOut)}`;
  const datesText = `${formatDate(details.checkIn)} - ${formatDate(details.checkOut)}`;

  return {
    subject: `New booking request — ${details.itemName}, ${formatDate(details.checkIn)}`,
    html: emailShell(`
      <p>A new booking request needs review.</p>
      <table role="presentation" style="width:100%;margin:16px 0;font-size:14px;">
        <tr><td style="padding:4px 0;color:#78716c;">Guest</td><td style="padding:4px 0;font-weight:600;">${details.guestName}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Item</td><td style="padding:4px 0;font-weight:600;">${details.itemName}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Dates</td><td style="padding:4px 0;font-weight:600;">${dates}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Guests</td><td style="padding:4px 0;font-weight:600;">${details.guestsCount}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Phone</td><td style="padding:4px 0;font-weight:600;">${details.phone}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Email</td><td style="padding:4px 0;font-weight:600;">${details.email}</td></tr>
      </table>
      <p>Remember: it takes <strong>two different admins</strong> approving before this becomes booked.</p>
    `),
    text: `A new booking request needs review.

Guest: ${details.guestName}
Item: ${details.itemName}
Dates: ${datesText}
Guests: ${details.guestsCount}
Phone: ${details.phone}
Email: ${details.email}

Remember: it takes two different admins approving before this becomes booked.`,
  };
}

/** Sent to the guest once a second admin approve-vote moves the booking to `booked`. */
export function bookingApprovedEmail(details: BookingEmailDetails): EmailContent {
  const dates = `${formatDate(details.checkIn)} &ndash; ${formatDate(details.checkOut)}`;
  const datesText = `${formatDate(details.checkIn)} - ${formatDate(details.checkOut)}`;

  return {
    subject: `Your booking is confirmed — ${details.itemName}`,
    html: emailShell(`
      <p>Hi ${details.guestName},</p>
      <p>Good news — your booking is now <strong>confirmed</strong>:</p>
      <table role="presentation" style="width:100%;margin:16px 0;font-size:14px;">
        <tr><td style="padding:4px 0;color:#78716c;">Item</td><td style="padding:4px 0;font-weight:600;">${details.itemName}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Dates</td><td style="padding:4px 0;font-weight:600;">${dates}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Guests</td><td style="padding:4px 0;font-weight:600;">${details.guestsCount}</td></tr>
      </table>
      <p>Thank you for arranging your advance payment — we look forward to hosting you.</p>
    `),
    text: `Hi ${details.guestName},

Good news — your booking is now confirmed:

Item: ${details.itemName}
Dates: ${datesText}
Guests: ${details.guestsCount}

Thank you for arranging your advance payment — we look forward to hosting you.
${contactFooterText()}`,
  };
}

/** Sent to the guest when an admin declines their booking request. */
export function bookingDeclinedEmail(details: BookingEmailDetails): EmailContent {
  const dates = `${formatDate(details.checkIn)} &ndash; ${formatDate(details.checkOut)}`;
  const datesText = `${formatDate(details.checkIn)} - ${formatDate(details.checkOut)}`;

  return {
    subject: `Update on your booking request — ${details.itemName}`,
    html: emailShell(`
      <p>Hi ${details.guestName},</p>
      <p>We're sorry — we're unable to confirm your request for:</p>
      <table role="presentation" style="width:100%;margin:16px 0;font-size:14px;">
        <tr><td style="padding:4px 0;color:#78716c;">Item</td><td style="padding:4px 0;font-weight:600;">${details.itemName}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Dates</td><td style="padding:4px 0;font-weight:600;">${dates}</td></tr>
      </table>
      <p>Please check our calendar for other available dates, or reply to this email and we'll help you find something that works.</p>
    `),
    text: `Hi ${details.guestName},

We're sorry — we're unable to confirm your request for:

Item: ${details.itemName}
Dates: ${datesText}

Please check our calendar for other available dates, or reply to this email and we'll help you find something that works.
${contactFooterText()}`,
  };
}

export interface CancellationEmailDetails extends BookingEmailDetails {
  cancelledByGuestSelf: boolean;
}

/** Sent to the guest when their booking is cancelled — by themselves or by an admin. */
export function bookingCancelledEmail(details: CancellationEmailDetails): EmailContent {
  const dates = `${formatDate(details.checkIn)} &ndash; ${formatDate(details.checkOut)}`;
  const datesText = `${formatDate(details.checkIn)} - ${formatDate(details.checkOut)}`;
  const openingHtml = details.cancelledByGuestSelf
    ? "This confirms your booking has been withdrawn, as you requested:"
    : "This confirms your booking has been cancelled:";
  const openingText = details.cancelledByGuestSelf
    ? "This confirms your booking has been withdrawn, as you requested:"
    : "This confirms your booking has been cancelled:";

  return {
    subject: `Booking cancelled — ${details.itemName}`,
    html: emailShell(`
      <p>Hi ${details.guestName},</p>
      <p>${openingHtml}</p>
      <table role="presentation" style="width:100%;margin:16px 0;font-size:14px;">
        <tr><td style="padding:4px 0;color:#78716c;">Item</td><td style="padding:4px 0;font-weight:600;">${details.itemName}</td></tr>
        <tr><td style="padding:4px 0;color:#78716c;">Dates</td><td style="padding:4px 0;font-weight:600;">${dates}</td></tr>
      </table>
      <p>If you have a payment on record with us and are expecting a refund, we'll be in touch about that separately.</p>
      <p>We'd love to host you another time — feel free to submit a new request whenever you're ready.</p>
    `),
    text: `Hi ${details.guestName},

${openingText}

Item: ${details.itemName}
Dates: ${datesText}

If you have a payment on record with us and are expecting a refund, we'll be in touch about that separately.

We'd love to host you another time — feel free to submit a new request whenever you're ready.
${contactFooterText()}`,
  };
}
