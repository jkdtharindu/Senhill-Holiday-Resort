/**
 * Pure logic for site-wide settings updates (Slice 11, `PUT /site-settings`,
 * docs/API_DOCUMENTATION.md).
 *
 * Currently only `default_notes` is stored (the site-wide booking terms shown
 * to customers in the booking flow). Future settings can be added here as
 * additional fields without changing the database schema — the single-row
 * `site_settings` table scales to multiple config values per column.
 *
 * Kept pure: given the requested patch, decide what's valid. The caller (the
 * service module) owns the fetch and the write.
 */

export interface UpdateSiteSettingsInput {
  defaultNotes?: string;
}

export type SiteSettingsUpdateOutcome =
  | { ok: true; changed: true; field: "default_notes" }
  | { ok: true; changed: false }
  | { ok: false; error: string };

/**
 * Validate a requested patch and decide if it represents a real change.
 *
 * `default_notes` is compulsory when provided — cannot be blank or
 * whitespace-only. If `defaultNotes` is not in the input, this function
 * signals no change rather than an error (the patch is simply empty).
 */
export function validateSiteSettingsUpdate(
  input: UpdateSiteSettingsInput,
  current: { defaultNotes: string },
): SiteSettingsUpdateOutcome {
  if (input.defaultNotes === undefined) {
    return { ok: true, changed: false };
  }

  if (input.defaultNotes.trim() === "") {
    return { ok: false, error: "default_notes cannot be blank." };
  }

  if (input.defaultNotes === current.defaultNotes) {
    return { ok: true, changed: false };
  }

  return { ok: true, changed: true, field: "default_notes" };
}
