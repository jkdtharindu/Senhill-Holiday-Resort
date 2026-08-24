/**
 * PUT /api/bookings/:id — admin, comprehensive booking update (Slice 10,
 * docs/API_DOCUMENTATION.md).
 *
 * Updates guest_name, phone (compulsory), email, payment_stage,
 * advance_amount, advance_paid_date, internal_notes. Deliberately excludes
 * `status` — status only changes via /vote or an explicit cancel endpoint,
 * never through this route, so an admin cannot sidestep the two-admin
 * approval process by PUTing a new status here.
 *
 * Every changed field is logged to booking_audit_log in the same
 * transaction as the update (lib/booking-update-service.ts) — this route
 * stays a thin HTTP adapter, same pattern as every other write route.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { updateBooking } from "@/lib/booking-update-service";

const bodySchema = z
  .object({
    guestName: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    paymentStage: z
      .enum(["unpaid", "advance_paid", "fully_paid", "refunded"])
      .optional(),
    advanceAmount: z.string().nullable().optional(),
    advancePaidDate: z.string().nullable().optional(),
    internalNotes: z.string().optional(),
  })
  .strict();

export async function PUT(
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
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }

  const result = await updateBooking({
    bookingId: id,
    adminId: auth.admin.id,
    adminName: auth.admin.name,
    patch: parsed.data,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ changedFields: result.changedFields });
}
