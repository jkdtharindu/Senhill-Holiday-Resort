"use client";

/**
 * The "request sent" banner after a booking is created.
 *
 * The server only knows to render this from `?created=1` in the URL, which
 * would otherwise stick around forever: refreshing the page, sharing the
 * link, or hitting back all re-show it because the query param never goes
 * away. This strips the param from the URL on mount (so a refresh no longer
 * re-triggers it) and lets the guest dismiss it manually.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";

export function CreatedBanner() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
    // Only ever needs to run once, right after the banner mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative">
      <Alert tone="success" title="Request sent">
        Our team will review it shortly. It stays as &ldquo;awaiting
        confirmation&rdquo; until two of our admins have approved it.
      </Alert>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-emerald-900/60 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-emerald-200/60 dark:hover:text-emerald-200"
      >
        ✕
      </button>
    </div>
  );
}
