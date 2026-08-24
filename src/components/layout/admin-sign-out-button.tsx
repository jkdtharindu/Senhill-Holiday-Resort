"use client";

/**
 * Admin sign-out (Slice 12; moved here from src/app/admin/ when the panel
 * gained a shared header).
 *
 * POST, not GET: a GET sign-out can be triggered by another site embedding
 * the URL, or by a browser prefetching a link.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function AdminSignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/admin/logout", { method: "POST" }).catch(() => {});
    // refresh() alongside replace() so the server components re-read the now
    // absent cookie; replace() alone can serve a cached tree that still
    // believes someone is signed in.
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
