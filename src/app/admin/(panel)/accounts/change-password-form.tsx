"use client";

/**
 * Change your own password (Slice 12) — the UI over Slice 2's
 * `POST /admin/me/password`.
 *
 * Own password only, by design: a super admin cannot set someone else's, so
 * an issued starting password can be replaced with something nobody else has
 * ever seen. That is the whole point of the endpoint, so the form says it.
 */

import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

const MIN_LENGTH = 12;

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not change your password.");
        setBusy(false);
        return;
      }

      // Cleared on success so the values do not sit in the DOM afterwards.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(true);
      setBusy(false);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error !== null && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">Your password has been changed.</Alert>}

      <TextField
        id="current-password"
        label="Current password"
        type="password"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        disabled={busy}
        autoComplete="current-password"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField
          id="new-password"
          label="New password"
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
          hint={`At least ${MIN_LENGTH} characters.`}
        />
        <TextField
          id="confirm-password"
          label="New password again"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
