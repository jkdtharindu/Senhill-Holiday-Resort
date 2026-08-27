/**
 * POST /api/bookings/:id/vote — admin, cast an ApprovalVote (FR9).
 *
 * The two-admin approval mechanism is the core trust check of the whole
 * system (docs/PRD.md §10, docs/HITL.md): a booking moves to `booked` only
 * once two distinct admins have voted `approve`, and a single `decline`
 * from either required admin moves it to `declined` immediately with no
 * tiebreaker.
 *
 * An admin re-voting overwrites their own prior vote — the unique
 * constraint on (booking_id, admin_id) in the schema enforces this
 * structurally, and lib/vote.ts's derivation respects it. The state change
 * and the audit log land in the same transaction as the vote insert, so a
 * booking can never be seen as `booked` without both vote rows actually
 * existing.
 *
 * The actual write cycle lives in lib/vote-service.ts, built on the pure
 * lib/vote.ts — this route stays a thin adapter, same pattern as every
 * other write route in this app.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { castVote } from "@/lib/vote-service";

const bodySchema = z.object({
  vote: z.enum(["approve", "decline"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide `vote` as either \"approve\" or \"decline\"." },
      { status: 400 },
    );
  }

  const result = await castVote({
    bookingId: id,
    adminId: auth.admin.id,
    adminName: auth.admin.name,
    vote: parsed.data.vote,
  });

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        ...("blockedBy" in result ? { blocked_by: result.blockedBy } : {}),
        ...("advanceAmountMissing" in result ? { advance_amount_missing: true } : {}),
      },
      { status: result.status },
    );
  }

  return Response.json({
    previousVote: result.previousVote,
    previousStatus: result.previousStatus,
    status: result.nextStatus,
    statusChanged: result.statusChanged,
  });
}
