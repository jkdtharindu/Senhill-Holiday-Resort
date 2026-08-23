/**
 * Route guards for admin endpoints.
 *
 * Every admin route must call one of these. Hiding a button in the UI is not
 * access control — the API has to refuse the request on its own, because
 * anyone can call it directly with curl.
 *
 * These deliberately re-read the admin from the database rather than trusting
 * the token's claims. A token stays cryptographically valid until it expires,
 * so a super admin who deactivates someone would otherwise be ignored for up to
 * eight hours — and a role stored in a token cannot be revoked at all. The
 * database is the authority on who exists, who is active, and what role they
 * hold; the token only says who is claiming to be whom.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { getAdminSession, type AdminRole } from "./admin-session";

export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

export type AuthFailure = { ok: false; response: Response };
export type AuthSuccess = { ok: true; admin: AuthenticatedAdmin };
export type AuthResult = AuthSuccess | AuthFailure;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Require any signed-in, active admin.
 *
 * Usage in a route handler:
 *
 *   const auth = await requireAdmin();
 *   if (!auth.ok) return auth.response;
 *   // auth.admin is now safe to use
 */
export async function requireAdmin(): Promise<AuthResult> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, response: jsonError("Not signed in.", 401) };
  }

  const [admin] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.adminId))
    .limit(1);

  if (!admin) {
    // Token references an admin row that no longer exists.
    return { ok: false, response: jsonError("Not signed in.", 401) };
  }

  if (!admin.active) {
    return {
      ok: false,
      response: jsonError(
        "This admin account has been deactivated. Ask a super admin to restore it.",
        403,
      ),
    };
  }

  return {
    ok: true,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  };
}

/**
 * Require a signed-in, active super admin.
 *
 * Note the role comes from the freshly-read database row, not the token, so
 * demoting someone takes effect on their very next request.
 */
export async function requireSuperAdmin(): Promise<AuthResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (auth.admin.role !== "super_admin") {
    return {
      ok: false,
      response: jsonError(
        "This action requires a super admin account.",
        403,
      ),
    };
  }

  return auth;
}
