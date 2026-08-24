/**
 * Rooms & villa listing (Slice 12).
 *
 * Rooms and the villa are shown as two separate groups rather than one flat
 * list, because they are mutually exclusive on any given date: a date runs in
 * either room mode or villa mode (docs/UBIQUITOUS_LANGUAGE.md, DayMode).
 * Presenting them as one list of "things you could book tonight" would imply
 * you can mix them, which the booking rules refuse.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, PageShell } from "@/components/ui/card";
import { cx, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { fetchItems, type ItemWithPhotos } from "@/lib/items-service";

export const metadata: Metadata = {
  title: "Rooms & villa",
  description:
    "The rooms and the whole-villa option at Senhill Holiday Resort, Hedigalla.",
};

function ItemCard({ item }: { item: ItemWithPhotos }) {
  const cover = item.photos[0] ?? null;

  return (
    <article className="flex flex-col overflow-hidden rounded-md border border-stone-300 bg-white dark:border-stone-800 dark:bg-stone-900">
      <Link
        href={`/rooms/${item.id}`}
        className="relative aspect-[4/3] w-full bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-stone-800"
      >
        {cover !== null ? (
          <Image
            src={cover.imageUrl}
            // Decorative here: the item's name is the adjacent link text, so
            // announcing the photo too would just repeat it.
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
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-col gap-1">
          <h3 className={cx("text-base font-semibold", TEXT_HEADING)}>
            <Link
              href={`/rooms/${item.id}`}
              className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {item.name}
            </Link>
          </h3>
          <p className={cx("text-xs", TEXT_MUTED)}>Sleeps up to {item.capacity}</p>
        </div>

        <p className={cx("line-clamp-3 flex-1 text-sm leading-relaxed", TEXT_BODY)}>
          {item.description}
        </p>

        <div className="pt-1">
          <LinkButton href={`/rooms/${item.id}`} variant="secondary" size="sm">
            View details
          </LinkButton>
        </div>
      </div>
    </article>
  );
}

export default async function RoomsPage() {
  const items = await fetchItems();
  const rooms = items.filter((i) => i.kind === "room");
  const villas = items.filter((i) => i.kind === "villa");

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Stay with us"
        title="Rooms & villa"
        description="Book an individual room, or take the whole villa. Which of the two is on offer varies by date — the calendar shows which."
        actions={<LinkButton href="/calendar">Check availability</LinkButton>}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing listed yet"
          description="The rooms and villa haven't been published. Please check back shortly."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {rooms.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className={cx("text-sm font-semibold uppercase tracking-wide", TEXT_MUTED)}>
                  Individual rooms
                </h2>
                <p className={cx("text-sm", TEXT_BODY)}>
                  Available on dates running in room mode. Other guests may be
                  staying in the other rooms.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rooms.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {villas.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className={cx("text-sm font-semibold uppercase tracking-wide", TEXT_MUTED)}>
                  The whole villa
                </h2>
                <p className={cx("text-sm", TEXT_BODY)}>
                  Available on dates running in villa mode. You have the entire
                  property — no other guests.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {villas.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
