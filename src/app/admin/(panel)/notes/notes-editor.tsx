"use client";

/**
 * Site-wide DefaultNotes editor (Slice 12) — the UI over Slice 11's
 * `PUT /site-settings`.
 *
 * The endpoint treats a save with no change as `changed: false` rather than an
 * error, so this reports "no change" plainly instead of dressing it up as a
 * successful write that did nothing.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";

export function NotesEditor({ initialNotes }: { initialNotes: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);

    try {
      const response = await fetch("/api/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultNotes: notes }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        changed?: boolean;
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not save the notes. Please try again.");
        setBusy(false);
        return;
      }

      setStatus(
        data?.changed === true
          ? "Saved — guests will see this on the booking form."
          : "No change — what you saved matches what was already there.",
      );
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error !== null && <Alert tone="error">{error}</Alert>}
      {status !== null && <Alert tone="success">{status}</Alert>}

      <TextAreaField
        id="default-notes"
        label="Site-wide booking notes"
        required
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={busy}
        rows={10}
        hint="Shown to every guest on every booking, whichever room they choose. Cannot be left blank."
      />

      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Saving…" : "Save notes"}
      </Button>
    </form>
  );
}
