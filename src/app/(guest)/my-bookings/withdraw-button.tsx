"use client";

/**
 * Guest self-service withdrawal of a pending request.
 *
 * Only rendered for a booking still in `reserved` — the server enforces the
 * same rule (lib/cancellation.ts), because hiding a button is not access
 * control. Once two admins have confirmed a stay an advance payment has
 * usually been arranged offline, so cancelling it is a conversation with
 * staff rather than a click.
 *
 * Confirmed before it fires, for the same reason the admin decline is
 * (`admin/.../vote-panel.tsx`): withdrawal is terminal and cannot be voted
 * or clicked back. The guest re-books if they change their mind.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface WithdrawButtonProps {
  bookingId: string;
  /** Shown in the confirmation so the guest is sure which request they are dropping. */
  itemName: string;
}

export function WithdrawButton({ bookingId, itemName }: WithdrawButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not withdraw this request. Please try again.");
        setBusy(false);
        return;
      }

      setConfirming(false);
      setBusy(false);
      // The whole page re-reads: the status badge, the explanation text and
      // whether this button should still exist all change together.
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <Alert tone="warning" title="Withdraw this request?">
        <p className="mt-1">
          This cancels your request for {itemName}. It can&rsquo;t be undone —
          you&rsquo;d need to make a new request if you change your mind.
        </p>
        {error !== null && (
          <p className="mt-2 font-medium">{error}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="danger" size="sm" disabled={busy} onClick={withdraw}>
            {busy ? "Withdrawing…" : "Yes, withdraw it"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Keep it
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error !== null && <Alert tone="error">{error}</Alert>}
      <div>
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          Withdraw request
        </Button>
      </div>
    </div>
  );
}
