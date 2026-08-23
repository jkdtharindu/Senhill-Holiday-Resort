/**
 * GET  /api/bookable-items — public list of Rooms and the Villa
 * POST /api/bookable-items — admin, create one
 *
 * No pricing field anywhere. Pricing is out of scope for this version
 * (docs/PRD.md §4) — guests are shown a fixed notice that an advance payment is
 * required, and the amount is arranged manually outside the app.
 */

import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bookableItemImages, bookableItems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminSession } from "@/lib/auth/admin-session";

/**
 * Public listing.
 *
 * Inactive items are hidden from guests but returned to a signed-in admin, who
 * needs to see them in order to bring one back. That is the only difference
 * between the two responses — nothing guest-facing is withheld from admins and
 * nothing sensitive lives on this table.
 */
export async function GET(): Promise<Response> {
  const isAdmin = (await getAdminSession()) !== null;

  const rows = await db
    .select({
      id: bookableItems.id,
      kind: bookableItems.kind,
      name: bookableItems.name,
      description: bookableItems.description,
      capacity: bookableItems.capacity,
      customNotes: bookableItems.customNotes,
      active: bookableItems.active,
      displayOrder: bookableItems.displayOrder,
    })
    .from(bookableItems)
    .orderBy(asc(bookableItems.displayOrder), asc(bookableItems.name));

  const visible = isAdmin ? rows : rows.filter((r) => r.active);

  // One query for every image rather than one per item — with a handful of
  // items either is fine, but the per-item version is the shape that quietly
  // becomes a problem as the list grows.
  const images = await db
    .select({
      id: bookableItemImages.id,
      bookableItemId: bookableItemImages.bookableItemId,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .orderBy(asc(bookableItemImages.displayOrder));

  const byItem = new Map<string, typeof images>();
  for (const image of images) {
    const list = byItem.get(image.bookableItemId) ?? [];
    list.push(image);
    byItem.set(image.bookableItemId, list);
  }

  return Response.json({
    items: visible.map((item) => ({
      ...item,
      images: (byItem.get(item.id) ?? []).map(({ id, imageUrl, displayOrder }) => ({
        id,
        imageUrl,
        displayOrder,
      })),
    })),
  });
}

const createSchema = z.object({
  kind: z.enum(["room", "villa"]),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  capacity: z.number().int().positive().max(1000),
  customNotes: z.string().max(5000).optional(),
  displayOrder: z.number().int().min(0).max(10_000).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Provide `kind` (room or villa), a `name`, and a `capacity` of at least 1.",
      },
      { status: 400 },
    );
  }

  const { kind, name, description, capacity, customNotes, displayOrder } = parsed.data;

  // The Villa is the whole property let as one unit, so a second one is
  // meaningless and would break the villa_mode rule — that mode offers "the"
  // villa, not a choice between several.
  if (kind === "villa") {
    const [existingVilla] = await db
      .select({ id: bookableItems.id })
      .from(bookableItems)
      .where(eq(bookableItems.kind, "villa"))
      .limit(1);

    if (existingVilla) {
      return Response.json(
        {
          error:
            "A villa already exists. The villa is the whole property let as one unit, so " +
            "there can only be one — edit the existing entry instead.",
        },
        { status: 409 },
      );
    }
  }

  const [created] = await db
    .insert(bookableItems)
    .values({
      kind,
      name,
      description: description ?? "",
      capacity,
      customNotes: customNotes ?? "",
      displayOrder: displayOrder ?? 0,
      active: true,
    })
    .returning();

  return Response.json({ item: { ...created, images: [] } }, { status: 201 });
}
