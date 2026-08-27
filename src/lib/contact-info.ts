/**
 * Business contact details — the single source of truth for the guest
 * `/contact` page and every outgoing email footer.
 *
 * Kept as plain constants, not a database row: unlike DefaultNotes (edited
 * by an admin at runtime, Slice 11), this is fixed identity information that
 * changes rarely and, when it does, is a deploy — not an admin-panel edit.
 */

export const CONTACT_INFO = {
  propertyName: "Senhill Holiday Resort",
  emails: ["jkdtharindu@gmail.com", "cs.jayasinghe1990@gmail.com"],
  phones: ["0766689215", "0715579070"],
  address: "Senhill Holiday Resort, Batagodawila, Hedigalla Rd, Baduraliya, Sri Lanka 12234",
  /**
   * Plain-text Google Maps search query, not a pinned coordinate — the
   * embed points a visitor at the right area, not a guaranteed exact
   * driveway. See the route-accuracy notice shown next to it on the
   * contact page: guests are told to call and confirm the final approach
   * rather than trust the map's turn-by-turn routing, since a resort
   * access road is exactly the kind of detail consumer map data gets
   * wrong or outdated.
   */
  mapQuery: "Senhill Holiday Resort, Batagodawila, Hedigalla Rd, Baduraliya, Sri Lanka",
} as const;

export const primaryContactEmail = CONTACT_INFO.emails[0];

/**
 * A `wa.me` click-to-chat link for one of `CONTACT_INFO.phones`.
 *
 * This is a guest-INITIATED link, not an automated message — the guest
 * clicks it and sends whatever they type themselves. That distinction is
 * why it doesn't touch `PRD.md` §4's "no automatic messaging via SMS or
 * WhatsApp" — nothing is sent by the app; it only opens WhatsApp with a
 * pre-filled draft, the same relationship a `mailto:` link with a subject
 * has to actually sending an email.
 *
 * `wa.me` requires the full international number with no leading `0`, no
 * spaces, and no `+`. Numbers here are stored in local Sri Lankan format
 * (`0` + 9 digits), so the leading `0` is replaced with the country code
 * (`94`) rather than assumed absent — this only handles Sri Lankan local
 * format, not arbitrary international input.
 */
export function whatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("0") ? `94${digits.slice(1)}` : digits;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${international}${query}`;
}

/** Default draft text for the contact page's WhatsApp buttons. */
export const WHATSAPP_DEFAULT_MESSAGE = `Hi, I'd like to ask about a stay at ${CONTACT_INFO.propertyName}.`;
