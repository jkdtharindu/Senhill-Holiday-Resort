import { auth, signOut } from "@/auth";
import { getCustomerById } from "@/lib/auth/customer";
import { currentBookingWindow, formatDateForDisplay } from "@/lib/dates";

/**
 * Placeholder home page.
 *
 * Enough to exercise guest sign-in end to end. The real landing page — photos,
 * rooms, the colour-coded calendar — is Slice 12.
 */
export default async function HomePage() {
  const session = await auth();
  const customer = session?.user?.id
    ? await getCustomerById(session.user.id)
    : null;
  const window = currentBookingWindow();

  return (
    <main className="min-h-dvh bg-stone-100 px-6 py-16 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
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

        <section className="rounded-md border border-stone-300 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Booking window
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Dates can be booked from {formatDateForDisplay(window.from)} up to{" "}
            {formatDateForDisplay(window.to)}. The window moves forward by a day
            every day, in Sri Lanka time.
          </p>
        </section>
      </div>
    </main>
  );
}
