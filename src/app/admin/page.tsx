import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatDateForDisplay, todayAtResort } from "@/lib/dates";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Admin · Senhill Holiday Resort",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const auth = await requireAdmin();
  // requireAdmin returns a Response for API routes; on a page we send them to
  // sign in instead. Covers an expired cookie and a deactivated account alike.
  if (!auth.ok) redirect("/admin/login");

  const [{ activeAdmins }] = await db
    .select({ activeAdmins: count() })
    .from(adminUsers)
    .where(eq(adminUsers.active, true));

  // Two different admins must approve before a booking is confirmed, so a
  // single-admin team cannot confirm anything at all. Worth saying plainly
  // rather than letting it be discovered when the first booking gets stuck.
  const canConfirmBookings = activeAdmins >= 2;

  return (
    <main className="min-h-dvh bg-stone-100 px-6 py-12 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-800 dark:text-teal-500">
              Senhill Holiday Resort
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Signed in as {auth.admin.name}
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {auth.admin.email} ·{" "}
              {auth.admin.role === "super_admin" ? "Super admin" : "Admin"} ·{" "}
              {formatDateForDisplay(todayAtResort())}
            </p>
          </div>
          <SignOutButton />
        </header>

        {!canConfirmBookings && (
          <section className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3.5 dark:border-amber-900/60 dark:bg-amber-950/30">
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              No booking can be confirmed yet
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              Confirming a booking takes approval from two different admins, and
              yours is currently the only active account. Until a second admin
              exists, guests can request a stay but nothing can ever move from
              requested to confirmed.
            </p>
          </section>
        )}

        <section className="rounded-md border border-stone-300 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Still being built
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Sign-in works. The calendar, bookings list, approvals and room
            management come in the phases after this one.
          </p>
        </section>
      </div>
    </main>
  );
}
