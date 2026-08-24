"use client";

/**
 * Booking request form (Slice 12).
 *
 * Client component because it needs live feedback: the nights count updates
 * as dates change, and a rejected request has to render `conflicting_dates`
 * per-date rather than as one opaque failure. It posts to `POST /api/bookings`
 * rather than using a server action, so the FR5a rejection shape defined in
 * Slice 8 is consumed exactly as documented, with one validation path shared
 * with any other client.
 *
 * The form deliberately does NOT pre-validate availability. The server
 * re-checks inside the write transaction (lib/booking-service.ts), and a
 * browser-side "looks free" would be stale the moment another guest submits.
 * Better to send the request and render the real answer.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { cx, TEXT_BODY, TEXT_MUTED } from "@/components/ui/styles";
import type { DateOnly } from "@/lib/dates";

export interface BookableOption {
  id: string;
  name: string;
  kind: "room" | "villa";
  capacity: number;
}

interface BookingFormProps {
  items: BookableOption[];
  defaultItemId: string | null;
  defaultCheckIn: string;
  windowFrom: DateOnly;
  windowTo: DateOnly;
  customerName: string;
  customerPhone: string | null;
  advancePaymentNotice: string;
}

interface ConflictDate {
  date: string;
  reason: string;
}

/** FR5a reason codes, in the guest's words rather than the schema's. */
const REASON_TEXT: Record<string, string> = {
  already_booked: "already taken",
  unavailable: "not open for booking",
  day_mode_mismatch: "not offered as this kind of stay",
  outside_window: "outside the booking window",
};

function describeReason(reason: string): string {
  return REASON_TEXT[reason] ?? reason.replace(/_/g, " ");
}

/** Nights between two ISO dates, or null if the range is not yet valid. */
function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (checkIn === "" || checkOut === "") return null;
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  const nights = Math.round(ms / 86_400_000);
  return nights > 0 ? nights : null;
}

export function BookingForm({
  items,
  defaultItemId,
  defaultCheckIn,
  windowFrom,
  windowTo,
  customerName,
  customerPhone,
  advancePaymentNotice,
}: BookingFormProps) {
  const router = useRouter();

  const [itemId, setItemId] = useState(defaultItemId ?? items[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState("");
  const [guestName, setGuestName] = useState(customerName);
  const [phone, setPhone] = useState(customerPhone ?? "");
  const [guestsCount, setGuestsCount] = useState("2");

  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDate[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(
    () => items.find((i) => i.id === itemId) ?? null,
    [items, itemId],
  );
  const nights = nightsBetween(checkIn, checkOut);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConflicts([]);

    const count = Number(guestsCount);
    if (!Number.isInteger(count) || count < 1) {
      setError("Enter how many guests are staying, as a whole number.");
      return;
    }
    if (nights === null) {
      setError("Check-out must be at least one night after check-in.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookable_item_id: itemId,
          check_in: checkIn,
          check_out: checkOut,
          guest_name: guestName,
          phone,
          guests_count: count,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        conflicting_dates?: ConflictDate[];
        booking?: { id: string };
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Could not send your request. Please try again.");
        setConflicts(data?.conflicting_dates ?? []);
        setSubmitting(false);
        return;
      }

      // refresh() so My bookings re-reads on the server and shows the new
      // request; push() alone can serve a cached tree that predates it.
      router.push("/my-bookings?created=1");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error !== null && (
        <Alert tone="error" title={error}>
          {conflicts.length > 0 && (
            <>
              <p className="mt-1">
                These nights in your range aren&apos;t available:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {conflicts.map((c) => (
                  <li key={c.date}>
                    {c.date} — {describeReason(c.reason)}
                  </li>
                ))}
              </ul>
              <p className="mt-1">
                The whole request was declined rather than partly booked, so
                you can adjust the dates and try again.
              </p>
            </>
          )}
        </Alert>
      )}

      <SelectField
        id="item"
        label="What would you like to book?"
        required
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        disabled={submitting}
        hint={
          selected !== null
            ? `Sleeps up to ${selected.capacity} guests.`
            : undefined
        }
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} ({item.kind === "villa" ? "whole villa" : "room"})
          </option>
        ))}
      </SelectField>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField
          id="check-in"
          label="Check-in"
          type="date"
          required
          value={checkIn}
          min={windowFrom}
          max={windowTo}
          onChange={(e) => setCheckIn(e.target.value)}
          disabled={submitting}
        />
        <TextField
          id="check-out"
          label="Check-out"
          type="date"
          required
          value={checkOut}
          // Check-out is the morning you leave, so it may be the day after the
          // window's last bookable night — hence no `max` tied to windowTo.
          min={checkIn !== "" ? checkIn : windowFrom}
          onChange={(e) => setCheckOut(e.target.value)}
          disabled={submitting}
          hint="The morning you leave — that night is free for the next guest."
        />
      </div>

      {nights !== null && (
        <p className={cx("-mt-2 text-xs", TEXT_MUTED)}>
          {nights} night{nights === 1 ? "" : "s"}.
        </p>
      )}

      <TextField
        id="guest-name"
        label="Name for the booking"
        required
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        disabled={submitting}
        autoComplete="name"
      />

      <TextField
        id="phone"
        label="Phone number"
        type="tel"
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        disabled={submitting}
        autoComplete="tel"
        hint="How we reach you about this booking. Required."
      />

      <TextField
        id="guests"
        label="How many guests?"
        type="number"
        min={1}
        max={selected?.capacity}
        required
        value={guestsCount}
        onChange={(e) => setGuestsCount(e.target.value)}
        disabled={submitting}
      />

      <Alert tone="info" title="Before you send this">
        {advancePaymentNotice}
      </Alert>

      <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
        Sending this puts in a request — it isn&apos;t confirmed yet. Our team
        reviews every request, and you&apos;ll see it as awaiting confirmation
        under My bookings until then.
      </p>

      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? "Sending…" : "Send booking request"}
      </Button>
    </form>
  );
}
