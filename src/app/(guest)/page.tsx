/**
 * Guest home page (Slice 12).
 *
 * Queries the database directly rather than calling `/api/bookable-items` over
 * HTTP: a server component rendering on the same server has no reason to
 * round-trip through its own API, and doing so would turn one query into a
 * request that re-authenticates and re-serialises the same rows.
 *
 * Sign-in state lives in the layout's header, so this page is about the
 * property itself — what you can book, and when.
 */

import Link from "next/link";
import Image from "next/image";
import { asc, eq } from "drizzle-orm";

import { LinkButton } from "@/components/ui/button";
import { CardPanel, PageHeader, PageShell } from "@/components/ui/card";
import { cx, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { db } from "@/db";
import { bookableItemImages, bookableItems } from "@/db/schema";
import { currentBookingWindow, formatDateForDisplay } from "@/lib/dates";

interface ListedItem {
  id: string;
  kind: "room" | "villa";
  name: string;
  capacity: number;
  coverImageUrl: string | null;
}

/** Active items with their first photo, for the gallery below. */
async function loadActiveItems(): Promise<ListedItem[]> {
  const items = await db
    .select({
      id: bookableItems.id,
      kind: bookableItems.kind,
      name: bookableItems.name,
      capacity: bookableItems.capacity,
    })
    .from(bookableItems)
    .where(eq(bookableItems.active, true))
    .orderBy(asc(bookableItems.displayOrder), asc(bookableItems.name));

  const images = await db
    .select({
      bookableItemId: bookableItemImages.bookableItemId,
      imageUrl: bookableItemImages.imageUrl,
    })
    .from(bookableItemImages)
    .orderBy(asc(bookableItemImages.displayOrder));

  const coverByItem = new Map<string, string>();
  for (const image of images) {
    if (!coverByItem.has(image.bookableItemId)) {
      coverByItem.set(image.bookableItemId, image.imageUrl);
    }
  }

  return items.map((item) => ({
    ...item,
    coverImageUrl: coverByItem.get(item.id) ?? null,
  }));
}

export default async function HomePage() {
  const window = currentBookingWindow();
  const items = await loadActiveItems();

  return (
    <PageShell>
      <PageHeader
        eyebrow="Hedigalla · Sri Lanka"
        title="A mountain retreat above the clouds"
        description="Book a room, or take the whole villa. Availability is shown 90 days ahead, in Sri Lanka time."
        actions={<LinkButton href="/calendar">Check availability</LinkButton>}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2
            className={cx(
              "text-sm font-semibold uppercase tracking-wide",
              TEXT_MUTED,
            )}
          >
            Rooms &amp; villa
          </h2>
          <Link
            href="/rooms"
            className="text-sm font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-500"
          >
            See all &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/rooms/${item.id}`}
              className="group flex flex-col overflow-hidden rounded-md border border-stone-300 bg-white transition-colors hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-teal-600"
            >
              <div className="relative aspect-[4/3] w-full bg-stone-200 dark:bg-stone-800">
                {item.coverImageUrl !== null ? (
                  <Image
                    src={item.coverImageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div
                    className={cx(
                      "flex h-full items-center justify-center text-xs",
                      TEXT_MUTED,
                    )}
                  >
                    No photo yet
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 p-3">
                <h3 className={cx("text-sm font-semibold", TEXT_HEADING)}>
                  {item.name}
                </h3>
                <p className={cx("text-xs", TEXT_MUTED)}>
                  {item.kind === "villa" ? "Whole villa" : "Room"} · sleeps{" "}
                  {item.capacity}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <CardPanel title="Booking window">
        <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
          Dates can be booked from {formatDateForDisplay(window.from)} up to{" "}
          {formatDateForDisplay(window.to)}. The window moves forward by a day
          every day, in Sri Lanka time.
        </p>
      </CardPanel>
    </PageShell>
  );
}
