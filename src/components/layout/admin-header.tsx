/**
 * Admin panel header and navigation (Slice 12).
 *
 * Takes the authenticated admin as a prop — every admin page already calls
 * `requireAdmin()` to decide whether to render at all, so re-reading the
 * session here would be a second database round-trip for information the
 * caller is holding.
 *
 * "Admin accounts" only appears for a super admin. That is presentation, not
 * access control: `/api/admin/admins` enforces the role server-side
 * regardless of what the nav shows (see lib/auth/require-admin.ts).
 */

import Link from "next/link";

import type { AuthenticatedAdmin } from "@/lib/auth/require-admin";
import { AdminSignOutButton } from "./admin-sign-out-button";
import { BORDER, cx, SURFACE, TEXT_ACCENT, TEXT_MUTED } from "@/components/ui/styles";
import { NavLink } from "./nav-link";

export function AdminHeader({ admin }: { admin: AuthenticatedAdmin }) {
  return (
    <header className={cx("border-b", BORDER, SURFACE)}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/admin"
          className="flex flex-col leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <span
            className={cx(
              "text-[10px] font-medium uppercase tracking-[0.18em]",
              TEXT_ACCENT,
            )}
          >
            Admin panel
          </span>
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            Senhill Holiday Resort
          </span>
        </Link>

        <nav
          aria-label="Admin"
          className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto"
        >
          <NavLink href="/admin" matchNested={false}>
            Dashboard
          </NavLink>
          <NavLink href="/admin/bookings">Bookings</NavLink>
          <NavLink href="/admin/calendar">Calendar</NavLink>
          <NavLink href="/admin/items">Rooms &amp; villa</NavLink>
          <NavLink href="/admin/notes">Notes</NavLink>
          {admin.role === "super_admin" && (
            <NavLink href="/admin/accounts">Accounts</NavLink>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <span className={cx("hidden text-xs sm:inline", TEXT_MUTED)}>
            {admin.name}
          </span>
          <AdminSignOutButton />
        </div>
      </div>
    </header>
  );
}
