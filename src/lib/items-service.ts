/**
 * Read queries for bookable items and their photos (Slice 12).
 *
 * The guest listing and detail screens both need items with photos attached,
 * and the admin manager needs the same shape plus inactive rows. Collected
 * here so the join-and-group logic exists once rather than being re-derived
 * per page — three earlier pages had each grown their own copy.
 */

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { bookableItemImages, bookableItems } from "@/db/schema";

export interface ItemPhoto {
  id: string;
  imageUrl: string;
  displayOrder: number;
}

export interface ItemWithPhotos {
  id: string;
  kind: "room" | "villa";
  name: string;
  description: string;
  /** Per-item notes shown to guests alongside the site-wide DefaultNotes. */
  customNotes: string;
  capacity: number;
  active: boolean;
  displayOrder: number;
  photos: ItemPhoto[];
}

/** Every photo, grouped by item, ordered as the admin arranged them. */
async function loadPhotosByItem(): Promise<Map<string, ItemPhoto[]>> {
  const rows = await db
    .select({
      id: bookableItemImages.id,
      bookableItemId: bookableItemImages.bookableItemId,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .orderBy(asc(bookableItemImages.displayOrder));

  const byItem = new Map<string, ItemPhoto[]>();
  for (const row of rows) {
    const list = byItem.get(row.bookableItemId);
    const photo = {
      id: row.id,
      imageUrl: row.imageUrl,
      displayOrder: row.displayOrder,
    };
    if (list) list.push(photo);
    else byItem.set(row.bookableItemId, [photo]);
  }
  return byItem;
}

/**
 * All bookable items with photos attached.
 *
 * `includeInactive` is false for every guest-facing caller: an item an admin
 * has deactivated must not appear in the public listing, and must not be
 * reachable by guessing its URL either — the detail page checks `active` for
 * the same reason.
 */
export async function fetchItems(
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<ItemWithPhotos[]> {
  const base = db
    .select({
      id: bookableItems.id,
      kind: bookableItems.kind,
      name: bookableItems.name,
      description: bookableItems.description,
      customNotes: bookableItems.customNotes,
      capacity: bookableItems.capacity,
      active: bookableItems.active,
      displayOrder: bookableItems.displayOrder,
    })
    .from(bookableItems);

  const rows = await (includeInactive
    ? base
    : base.where(eq(bookableItems.active, true))
  ).orderBy(asc(bookableItems.displayOrder), asc(bookableItems.name));

  const photosByItem = await loadPhotosByItem();

  return rows.map((row) => ({
    ...row,
    photos: photosByItem.get(row.id) ?? [],
  }));
}

/** One item with its photos, or null if it does not exist. */
export async function fetchItem(id: string): Promise<ItemWithPhotos | null> {
  const [row] = await db
    .select({
      id: bookableItems.id,
      kind: bookableItems.kind,
      name: bookableItems.name,
      description: bookableItems.description,
      customNotes: bookableItems.customNotes,
      capacity: bookableItems.capacity,
      active: bookableItems.active,
      displayOrder: bookableItems.displayOrder,
    })
    .from(bookableItems)
    .where(eq(bookableItems.id, id))
    .limit(1);

  if (!row) return null;

  const photos = await db
    .select({
      id: bookableItemImages.id,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .where(eq(bookableItemImages.bookableItemId, id))
    .orderBy(asc(bookableItemImages.displayOrder));

  return { ...row, photos };
}
