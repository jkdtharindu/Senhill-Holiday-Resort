/**
 * PUT /api/calendar/day-mode/bulk — admin, BulkDayModeAssignment by pattern
 *
 * "Set every weekend in this range to villa_mode" in one call, rather than
 * selecting each Saturday and Sunday individually. The pattern is resolved to
 * an explicit date list server-side (lib/day-mode.ts), then run through the
 * exact same plan/apply logic as the single-date endpoint next door — so the
 * two routes can never disagree about what counts as a blocked switch.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { isValidDateOnly } from "@/lib/dates";
import {
  DayModePatternError,
  DAY_MODE_PATTERNS,
  isDayModePattern,
  resolvePatternDates,
} from "@/lib/day-mode";
import { applyDayModePlan } from "@/lib/day-mode-service";

const bulkSchema = z.object({
  from: z.string().refine(isValidDateOnly, "`from` must be a valid date."),
  to: z.string().refine(isValidDateOnly, "`to` must be a valid date."),
  pattern: z.string(),
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

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Provide `from`, `to` (YYYY-MM-DD), `pattern`, and `mode` " +
          "(room_mode or villa_mode).",
      },
      { status: 400 },
    );
  }

  const { from, to, pattern, mode } = parsed.data;

  if (!isDayModePattern(pattern)) {
    return Response.json(
      {
        error: `Unknown pattern "${pattern}". Supported: ${DAY_MODE_PATTERNS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  let dates;
  try {
    dates = resolvePatternDates(pattern, from, to);
  } catch (error) {
    if (error instanceof DayModePatternError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const result = await applyDayModePlan(dates, mode, auth.admin.id);
  return Response.json(result);
}
