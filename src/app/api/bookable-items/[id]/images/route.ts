/**
 * POST  /api/bookable-items/[id]/images — admin, upload a photo
 * PATCH /api/bookable-items/[id]/images — admin, reorder photos
 *
 * Photos are ongoing content, not a one-time import: admins replace them as the
 * property changes. That makes this a routine path, which is exactly why the
 * limits in lib/images.ts matter — an upload endpoint without them is a way to
 * fill the store with arbitrary files.
 */

import type { NextRequest } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bookableItemImages, bookableItems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  ImageValidationError,
  MAX_IMAGES_PER_ITEM,
  storeImage,
  validateImage,
} from "@/lib/images";

async function itemExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookableItems.id })
    .from(bookableItems)
    .where(eq(bookableItems.id, id))
    .limit(1);
  return row !== undefined;
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/bookable-items/[id]/images">,
): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Not a valid item id." }, { status: 400 });
  }

  if (!(await itemExists(id))) {
    return Response.json({ error: "No such item." }, { status: 404 });
  }

  const [{ existing }] = await db
    .select({ existing: count() })
    .from(bookableItemImages)
    .where(eq(bookableItemImages.bookableItemId, id));

  if (existing >= MAX_IMAGES_PER_ITEM) {
    return Response.json(
      {
        error: `This item already has the maximum of ${MAX_IMAGES_PER_ITEM} photos. Remove one before adding another.`,
      },
      { status: 409 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return Response.json(
      { error: "Send the image as multipart form data in a `file` field." },
      { status: 400 },
    );
  }

  if (!file) {
    return Response.json(
      { error: "No file received. Attach the image in a `file` field." },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Judged on its actual leading bytes, never on file.type — which the client
  // supplies and can set to anything.
  let actualType;
  try {
    actualType = validateImage(bytes);
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const imageUrl = await storeImage(id, bytes, actualType);

  // New photos go to the end of the existing order.
  const [created] = await db
    .insert(bookableItemImages)
    .values({ bookableItemId: id, imageUrl, displayOrder: existing })
    .returning({
      id: bookableItemImages.id,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    });

  return Response.json({ image: created }, { status: 201 });
}

const reorderSchema = z.object({
  /** Image ids in the order they should appear. Must list every image. */
  imageIds: z.array(z.string().uuid()).min(1).max(MAX_IMAGES_PER_ITEM),
});

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/bookable-items/[id]/images">,
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

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide `imageIds` as an array listing every image in its new order." },
      { status: 400 },
    );
  }

  const current = await db
    .select({ id: bookableItemImages.id })
    .from(bookableItemImages)
    .where(eq(bookableItemImages.bookableItemId, id));

  const currentIds = new Set(current.map((i) => i.id));
  const givenIds = new Set(parsed.data.imageIds);

  // Require the complete set. A partial list would leave unmentioned photos
  // holding stale positions, producing an order nobody chose.
  if (
    givenIds.size !== parsed.data.imageIds.length ||
    givenIds.size !== currentIds.size ||
    !parsed.data.imageIds.every((imageId) => currentIds.has(imageId))
  ) {
    return Response.json(
      {
        error:
          "`imageIds` must list every photo on this item exactly once. " +
          `This item has ${currentIds.size}.`,
      },
      { status: 400 },
    );
  }

  // One transaction: a half-applied reorder would leave duplicate positions.
  await db.transaction(async (tx) => {
    for (const [index, imageId] of parsed.data.imageIds.entries()) {
      await tx
        .update(bookableItemImages)
        .set({ displayOrder: index })
        .where(eq(bookableItemImages.id, imageId));
    }
  });

  const images = await db
    .select({
      id: bookableItemImages.id,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .where(eq(bookableItemImages.bookableItemId, id))
    .orderBy(asc(bookableItemImages.displayOrder));

  return Response.json({ images });
}
