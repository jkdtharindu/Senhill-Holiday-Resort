/**
 * Staff sign-in (Slice 2; rebuilt onto the shared component system in
 * Slice 12).
 *
 * Deliberately outside the `(panel)` route group, so it renders without the
 * admin navigation — a sign-in screen must not show chrome for a session that
 * does not exist yet.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CardPanel, PageShell } from "@/components/ui/card";
import { cx, EYEBROW, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { getAdminSession } from "@/lib/auth/admin-session";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Staff sign-in",
  // Admin pages should never appear in search results.
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  // Already signed in — no reason to show the form again.
  if (await getAdminSession()) redirect("/admin");

  return (
    <PageShell width="narrow" className="max-w-sm">
      <header className="flex flex-col gap-2">
        <p className={EYEBROW}>Senhill Holiday Resort</p>
        <h1 className={cx("text-2xl font-semibold tracking-tight", TEXT_HEADING)}>
          Staff sign-in
        </h1>
        <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
          For resort staff only. Guests book with their Google account from the
          main site.
        </p>
      </header>

      <CardPanel>
        <AdminLoginForm />
      </CardPanel>

      <p className={cx("text-xs leading-relaxed", TEXT_MUTED)}>
        Not staff?{" "}
        <Link
          href="/"
          className="font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-500"
        >
          Back to the main site
        </Link>
        .
      </p>
    </PageShell>
  );
}
