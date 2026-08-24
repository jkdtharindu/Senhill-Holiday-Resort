/**
 * Room / villa detail (Slice 12).
 *
 * A deactivated item 404s rather than rendering: hiding it from the listing
 * is presentation, but the URL is guessable and stays in browser history, so
 * "not listed" has to mean "not reachable" too.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CardPanel, PageHeader, PageShell } from "@/components/ui/card";
import { cx, TEXT_BODY, TEXT_MUTED } from "@/components/ui/styles";
import { currentBookingWindow, formatDateForDisplay } from "@/lib/dates";
import { fetchItem } from "@/lib/items-service";

/**
 * Title the tab with the item's real name. Returns the not-found title rather
 * than throwing for a missing item — `generateMetadata` runs alongside the
 * page, and the page's own `notFound()` is what should produce the 404.
 */
export async function generateMetadata({
  params,
}: PageProps<"/rooms/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await fetchItem(id);
  if (item === null || !item.active) return { title: "Not found" };
  return { title: item.name, description: item.description.slice(0, 160) };
}

export default async function RoomDetailPage({
  params,
}: PageProps<"/rooms/[id]">) {
  const { id } = await params;
  const item = await fetchItem(id);

  if (item === null || !item.active) notFound();

  const window = currentBookingWindow();
  const isVilla = item.kind === "villa";
  const [cover, ...rest] = item.photos;

  return (
    <PageShell>
      <PageHeader
        eyebrow={<Link href="/rooms" className="hover:underline">&larr; Rooms &amp; villa</Link>}
        title={item.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{isVilla ? "Whole villa" : "Room"}</Badge>
            <span>Sleeps up to {item.capacity} guests</span>
          </span>
        }
        actions={<LinkButton href="/calendar">Check availability</LinkButton>}
      />

      {item.photos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-stone-200 dark:bg-stone-800">
            <Image
              src={cover.imageUrl}
              alt={`${item.name} — main photo`}
              fill
              // The largest this ever renders is the shell's max-width, so
              // there is no reason to serve a full-viewport-width image on a
              // wide screen.
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
              priority
            />
          </div>

          {rest.length > 0 && (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {rest.map((photo, i) => (
                <li
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-md bg-stone-200 dark:bg-stone-800"
                >
                  <Image
                    src={photo.imageUrl}
                    alt={`${item.name} — photo ${i + 2}`}
                    fill
                    sizes="(min-width: 640px) 180px, 30vw"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div
          className={cx(
            "flex aspect-[16/10] items-center justify-center rounded-md border border-dashed border-stone-300 text-sm dark:border-stone-800",
            TEXT_MUTED,
          )}
        >
          No photos yet
        </div>
      )}

      <CardPanel title="About this space">
        <p className={cx("text-sm leading-relaxed whitespace-pre-line", TEXT_BODY)}>
          {item.description}
        </p>
      </CardPanel>

      <CardPanel title="How booking works">
        <div className={cx("flex flex-col gap-2 text-sm leading-relaxed", TEXT_BODY)}>
          <p>
            {isVilla
              ? "The villa can be booked on dates running in villa mode — you get the entire property, and no other guests are booked alongside you."
              : "Rooms can be booked on dates running in room mode. Other rooms may be taken by other guests on the same dates."}
          </p>
          <p>
            Pick your dates on the calendar between{" "}
            {formatDateForDisplay(window.from)} and{" "}
            {formatDateForDisplay(window.to)}. Your request is reviewed by our
            team before it is confirmed — you&apos;ll see it as awaiting
            confirmation until then.
          </p>
        </div>
      </CardPanel>
    </PageShell>
  );
}
