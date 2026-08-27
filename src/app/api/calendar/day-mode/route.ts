/**
 * PUT /api/calendar/day-mode — admin, set DayMode for explicit dates
 * GET /api/calendar/day-mode — admin, inspect current settings in a range
 *
 * DayMode is what makes double-booking structurally impossible: a date is
 * always exclusively room-bookable or villa-bookable, never both, so the two
 * inventories can never collide (docs/PRD.md §9). This is the write path for
 * that mechanic.
 *
 * A request may partially succeed — some dates apply, others are blocked by
 * an existing booking under the date's current mode — so the response lists
 * both rather than all-or-nothing failing the whole request. See
 * .../bulk/route.ts for the pattern-based version of the same operation; both
 * routes share their fetch-plan-write cycle via lib/day-mode-service.ts so
 * they cannot drift apart on what counts as blocked.
 */

import type { NextRequest } from "next/server";
import { and, asc, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { dayModes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isValidDateOnly, type DateOnly } from "@/lib/dates";
import { applyDayModePlan, clearDayModePlan } from "@/lib/day-mode-service";
import { MAX_EXPLICIT_DATES, normalizeDates } from "@/lib/day-mode";

const putSchema = z.object({
  dates: z
    .array(z.string())
    .min(1, "Provide at least one date.")
    .max(
      MAX_EXPLICIT_DATES,
      `No more than ${MAX_EXPLICIT_DATES} dates in a single request — split it up.`,
    ),
  mode: z.enum(["room_mode", "villa_mode"]),
});

export async function PUT(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide `dates` (a non-empty array) and `mode` (room_mode or villa_mode)." },
      { status: 400 },
    );
  }

  const invalidDate = parsed.data.dates.find((d) => !isValidDateOnly(d));
  if (invalidDate !== undefined) {
    return Response.json(
      { error: `"${invalidDate}" is not a valid date. Use YYYY-MM-DD.` },
      { status: 400 },
    );
  }

  const dates = normalizeDates(parsed.data.dates as DateOnly[]);
  const result = await applyDayModePlan(dates, parsed.data.mode, auth.admin.id);

  return Response.json(result);
}

const getQuerySchema = z.object({
  from: z.string().refine(isValidDateOnly, "`from` must be a valid date."),
  to: z.string().refine(isValidDateOnly, "`to` must be a valid date."),
});

/**
 * Raw day_modes rows in a range — not the public CalendarState aggregate
 * (that derivation, combining DayMode with per-room booking status into the
 * open/reserved/booked colours guests see, is GET /api/calendar — a separate,
 * not-yet-built slice). This exists so an admin picking dates to set can see
 * what is already configured, without computing anything about bookings.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = getQuerySchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Provide `from` and `to` as YYYY-MM-DD query parameters." },
      { status: 400 },
    );
  }

  const { from, to } = parsed.data;
  if (from > to) {
    return Response.json({ error: "`from` must not be after `to`." }, { status: 400 });
  }

  const rows = await db
    .select({
      date: dayModes.date,
      mode: dayModes.mode,
      setBy: dayModes.setBy,
      updatedAt: dayModes.updatedAt,
    })
    .from(dayModes)
    .where(and(gte(dayModes.date, from), lte(dayModes.date, to)))
    .orderBy(asc(dayModes.date));

  return Response.json({ dayModes: rows });
}

const deleteSchema = z.object({
  dates: z
    .array(z.string())
    .min(1, "Provide at least one date.")
    .max(
      MAX_EXPLICIT_DATES,
      `No more than ${MAX_EXPLICIT_DATES} dates in a single request — split it up.`,
    ),
});

export async function DELETE(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide `dates` as a non-empty array of dates in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  const invalidDate = parsed.data.dates.find((d) => !isValidDateOnly(d));
  if (invalidDate !== undefined) {
    return Response.json(
      { error: `"${invalidDate}" is not a valid date. Use YYYY-MM-DD.` },
      { status: 400 },
    );
  }

  const dates = normalizeDates(parsed.data.dates as DateOnly[]);
  const result = await clearDayModePlan(dates);

  return Response.json(result);
}
