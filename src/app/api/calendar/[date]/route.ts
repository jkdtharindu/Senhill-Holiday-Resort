/**
 * GET /api/calendar/:date — day-detail view (FR3/FR15).
 *
 * Login required for everyone — there is no logged-out response at all, per
 * PRD §9 ("Day-detail view for a logged-out visitor is not available").
 * Serves two different shapes from the same URL depending on who is asking:
 *
 *   - Admin session present → full detail: guest identity, payment stage,
 *     approval votes per booking. Not restricted by the BookingWindow, since
 *     admins configure DayMode further out than customers can book (§9a).
 *   - No admin session, but a customer session is → RoomStatus only, no
 *     guest identity. Rejected (400) if the date falls outside the 90-day
 *     BookingWindow.
 *   - Neither → 401.
 *
 * A date with no DayMode set is NOT an error for either caller — the
 * response carries `unavailable: true` so the frontend can render "not open
 * for booking yet" rather than treating a gap as a failure.
 *
 * The fetch-derive logic lives in lib/day-detail-service.ts, built on the
 * pure lib/day-detail.ts — this route stays a thin adapter, same pattern as
 * every other calendar route in this app.
 */

import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { getOptionalAdmin } from "@/lib/auth/require-admin";
import { isValidDateOnly, isWithinBookingWindow, type DateOnly } from "@/lib/dates";
import { fetchDayDetail, fetchDayDetailAdmin } from "@/lib/day-detail-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { date } = await params;

  if (!isValidDateOnly(date)) {
    return Response.json(
      { error: "The date in the URL must be a valid calendar date, formatted YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const admin = await getOptionalAdmin();
  if (admin) {
    const detail = await fetchDayDetailAdmin(date as DateOnly);
    return Response.json({ role: "admin", ...detail });
  }

  const session = await auth();
  const customerId = session?.user?.id;
  if (!customerId) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!isWithinBookingWindow(date as DateOnly)) {
    return Response.json(
      { error: "This date is outside the bookable window." },
      { status: 400 },
    );
  }

  const detail = await fetchDayDetail(date as DateOnly);
  return Response.json({ role: "customer", ...detail });
}
