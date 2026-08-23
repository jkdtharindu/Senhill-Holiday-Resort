import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
    <main className="min-h-dvh bg-stone-100 px-6 py-16 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-800 dark:text-teal-500">
            Senhill Holiday Resort
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Staff sign-in
          </h1>
          <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            For resort staff only. Guests book with their Google account from the
            main site.
          </p>
        </header>

        <AdminLoginForm />
      </div>
    </main>
  );
}
