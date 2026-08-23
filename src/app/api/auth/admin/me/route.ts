/**
 * GET /api/auth/admin/me
 *
 * Who is signed in. The admin UI calls this on load to decide what to render.
 *
 * Goes through `requireAdmin`, so it reflects the database rather than the
 * token: an admin deactivated a minute ago gets 403 here even though their
 * cookie is still cryptographically valid.
 */

import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return Response.json({ admin: auth.admin });
}
