"use client";

/**
 * Navigation link that knows whether it is the current page (Slice 12).
 *
 * Client component purely because it reads `usePathname()`. Kept as small as
 * possible so the nav shells around it can stay server components — the whole
 * admin chrome does not need to ship to the browser just to underline one tab.
 *
 * `aria-current="page"` is set alongside the visual highlight so the active
 * tab is identifiable without seeing the colour.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx, FOCUS_RING } from "@/components/ui/styles";

interface NavLinkProps {
  href: string;
  children: ReactNode;
  /**
   * Treat sub-paths as active too (`/admin/bookings/abc` highlights
   * "Bookings"). Off for index routes like `/admin`, which would otherwise
   * match every admin page.
   */
  matchNested?: boolean;
}

export function NavLink({ href, children, matchNested = true }: NavLinkProps) {
  const pathname = usePathname();
  const active = matchNested
    ? pathname === href || pathname.startsWith(`${href}/`)
    : pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        FOCUS_RING,
        active
          ? "bg-teal-800 text-white dark:bg-teal-700"
          : "text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100",
      )}
    >
      {children}
    </Link>
  );
}
