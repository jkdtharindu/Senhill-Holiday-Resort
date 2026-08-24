/**
 * Guest-facing site header (Slice 12).
 *
 * A server component: it takes the already-resolved customer as a prop rather
 * than calling `auth()` itself, so a page that has already loaded the session
 * does not pay for a second lookup, and the header never becomes a reason to
 * make a static page dynamic.
 *
 * Sign-out is a server action inside a `<form>` rather than a link, so it
 * cannot be triggered by a prefetch or by another site embedding the URL.
 */

import Link from "next/link";

import { signOut } from "@/auth";
import { Button, LinkButton } from "@/components/ui/button";
import { BORDER, cx, SURFACE, TEXT_ACCENT, TEXT_MUTED } from "@/components/ui/styles";
import { NavLink } from "./nav-link";

interface SiteHeaderProps {
  customer: { name: string; email: string } | null;
}

export function SiteHeader({ customer }: SiteHeaderProps) {
  return (
    <header className={cx("border-b", BORDER, SURFACE)}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex flex-col leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <span
            className={cx(
              "text-[10px] font-medium uppercase tracking-[0.18em]",
              TEXT_ACCENT,
            )}
          >
            Hedigalla · Sri Lanka
          </span>
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            Senhill Holiday Resort
          </span>
        </Link>

        <nav
          aria-label="Main"
          className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto"
        >
          <NavLink href="/" matchNested={false}>
            Home
          </NavLink>
          <NavLink href="/rooms">Rooms &amp; villa</NavLink>
          <NavLink href="/calendar">Calendar</NavLink>
          {customer !== null && <NavLink href="/my-bookings">My bookings</NavLink>}
        </nav>

        {customer !== null ? (
          <div className="flex items-center gap-3">
            <span className={cx("hidden text-xs sm:inline", TEXT_MUTED)}>
              {customer.name}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <LinkButton href="/signin" size="sm">
            Sign in
          </LinkButton>
        )}
      </div>
    </header>
  );
}
