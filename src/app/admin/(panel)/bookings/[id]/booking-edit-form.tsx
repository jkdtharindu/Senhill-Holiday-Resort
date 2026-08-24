"use client";

/**
 * Admin booking edit form (Slice 12) — the UI over Slice 10's
 * `PUT /bookings/:id`.
 *
 * Sends only the fields that actually changed, so the audit log records an
 * admin's real edit rather than a row per field on every save. The endpoint
 * diffs server-side too (lib/booking-update.ts), so this is a courtesy to the
 * log's readability, not the correctness boundary.
 *
 * `status` is absent by design — it changes only through the vote panel. The
 * endpoint rejects a `status` key outright.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import type { PaymentStage } from "@/db/schema";

interface BookingEditFormProps {
  bookingId: string;
  initial: {
    guestName: string;
    phone: string;
    email: string;
    paymentStage: PaymentStage;
    advanceAmount: string | null;
    advancePaidDate: string | null;
    internalNotes: string;
  };
}

const PAYMENT_STAGES: Array<{ value: PaymentStage; label: string }> = [
  { value: "unpaid", label: "Unpaid" },
  { value: "advance_paid", label: "Advance paid" },
  { value: "fully_paid", label: "Fully paid" },
  { value: "refunded", label: "Refunded" },
];

export function BookingEditForm({ bookingId, initial }: BookingEditFormProps) {
  const router = useRouter();

  const [guestName, setGuestName] = useState(initial.guestName);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>(initial.paymentStage);
  const [advanceAmount, setAdvanceAmount] = useState(initial.advanceAmount ?? "");
  const [advancePaidDate, setAdvancePaidDate] = useState(initial.advancePaidDate ?? "");
  const [internalNotes, setInternalNotes] = useState(initial.internalNotes);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);

    // Empty string means "clear it" for the two nullable fields, and "no
    // change" for the rest — hence the explicit null rather than "".
    const patch: Record<string, unknown> = {};
    if (guestName !== initial.guestName) patch.guestName = guestName;
    if (phone !== initial.phone) patch.phone = phone;
    if (email !== initial.email) patch.email = email;
    if (paymentStage !== initial.paymentStage) patch.paymentStage = paymentStage;
    if (internalNotes !== initial.internalNotes) patch.internalNotes = internalNotes;

    const normalisedAmount = advanceAmount.trim() === "" ? null : advanceAmount.trim();
    if (normalisedAmount !== initial.advanceAmount) patch.advanceAmount = normalisedAmount;

    const normalisedDate = advancePaidDate.trim() === "" ? null : advancePaidDate.trim();
    if (normalisedDate !== initial.advancePaidDate) patch.advancePaidDate = normalisedDate;

    if (Object.keys(patch).length === 0) {
      setSaved("Nothing changed.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        changedFields?: string[];
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not save. Please try again.");
        setSubmitting(false);
        return;
      }

      const n = data?.changedFields?.length ?? 0;
      setSaved(`Saved — ${n} field${n === 1 ? "" : "s"} updated and logged.`);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error !== null && <Alert tone="error">{error}</Alert>}
      {saved !== null && <Alert tone="success">{saved}</Alert>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField
          id="edit-guest-name"
          label="Guest name"
          required
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          disabled={submitting}
        />
        <TextField
          id="edit-phone"
          label="Phone"
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting}
          hint="Compulsory — cannot be left blank."
        />
      </div>

      <TextField
        id="edit-email"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={submitting}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <SelectField
          id="edit-payment-stage"
          label="Payment stage"
          value={paymentStage}
          onChange={(e) => setPaymentStage(e.target.value as PaymentStage)}
          disabled={submitting}
        >
          {PAYMENT_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>

        <TextField
          id="edit-advance-amount"
          label="Advance amount"
          type="number"
          min={0}
          step="0.01"
          value={advanceAmount}
          onChange={(e) => setAdvanceAmount(e.target.value)}
          disabled={submitting}
          hint="Leave blank to clear."
        />

        <TextField
          id="edit-advance-date"
          label="Advance paid on"
          type="date"
          value={advancePaidDate}
          onChange={(e) => setAdvancePaidDate(e.target.value)}
          disabled={submitting}
          hint="Leave blank to clear."
        />
      </div>

      <TextAreaField
        id="edit-internal-notes"
        label="Internal notes"
        value={internalNotes}
        onChange={(e) => setInternalNotes(e.target.value)}
        disabled={submitting}
        rows={4}
        hint="Only admins see this. The guest never does."
      />

      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
