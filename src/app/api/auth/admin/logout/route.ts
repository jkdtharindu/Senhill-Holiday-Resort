/**
 * POST /api/auth/admin/logout
 *
 * POST rather than GET on purpose: a GET would let another site sign an admin
 * out by embedding an image tag pointing here, and browsers pre-fetching links
 * could trigger it accidentally.
 */

import { clearAdminSessionCookie } from "@/lib/auth/admin-session";

export async function POST(): Promise<Response> {
  await clearAdminSessionCookie();
  return Response.json({ ok: true });
}
