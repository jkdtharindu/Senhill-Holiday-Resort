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
