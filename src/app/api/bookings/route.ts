/**
 * POST /api/bookings — customer, login required (FR5).
 *
 * Submit a booking request for a check_in-checkOut range on one BookableItem.
 * Rejected (400) outright — never clamped — if any night in the range fails
 * one of three checks (FR5a): no DayMode set, a DayMode that doesn't match
 * the requested item's kind, or an existing reserved/booked conflict on that
 * item. The response names every conflicting night, not just the first.
 *
 * `guest_name`, `phone` and `guests_count` come from the request body — a
 * signed-in guest may be booking on someone else's behalf, or under a name
 * that differs from their Google account name. `email` is deliberately taken
 * from the customer's own session record, never the body: it is how staff
 * reach the account holder, and letting the body override it would let a
 * booking's contact email diverge from who actually owns the account.
 *
 * The actual fetch-validate-write cycle lives in lib/booking-service.ts,
 * built on the pure lib/booking.ts — this route stays a thin adapter, same
 * pattern as every other write route in this app.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { getCustomerById } from "@/lib/auth/customer";
import { currentBookingWindow, isValidDateOnly } from "@/lib/dates";
import { ADVANCE_PAYMENT_NOTICE } from "@/lib/booking";
import { createBooking } from "@/lib/booking-service";

const bodySchema = z.object({
  bookable_item_id: z.string().uuid("`bookable_item_id` must be a valid id."),
  check_in: z.string().refine(isValidDateOnly, "`check_in` must be a valid date."),
  check_out: z.string().refine(isValidDateOnly, "`check_out` must be a valid date."),
  guest_name: z.string().trim().min(1, "`guest_name` is required."),
  phone: z.string().trim().min(1, "`phone` is required."),
  guests_count: z.number().int().positive("`guests_count` must be a positive integer."),
});

export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth();
  const customerId = session?.user?.id;
  if (!customerId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

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

  const customer = await getCustomerById(customerId);
  if (!customer) {
    // The token references a customer row that no longer exists.
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const result = await createBooking(
    {
      bookableItemId: parsed.data.bookable_item_id,
      customerId: customer.id,
      guestName: parsed.data.guest_name,
      phone: parsed.data.phone,
      email: customer.email,
      checkIn: parsed.data.check_in,
      checkOut: parsed.data.check_out,
      guestsCount: parsed.data.guests_count,
    },
    currentBookingWindow(),
  );

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        ...(result.conflictingDates ? { conflicting_dates: result.conflictingDates } : {}),
      },
      { status: 400 },
    );
  }

  return Response.json(
    {
      booking: {
        id: result.booking.id,
        bookableItemId: result.booking.bookableItemId,
        checkIn: result.booking.checkIn,
        checkOut: result.booking.checkOut,
        guestsCount: result.booking.guestsCount,
        status: result.booking.status,
      },
      advancePaymentNotice: ADVANCE_PAYMENT_NOTICE,
    },
    { status: 201 },
  );
}
