/**
 * GET /api/site-settings — public, returns default_notes.
 * PUT /api/site-settings — admin, updates default_notes.
 *
 * `default_notes` is site-wide booking terms shown to customers in the
 * booking flow (docs/API_DOCUMENTATION.md, Slice 11).
 *
 * The route stays a thin adapter; the actual update logic lives in
 * lib/site-settings-service.ts, built on the pure lib/site-settings.ts.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateSiteSettings } from "@/lib/site-settings-service";

export async function GET(): Promise<Response> {
  const [row] = await db
    .select({ defaultNotes: siteSettings.defaultNotes })
    .from(siteSettings)
    .limit(1);

  if (!row) {
    return Response.json({ error: "Site settings not initialized." }, { status: 500 });
  }

  return Response.json({ defaultNotes: row.defaultNotes });
}

const putBodySchema = z.object({
  defaultNotes: z.string().optional(),
});

export async function PUT(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const result = await updateSiteSettings({
    patch: parsed.data,
    adminId: auth.admin.id,
    adminName: auth.admin.name,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ changed: result.changed });
}
