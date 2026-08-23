import Image from "next/image";
import { asc, eq } from "drizzle-orm";

import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { bookableItemImages, bookableItems } from "@/db/schema";
import { getCustomerById } from "@/lib/auth/customer";
import { currentBookingWindow, formatDateForDisplay } from "@/lib/dates";

interface ListedItem {
  id: string;
  kind: "room" | "villa";
  name: string;
  description: string;
  capacity: number;
  coverImageUrl: string | null;
  photoCount: number;
}

/** Active items with their first photo, for the gallery below. */
async function loadActiveItems(): Promise<ListedItem[]> {
  const items = await db
    .select({
      id: bookableItems.id,
      kind: bookableItems.kind,
      name: bookableItems.name,
      description: bookableItems.description,
      capacity: bookableItems.capacity,
    })
    .from(bookableItems)
    .where(eq(bookableItems.active, true))
    .orderBy(asc(bookableItems.displayOrder), asc(bookableItems.name));

  const images = await db
    .select({
      bookableItemId: bookableItemImages.bookableItemId,
      imageUrl: bookableItemImages.imageUrl,
      displayOrder: bookableItemImages.displayOrder,
    })
    .from(bookableItemImages)
    .orderBy(asc(bookableItemImages.displayOrder));

  const byItem = new Map<string, { url: string; count: number }>();
  for (const image of images) {
    const existing = byItem.get(image.bookableItemId);
    if (existing) {
      existing.count += 1;
    } else {
      byItem.set(image.bookableItemId, { url: image.imageUrl, count: 1 });
    }
  }

  return items.map((item) => ({
    ...item,
    coverImageUrl: byItem.get(item.id)?.url ?? null,
    photoCount: byItem.get(item.id)?.count ?? 0,
  }));
}

/**
 * Placeholder home page.
 *
 * Enough to exercise guest sign-in and the rooms/villa listing end to end. The
 * real landing page — booking flow, the colour-coded calendar — is Slice 12.
 * The rooms section below queries the database directly rather than calling
 * `/api/bookable-items` over HTTP, since a server component rendering on the
 * same server has no reason to round-trip through its own API.
 */
export default async function HomePage() {
  const session = await auth();
  const customer = session?.user?.id
    ? await getCustomerById(session.user.id)
    : null;
  const window = currentBookingWindow();
  const items = await loadActiveItems();

  return (
    <main className="min-h-dvh bg-stone-100 px-6 py-16 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-800 dark:text-teal-500">
            Hedigalla · Sri Lanka
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Senhill Holiday Resort
          </h1>
          <p className="text-base leading-relaxed text-stone-600 dark:text-stone-400">
            A mountain retreat above the clouds — book a room, or take the whole
            villa.
          </p>
        </header>

        {customer ? (
          <section className="flex flex-col gap-4 rounded-md border border-stone-300 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-900">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Signed in as {customer.name}
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {customer.email}
              </p>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Phone on file:{" "}
                {customer.phone ?? "none yet — we'll ask when you book"}
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Sign out
              </button>
            </form>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-md border border-stone-300 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Not signed in
            </h2>
            <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Browsing is open to everyone. Sign in when you want to request a
              stay.
            </p>
            <a
              href="/signin"
              className="self-start rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
            >
              Sign in with Google
            </a>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Rooms &amp; villa
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col overflow-hidden rounded-md border border-stone-300 bg-white dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="relative aspect-[4/3] w-full bg-stone-200 dark:bg-stone-800">
                  {item.coverImageUrl ? (
                    <Image
                      src={item.coverImageUrl}
                      alt={item.name}
                      fill
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-stone-400 dark:text-stone-600">
                      No photo yet
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {item.name}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Sleeps {item.capacity} · {item.photoCount}{" "}
                    photo{item.photoCount === 1 ? "" : "s"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-stone-300 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Booking window
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Dates can be booked from {formatDateForDisplay(window.from)} up to{" "}
            {formatDateForDisplay(window.to)}. The window moves forward by a day
            every day, in Sri Lanka time.
          </p>
          <a
            href="/calendar"
            className="mt-3 inline-block text-sm font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-500"
          >
            View the calendar &rarr;
          </a>
        </section>
      </div>
    </main>
  );
}
