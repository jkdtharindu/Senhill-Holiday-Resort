"use client";

/**
 * The sign-in error banner.
 *
 * Same problem as the "request sent" banner on /my-bookings: it's driven by
 * a URL query param (`?error=...`, set by the auth redirect) that nothing
 * ever clears, so refreshing or going back keeps showing a stale failure.
 * This strips the param on mount and lets the guest dismiss it.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";

export function ErrorBanner({ message }: { message: string }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
    // Only ever needs to run once, right after the banner mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative">
      <Alert tone="error">{message}</Alert>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-red-900/60 hover:text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-red-200/60 dark:hover:text-red-200"
      >
        ✕
      </button>
    </div>
  );
}
