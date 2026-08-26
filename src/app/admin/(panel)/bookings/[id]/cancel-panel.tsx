"use client";

/**
 * Admin cancellation controls — the UI over `POST /bookings/:id/cancel`.
 *
 * An admin may cancel a booking in either live state, `reserved` or `booked`.
 * No ApprovalVote is required: the two-admin rule exists to stop a date being
 * *held* carelessly, and releasing one is the safe direction (lib/cancellation.ts).
 *
 * A reason is compulsory here, unlike a guest withdrawal — this is the record
 * staff rely on in a dispute, and the server refuses a blank one independently.
 *
 * Cancelling a CONFIRMED stay warns about the advance payment, because the app
 * cannot act on it: pricing is out of scope (PRD §4), so any refund is arranged
 * and recorded by hand afterwards through the payment stage field.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cx, TEXT_BODY } from "@/components/ui/styles";
import type { BookingStatus, PaymentStage } from "@/db/schema";
import { MAX_CANCELLATION_REASON } from "@/lib/cancellation";

interface CancelPanelProps {
  bookingId: string;
  status: BookingStatus;
  paymentStage: PaymentStage;
}

export function CancelPanel({ bookingId, status, paymentStage }: CancelPanelProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const moneyTaken = paymentStage === "advance_paid" || paymentStage === "fully_paid";

  async function cancel() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not cancel this booking. Please try again.");
        setBusy(false);
        return;
      }

      setConfirming(false);
      setBusy(false);
      // Status badge, cancellation record and audit history all change
      // together — re-read the page rather than patching one of them.
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (status === "cancelled") {
    return <Alert tone="info">This booking is already cancelled.</Alert>;
  }

  if (status === "declined") {
    return (
      <Alert tone="info">
        This booking was declined during approval, so there is nothing to
        cancel — its dates were never held.
      </Alert>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3">
        {error !== null && <Alert tone="error">{error}</Alert>}
        <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
          Cancelling releases these dates immediately — they become bookable
          again as soon as it is done. This cannot be undone.
        </p>
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Cancel this booking
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error !== null && <Alert tone="error">{error}</Alert>}

      {moneyTaken && (
        <Alert tone="warning" title="A payment has been recorded against this booking">
          The payment stage is currently{" "}
          {paymentStage === "fully_paid" ? "fully paid" : "advance paid"}.
          Cancelling does not refund anything — arrange the refund with the
          guest, then set the payment stage to <strong>Refunded</strong> in the
          details below so the record matches what actually happened.
        </Alert>
      )}

      <label className="flex flex-col gap-1.5">
        <span className={cx("text-sm font-medium", TEXT_BODY)}>
          Why is this being cancelled? (required)
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={MAX_CANCELLATION_REASON}
          disabled={busy}
          placeholder="e.g. Guest called to cancel — family emergency"
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        />
        <span className="text-xs text-stone-500 dark:text-stone-400">
          Recorded in this booking&rsquo;s history. {trimmed.length}/
          {MAX_CANCELLATION_REASON}
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          disabled={busy || trimmed === ""}
          onClick={cancel}
        >
          {busy ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Keep booking
        </Button>
      </div>
    </div>
  );
}
