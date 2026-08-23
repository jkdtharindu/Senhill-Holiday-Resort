/**
 * DELETE /api/bookable-items/[id]/images/[imageId] — admin, remove a photo
 *
 * Removes the file from storage as well as the database row. The owner chose
 * delete-on-remove over keeping old files: at this volume the storage saving is
 * irrelevant, but orphaned files nobody can identify become a real mess within a
 * year. The trade-off is that this is irreversible, so the admin UI confirms
 * before calling it.
 */

import type { NextRequest } from "next/server";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bookableItemImages } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteStoredImage } from "@/lib/images";

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/bookable-items/[id]/images/[imageId]">,
): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id, imageId } = await ctx.params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(id).success || !uuid.safeParse(imageId).success) {
    return Response.json({ error: "Not a valid id." }, { status: 400 });
  }

  // Matched on both ids, so an image id belonging to a different item cannot be
  // deleted by guessing the pair.
  const [image] = await db
    .select({
      id: bookableItemImages.id,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .where(
      and(
        eq(bookableItemImages.id, imageId),
        eq(bookableItemImages.bookableItemId, id),
      ),
    )
    .limit(1);

  if (!image) {
    return Response.json({ error: "No such photo on this item." }, { status: 404 });
  }

  // Database row first, then the file. If the blob delete fails the photo has
  // still disappeared from the panel, leaving at worst an unreferenced file.
  // The other order risks a visible photo whose file is already gone.
  await db.transaction(async (tx) => {
    await tx.delete(bookableItemImages).where(eq(bookableItemImages.id, imageId));

    // Close the gap left in the ordering, so positions stay 0..n-1 and a later
    // reorder is not working around a hole.
    await tx
      .update(bookableItemImages)
      .set({ displayOrder: sql`${bookableItemImages.displayOrder} - 1` })
      .where(
        and(
          eq(bookableItemImages.bookableItemId, id),
          gt(bookableItemImages.displayOrder, image.displayOrder),
        ),
      );
  });

  await deleteStoredImage(image.imageUrl);

  const remaining = await db
    .select({
      id: bookableItemImages.id,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .where(eq(bookableItemImages.bookableItemId, id))
    .orderBy(asc(bookableItemImages.displayOrder));

  return Response.json({ deleted: imageId, images: remaining });
}
