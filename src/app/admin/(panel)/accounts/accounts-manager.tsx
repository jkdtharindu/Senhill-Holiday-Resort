"use client";

/**
 * Admin account management (Slice 12) — the UI over Slice 2's
 * `POST /admin/admins` and `PATCH /admin/admins/:id`.
 *
 * Two rules from Slice 2 are surfaced here rather than left to be discovered
 * through a rejected request:
 *
 * 1. A newly created admin's password is shown ONCE, right after creation. No
 *    endpoint can retrieve it afterwards, and a super admin cannot reset
 *    another admin's password — only its owner can. If it is lost at this
 *    moment, that account is unreachable.
 * 2. Deactivating yourself, or the last remaining active super admin, is
 *    refused by the server. Both are disabled in the UI too, with the reason
 *    shown — a button that always errors is worse than one that explains.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { DataTable } from "@/components/ui/table";
import { cx, TEXT_MUTED } from "@/components/ui/styles";

export interface AdminRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "super_admin";
  active: boolean;
}

interface AccountsManagerProps {
  admins: AdminRow[];
  currentAdminId: string;
  isSuperAdmin: boolean;
}

export function AccountsManager({
  admins,
  currentAdminId,
  isSuperAdmin,
}: AccountsManagerProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The password just used to create an account — shown once, then cleared. */
  const [createdSecret, setCreatedSecret] = useState<
    { email: string; password: string } | null
  >(null);

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedSecret(null);

    if (password.length < 12) {
      setError("The starting password must be at least 12 characters.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not create that admin.");
        setBusy(false);
        return;
      }

      setCreatedSecret({ email, password });
      setName("");
      setEmail("");
      setPassword("");
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/admins/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not change that account.");
        setBusy(false);
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  const activeSuperAdmins = admins.filter(
    (a) => a.active && a.role === "super_admin",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {error !== null && <Alert tone="error">{error}</Alert>}

      {createdSecret !== null && (
        <Alert tone="warning" title="Copy this password now — it is shown only once">
          <p className="mt-1">
            Account <strong>{createdSecret.email}</strong> was created with the
            starting password:
          </p>
          <p className="mt-2 rounded border border-amber-400 bg-amber-100 px-2 py-1 font-mono text-sm dark:border-amber-800 dark:bg-amber-950">
            {createdSecret.password}
          </p>
          <p className="mt-2">
            Nobody can look this up later, and a super admin cannot reset
            another admin&apos;s password. Send it to them now, and have them
            change it once they are signed in.
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => setCreatedSecret(null)}>
              I have saved it
            </Button>
          </div>
        </Alert>
      )}

      <DataTable<AdminRow>
        caption={`Admin accounts, ${admins.length} row${admins.length === 1 ? "" : "s"}`}
        rows={admins}
        rowKey={(row) => row.id}
        columns={[
          {
            key: "name",
            header: "Name",
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {row.name}
                  {row.id === currentAdminId && (
                    <span className={cx("ml-2 text-xs font-normal", TEXT_MUTED)}>
                      you
                    </span>
                  )}
                </span>
                <span className={cx("text-xs", TEXT_MUTED)}>{row.email}</span>
              </div>
            ),
          },
          {
            key: "role",
            header: "Role",
            hideOnMobile: true,
            cell: (row) =>
              row.role === "super_admin" ? (
                <Badge tone="info">Super admin</Badge>
              ) : (
                <Badge tone="neutral">Admin</Badge>
              ),
          },
          {
            key: "status",
            header: "Status",
            cell: (row) =>
              row.active ? (
                <Badge tone="open">Active</Badge>
              ) : (
                <Badge tone="closed">Deactivated</Badge>
              ),
          },
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            cell: (row) => {
              if (!isSuperAdmin) return null;

              const isSelf = row.id === currentAdminId;
              const isLastSuperAdmin =
                row.active && row.role === "super_admin" && activeSuperAdmins <= 1;
              const blocked = isSelf || isLastSuperAdmin;

              return (
                <div className="flex flex-col items-start gap-1">
                  <Button
                    variant={row.active ? "danger" : "secondary"}
                    size="sm"
                    disabled={busy || blocked}
                    onClick={() => setActive(row.id, !row.active)}
                  >
                    {row.active ? "Deactivate" : "Reactivate"}
                  </Button>
                  {blocked && (
                    <span className={cx("text-xs", TEXT_MUTED)}>
                      {isSelf
                        ? "You cannot deactivate yourself"
                        : "The last super admin must stay active"}
                    </span>
                  )}
                </div>
              );
            },
          },
        ]}
      />

      {isSuperAdmin && (
        <form onSubmit={createAdmin} className="flex flex-col gap-5" noValidate>
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Add an admin
          </h3>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              id="new-admin-name"
              label="Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
            <TextField
              id="new-admin-email"
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
          </div>

          <TextField
            id="new-admin-password"
            label="Starting password"
            type="text"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="off"
            hint="At least 12 characters. Shown once after creation and never retrievable again — they should change it when they first sign in."
          />

          <Button type="submit" disabled={busy} className="self-start">
            {busy ? "Creating…" : "Create admin"}
          </Button>
        </form>
      )}
    </div>
  );
}
