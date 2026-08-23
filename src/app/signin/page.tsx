import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

export const metadata: Metadata = {
  title: "Sign in",
};

const ERROR_MESSAGES: Record<string, string> = {
  // Returned by our signIn callback when the Google account's email is not verified.
  AccessDenied:
    "That Google account does not have a verified email address, so we can't use it to hold a booking. Try another account, or verify the address with Google first.",
  Configuration:
    "Sign-in isn't set up correctly on our side. Please call us on 071 557 9070 and we'll take your booking directly.",
  OAuthAccountNotLinked:
    "That email address is already associated with a different sign-in method.",
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/signin">) {
  if (await auth()) redirect("/");

  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ??
      "Something went wrong signing you in. Please try again.")
    : null;

  return (
    <main className="min-h-dvh bg-stone-100 px-6 py-16 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-800 dark:text-teal-500">
            Senhill Holiday Resort
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Sign in to book
          </h1>
          <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            You can browse the rooms and check which dates are free without an
            account. Signing in is only needed to request a stay and follow its
            progress.
          </p>
        </header>

        {errorMessage && (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2.5 text-sm leading-relaxed text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            {errorMessage}
          </p>
        )}

        {/*
          A server action rather than a client component: the form works with
          no JavaScript, and there is no OAuth logic in the browser bundle.
        */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>

        <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-500">
          We receive your name and email address from Google, and nothing else.
          Your phone number is asked for later, on the booking form itself.
        </p>
      </div>
    </main>
  );
}

/** Google's mark, inline so the page needs no external asset. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
