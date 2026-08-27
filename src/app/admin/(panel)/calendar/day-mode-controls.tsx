"use client";

/**
 * DayMode assignment controls (Slice 12) — the UI over Slice 5's
 * `PUT /calendar/day-mode` (explicit dates) and
 * `PUT /calendar/day-mode/bulk` (recurrence pattern).
 *
 * Two endpoints, one form. "Weekends only" is the single recurrence pattern
 * `lib/day-mode.ts` implements, so it goes to the bulk endpoint; "every day"
 * enumerates the range here and posts an explicit date list. Deliberately NOT
 * done by adding an `all` pattern server-side — extending the domain model to
 * suit a form is how a UI slice quietly becomes a business-rules slice.
 *
 * Both paths surface `blocked` dates individually. A DayModeSwitchBlock is
 * not a failure to retry: it means real bookings exist on those dates under
 * the other mode, and the admin has to resolve them first. Collapsing that
 * into "some dates failed" would hide the only information that says what to
 * do next.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import type { DayModeKind } from "@/db/schema";

interface BlockedDate {
  date: string;
  reason?: string;
}

interface DayModeResponse {
  updated?: string[];
  blocked?: Array<string | BlockedDate>;
  error?: string;
}

/** The endpoints report blocked entries as strings or objects; accept both. */
function blockedDateOf(entry: string | BlockedDate): string {
  return typeof entry === "string" ? entry : entry.date;
}

/** Every ISO date from `from` to `to` inclusive, walked in UTC to avoid DST drift. */
function datesInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  let cursor = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(cursor) || Number.isNaN(end)) return out;
  while (cursor <= end) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return out;
}

function ResultAlert({ result }: { result: DayModeResponse }) {
  const updated = result.updated ?? [];
  const blocked = result.blocked ?? [];

  if (blocked.length === 0) {
    return (
      <Alert tone="success">
        {updated.length} date{updated.length === 1 ? "" : "s"} updated.
      </Alert>
    );
  }

  return (
    <Alert tone="warning" title={`${updated.length} updated, ${blocked.length} blocked`}>
      <p className="mt-1">
        These dates already have bookings that switching mode would break, so
        they were left as they are. Resolve those bookings first:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {blocked.map((entry) => (
          <li key={blockedDateOf(entry)}>{blockedDateOf(entry)}</li>
        ))}
      </ul>
    </Alert>
  );
}

type ModeOption = DayModeKind | "clear";

const MODES: Array<{ value: ModeOption; label: string }> = [
  { value: "room_mode", label: "Room mode — rooms let individually" },
  { value: "villa_mode", label: "Villa mode — whole property as one" },
  { value: "clear", label: "Clear mode — close to bookings" },
];

/** Largest explicit date list the endpoint accepts (MAX_EXPLICIT_DATES). */
const MAX_EXPLICIT_DATES = 500;

export function DayModeControls({
  windowFrom,
  windowTo,
}: {
  windowFrom: string;
  windowTo: string;
}) {
  const router = useRouter();

  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [mode, setMode] = useState<ModeOption>("room_mode");
  const [scope, setScope] = useState<"all" | "weekends">("all");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DayModeResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (rangeFrom === "" || rangeTo === "" || rangeTo < rangeFrom) {
      setError("Choose a date range, with the end on or after the start.");
      return;
    }

    let url: string;
    let method: string;
    let body: unknown;

    if (mode === "clear") {
      // Clearing mode doesn't support the bulk/pattern approach — always explicit dates
      const dates = datesInclusive(rangeFrom, rangeTo);
      if (dates.length > MAX_EXPLICIT_DATES) {
        setError(
          `That range covers ${dates.length} days — more than the ${MAX_EXPLICIT_DATES} a single request allows. Split it up.`,
        );
        return;
      }
      method = "DELETE";
      url = "/api/calendar/day-mode";
      body = { dates };
    } else if (scope === "weekends") {
      method = "PUT";
      url = "/api/calendar/day-mode/bulk";
      body = { from: rangeFrom, to: rangeTo, pattern: "weekends", mode };
    } else {
      method = "PUT";
      const dates = datesInclusive(rangeFrom, rangeTo);
      if (dates.length > MAX_EXPLICIT_DATES) {
        setError(
          `That range covers ${dates.length} days — more than the ${MAX_EXPLICIT_DATES} a single request allows. Split it up.`,
        );
        return;
      }
      url = "/api/calendar/day-mode";
      body = { dates, mode };
    }

    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as DayModeResponse | null;

      if (!response.ok) {
        const action = mode === "clear" ? "clear the mode" : "set the mode";
        setError(data?.error ?? `Could not ${action}. Please try again.`);
        setBusy(false);
        return;
      }

      setResult(data ?? {});
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error !== null && <Alert tone="error">{error}</Alert>}
      {result !== null && <ResultAlert result={result} />}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="dm-from"
            label="From"
            type="date"
            required
            min={windowFrom}
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            disabled={busy}
          />
          <TextField
            id="dm-to"
            label="To"
            type="date"
            required
            min={rangeFrom !== "" ? rangeFrom : windowFrom}
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            disabled={busy}
            hint={`The public calendar shows up to ${windowTo}.`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="dm-scope"
            label="Which days in that range"
            value={scope}
            onChange={(e) => setScope(e.target.value as "all" | "weekends")}
            disabled={busy || mode === "clear"}
            hint={mode === "clear" ? "Clearing mode uses every day only" : undefined}
          >
            <option value="all">Every day</option>
            <option value="weekends">Weekends only</option>
          </SelectField>

          <SelectField
            id="dm-mode"
            label="Set to"
            value={mode}
            onChange={(e) => setMode(e.target.value as ModeOption)}
            disabled={busy}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </SelectField>
        </div>

        <Button type="submit" disabled={busy} className="self-start">
          {busy ? (mode === "clear" ? "Clearing…" : "Applying…") : mode === "clear" ? "Clear" : "Apply"}
        </Button>
      </form>

      <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-500">
        Dates you never set stay closed to bookings — there is no default mode.
        Opening a date is a deliberate act, so an unset date can never be sold
        by accident. Use "Clear mode" to close previously open dates (e.g., for
        renovations or special closures) — if no active bookings conflict, the
        dates will revert to closed.
      </p>
    </div>
  );
}
