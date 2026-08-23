/**
 * GET   /api/bookable-items/[id] — one Room or the Villa, with its images
 * PATCH /api/bookable-items/[id] — admin, update fields
 *
 * There is no DELETE. Bookings reference this row, and removing it would either
 * orphan a guest's booking history or cascade it away — both of which destroy
 * the record of what was booked. Set `active: false` instead: the item stops
 * being offered to guests while everything that points at it stays intact.
 */

import type { NextRequest } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bookableItemImages, bookableItems, bookings } from "@/db/schema";
import { getAdminSession } from "@/lib/auth/admin-session";
import { requireAdmin } from "@/lib/auth/require-admin";

async function loadItem(id: string) {
  const [item] = await db
    .select()
    .from(bookableItems)
    .where(eq(bookableItems.id, id))
    .limit(1);
  if (!item) return null;

  const images = await db
    .select({
      id: bookableItemImages.id,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .where(eq(bookableItemImages.bookableItemId, id))
    .orderBy(asc(bookableItemImages.displayOrder));

  return { ...item, images };
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/bookable-items/[id]">,
): Promise<Response> {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Not a valid item id." }, { status: 400 });
  }

  const item = await loadItem(id);
  if (!item) return Response.json({ error: "No such item." }, { status: 404 });

  // An inactive item is not offered to guests, so it reads as missing to them.
  if (!item.active && (await getAdminSession()) === null) {
    return Response.json({ error: "No such item." }, { status: 404 });
  }

  return Response.json({ item });
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    capacity: z.number().int().positive().max(1000).optional(),
    customNotes: z.string().max(5000).optional(),
    active: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
    /** Proceed with a capacity reduction that existing bookings exceed. */
    force: z.boolean().optional(),
  })
  .refine(
    (v) =>
      Object.entries(v).some(([k, x]) => k !== "force" && x !== undefined),
    { message: "Provide at least one field to change." },
  );

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/bookable-items/[id]">,
): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Not a valid item id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide at least one field to change, with valid values." },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(bookableItems)
    .where(eq(bookableItems.id, id))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "No such item." }, { status: 404 });
  }

  const { force, ...fields } = parsed.data;
  const changes = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  ) as Partial<typeof existing>;

  // `kind` is deliberately not editable. Turning a Room into the Villa (or back)
  // would silently change what every existing booking against it means.
  if (!force && changes.capacity !== undefined && changes.capacity < existing.capacity) {
    // Reducing capacity cannot retroactively invalidate a booking that was
    // legitimate when made — those guests are already coming. Flagged rather
    // than blocked, so the admin knows before it confuses them later.
    const affected = await db
      .select({ id: bookings.id, guestsCount: bookings.guestsCount })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookableItemId, id),
          inArray(bookings.status, ["reserved", "booked"]),
        ),
      );

    const over = affected.filter((b) => b.guestsCount > changes.capacity!);
    if (over.length > 0) {
      return Response.json(
        {
          error:
            `${over.length} existing booking(s) are for more guests than the new capacity. ` +
            `They stay valid — reducing capacity only affects new bookings — but check them ` +
            `first. Send \`force: true\` to proceed.`,
          affectedBookings: over.map((b) => b.id),
        },
        { status: 409 },
      );
    }
  }

  const [updated] = await db
    .update(bookableItems)
    .set(changes)
    .where(eq(bookableItems.id, id))
    .returning();

  const images = await db
    .select({
      id: bookableItemImages.id,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .where(eq(bookableItemImages.bookableItemId, id))
    .orderBy(asc(bookableItemImages.displayOrder));

  return Response.json({ item: { ...updated, images } });
}
