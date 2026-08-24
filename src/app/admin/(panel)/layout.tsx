/**
 * Shell for every authenticated admin page (Slice 12).
 *
 * `(panel)` is a route group, so these pages keep their `/admin/...` URLs.
 * `/admin/login` deliberately sits outside it — a sign-in screen must not
 * render navigation for a session that does not exist yet, and putting it
 * outside the group is what makes that structural rather than a conditional
 * inside the layout.
 *
 * The `requireAdmin()` here is real access control, not just a way to get the
 * admin's name: a layout runs before the page beneath it, so an expired
 * cookie or a deactivated account is redirected before any page in the panel
 * renders. Each page still calls it too — a layout is not a security boundary
 * on its own (a client-side navigation can re-render a page without re-running
 * the layout), and every one of these pages also reads data that must be
 * refused to a non-admin.
 */

import { redirect } from "next/navigation";

import { AdminHeader } from "@/components/layout/admin-header";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminPanelLayout({
  children,
}: LayoutProps<"/admin">) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  return (
    <>
      <AdminHeader admin={auth.admin} />
      {children}
    </>
  );
}
