/**
 * POST /api/bookings/:id/cancel — cancel a booking.
 *
 * Serves both actors from one route, because the rule about who may cancel
 * what is a single rule and splitting it across two endpoints would let the
 * two halves drift apart. Which actor is calling is decided HERE, from the
 * session, never from the request body — a guest cannot claim to be an admin
 * by sending a field.
 *
 * Admin session wins if both are somehow present. The two auth systems are
 * deliberately independent (ARCHITECTURE.md, HITL.md) and a browser can hold
 * both cookies at once; an admin acting through the admin panel is the
 * stronger claim, and it is the one whose id gets written to `cancelled_by`.
 *
 * Cancellation is immediate and requires no ApprovalVote — see
 * lib/cancellation.ts for why that does not weaken the two-admin rule.
 *
 * The decision logic lives in lib/cancellation.ts and the write in
 * lib/cancellation-service.ts; this route stays a thin adapter, same pattern
 * as every other write route in this app.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { getOptionalAdmin } from "@/lib/auth/require-admin";
import { cancelBooking } from "@/lib/cancellation-service";
import {
  GUEST_WITHDRAWAL_REASON,
  MAX_CANCELLATION_REASON,
  type CancelActor,
} from "@/lib/cancellation";

const bodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(
        MAX_CANCELLATION_REASON,
        `A cancellation reason may be at most ${MAX_CANCELLATION_REASON} characters.`,
      )
      .optional(),
  })
  // `.strict()` for the same reason PUT /bookings/:id uses it: a caller
  // sending `status` or `cancelled_by` should get a clear 400, not have the
  // field silently ignored.
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // An empty body is a legitimate cancellation with no reason given, so a
  // failed JSON parse falls through to `{}` rather than erroring.
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }

  // `getOptionalAdmin` rather than `requireAdmin`: not being an admin is not
  // an error here, it just means the guest path applies. It also collapses a
  // DEACTIVATED admin to null, which is the behaviour we want — such a caller
  // falls through to the guest rules and can still withdraw their own pending
  // request, but cannot cancel anyone else's stay.
  const admin = await getOptionalAdmin();

  let actor: CancelActor;
  let reason: string;

  if (admin !== null) {
    actor = { kind: "admin", adminId: admin.id, adminName: admin.name };
    // An admin cancelling someone else's stay must say why — this is the
    // record staff rely on in a dispute, and a blank one is worth refusing.
    if (parsed.data.reason === undefined || parsed.data.reason === "") {
      return Response.json(
        { error: "A cancellation reason is required." },
        { status: 400 },
      );
    }
    reason = parsed.data.reason;
  } else {
    const session = await auth();
    const customerId = session?.user?.id;
    if (!customerId) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }
    actor = { kind: "guest", customerId };
    // A guest withdrawing their own request is not required to explain
    // themselves; the fixed label keeps the audit entry meaningful anyway.
    reason =
      parsed.data.reason !== undefined && parsed.data.reason !== ""
        ? parsed.data.reason
        : GUEST_WITHDRAWAL_REASON;
  }

  const result = await cancelBooking({ bookingId: id, actor, reason });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    status: "cancelled",
    previousStatus: result.previousStatus,
    cancelledAt: result.cancelledAt.toISOString(),
    reason: result.reason,
  });
}
