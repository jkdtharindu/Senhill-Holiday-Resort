/**
 * Admin accounts (Slice 12).
 *
 * Every admin can see the list and change their own password. Only a super
 * admin can create accounts or activate/deactivate them — enforced by
 * `requireSuperAdmin` on the endpoints, with the UI matching so a plain admin
 * is not shown controls that would only ever return 403.
 *
 * There is no role control anywhere here: promotion to super_admin is
 * HITL-gated (docs/HITL.md) and has no endpoint at all.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";

import { Alert } from "@/components/ui/alert";
import { CardPanel, PageHeader, PageShell } from "@/components/ui/card";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AccountsManager, type AdminRow } from "./accounts-manager";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: "Admin accounts",
  robots: { index: false, follow: false },
};

export default async function AdminAccountsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  const admins: AdminRow[] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt));

  const isSuperAdmin = auth.admin.role === "super_admin";
  const activeCount = admins.filter((a) => a.active).length;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Admin"
        title="Admin accounts"
        description={`${activeCount} active of ${admins.length} total. Confirming a booking needs two different active admins.`}
      />

      {activeCount < 2 && (
        <Alert tone="warning" title="Bookings cannot be confirmed">
          Approval takes two different admins. With only one active account,
          guest requests can arrive but nothing can ever move to confirmed.
        </Alert>
      )}

      <CardPanel
        title="Accounts"
        description={
          isSuperAdmin
            ? "Deactivating an account takes effect immediately, even mid-session."
            : "Only a super admin can add accounts or change whether they are active."
        }
      >
        <AccountsManager
          admins={admins}
          currentAdminId={auth.admin.id}
          isSuperAdmin={isSuperAdmin}
        />
      </CardPanel>

      <CardPanel
        title="Your password"
        description="You can only change your own. Nobody else can set it for you — not even a super admin."
      >
        <ChangePasswordForm />
      </CardPanel>
    </PageShell>
  );
}
