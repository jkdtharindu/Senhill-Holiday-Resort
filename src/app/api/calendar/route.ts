/**
 * GET /api/calendar — the public calendar.
 *
 * Public: no authentication, and the response is identical for everyone,
 * signed in or not — CalendarState is deliberately coarse (docs/PRD.md §9),
 * with no guest identity or room-level detail. That detail lives behind login
 * at GET /calendar/:date, a separate slice.
 *
 * BookingWindow is enforced here, not just hidden in the UI: the requested
 * range is clamped to today through today+90 days regardless of what the
 * caller asks for, so a request straight at the API cannot see further ahead
 * than the frontend calendar would ever navigate to.
 *
 * The actual fetch-and-derive logic lives in lib/calendar-service.ts, shared
 * with the server-rendered /calendar page — this route stays a thin adapter.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { isValidDateOnly } from "@/lib/dates";
import { fetchCalendarDays } from "@/lib/calendar-service";

const querySchema = z.object({
  from: z.string().refine(isValidDateOnly, "`from` must be a valid date."),
  to: z.string().refine(isValidDateOnly, "`to` must be a valid date."),
});

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
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

  const calendar = await fetchCalendarDays(from, to);
  return Response.json({ calendar });
}
