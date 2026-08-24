"use client";

/**
 * ApprovalVote controls (Slice 12) — the UI over Slice 9's
 * `POST /bookings/:id/vote`.
 *
 * Declining asks for confirmation first. A decline is terminal: it moves the
 * booking to `declined` immediately regardless of any standing approve, and
 * there is no way to vote it back (`lib/vote.ts`). An accidental click on an
 * irreversible action is worth one extra step.
 *
 * Approving is not confirmed — it is reversible right up until the second
 * admin approves, since re-voting overwrites your own prior vote.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cx, TEXT_BODY } from "@/components/ui/styles";
import type { BookingStatus } from "@/db/schema";

interface VotePanelProps {
  bookingId: string;
  status: BookingStatus;
  /** This admin's currently standing vote, if they have already voted. */
  myVote: "approve" | "decline" | null;
  approveCount: number;
}

export function VotePanel({
  bookingId,
  status,
  myVote,
  approveCount,
}: VotePanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const resolved = status !== "reserved";

  async function castVote(vote: "approve" | "decline") {
    setError(null);
    setBusy(vote);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not record your vote. Please try again.");
        setBusy(null);
        return;
      }

      setConfirmingDecline(false);
      setBusy(null);
      // The whole page re-reads: status, vote list and audit history all
      // change together, and re-fetching one of them alone would show a
      // booking whose badge and history disagree.
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(null);
    }
  }

  if (resolved) {
    return (
      <Alert tone={status === "booked" ? "success" : "error"}>
        This booking is {status === "booked" ? "confirmed" : "declined"} —
        voting is closed on it.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error !== null && <Alert tone="error">{error}</Alert>}

      <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
        {approveCount === 0
          ? "No approvals yet. Two different admins must approve before this is confirmed."
          : approveCount === 1
            ? "One approval so far. One more from a different admin confirms it."
            : `${approveCount} approvals recorded.`}
        {myVote !== null && (
          <>
            {" "}
            You currently have <strong>{myVote === "approve" ? "approved" : "declined"}</strong> this booking
            {myVote === "approve" ? " — voting again replaces your vote." : "."}
          </>
        )}
      </p>

      {confirmingDecline ? (
        <Alert tone="warning" title="Decline this booking?">
          <p className="mt-1">
            A decline takes effect immediately and cannot be undone — the
            booking cannot be voted back to confirmed afterwards.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() => castVote("decline")}
            >
              {busy === "decline" ? "Declining…" : "Yes, decline it"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => setConfirmingDecline(false)}
            >
              Cancel
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy !== null}
            onClick={() => castVote("approve")}
          >
            {busy === "approve"
              ? "Recording…"
              : myVote === "approve"
                ? "Approved"
                : "Approve"}
          </Button>
          <Button
            variant="danger"
            disabled={busy !== null}
            onClick={() => setConfirmingDecline(true)}
          >
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
