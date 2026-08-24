/**
 * Database-backed orchestration for site-wide settings updates (Slice 11,
 * `PUT /site-settings`).
 *
 * Split from the pure validation logic in lib/site-settings.ts, same pattern
 * as lib/vote-service.ts and lib/booking-update-service.ts: the route stays a
 * thin HTTP adapter, and this module owns the fetch-validate-write cycle.
 *
 * The single site_settings row is updated atomically — a read-modify-write
 * without explicit locking is safe because concurrent admin updates are both
 * rare and have no ordering dependency (last write wins for a single setting
 * is acceptable, and there are no foreign keys between settings).
 */

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import {
  validateSiteSettingsUpdate,
  type UpdateSiteSettingsInput,
} from "./site-settings";

export interface UpdateSiteSettingsServiceInput {
  patch: UpdateSiteSettingsInput;
  adminId: string;
  adminName: string;
}

export type UpdateSiteSettingsResult =
  | { ok: true; changed: true; field: string }
  | { ok: true; changed: false }
  | { ok: false; error: string };

/**
 * Update site-wide settings atomically, tracking who changed them and when.
 * The `site_settings` table is always a single row (the schema enforces this
 * via the uuid PK — new code never inserts a second one).
 */
export async function updateSiteSettings(
  input: UpdateSiteSettingsServiceInput,
): Promise<UpdateSiteSettingsResult> {
  const [current] = await db
    .select({ defaultNotes: siteSettings.defaultNotes })
    .from(siteSettings)
    .limit(1);

  if (!current) {
    return { ok: false, error: "Site settings not initialized." };
  }

  const outcome = validateSiteSettingsUpdate(input.patch, current);
  if (!outcome.ok) {
    return { ok: false, error: outcome.error };
  }

  if (!outcome.changed) {
    return { ok: true, changed: false };
  }

  await db
    .update(siteSettings)
    .set({
      ...(input.patch.defaultNotes !== undefined && {
        defaultNotes: input.patch.defaultNotes,
      }),
      updatedBy: input.adminId,
      updatedAt: sql`now()`,
    });

  return { ok: true, changed: true, field: outcome.field };
}
