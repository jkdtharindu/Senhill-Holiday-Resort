/**
 * Admin session cookie handling.
 *
 * The token itself is signed and verified in `admin-token.ts`, which has no
 * framework dependency. This module only moves that token in and out of a
 * cookie, and so can run exclusively inside the Next.js request lifecycle.
 *
 * WHY A COOKIE, NOT localStorage
 * ------------------------------
 * The cookie is httpOnly, so page JavaScript cannot read it and an XSS bug
 * cannot exfiltrate it. sameSite=lax stops another site making authenticated
 * requests on a signed-in admin's behalf.
 */

import { cookies } from "next/headers";

import {
  SESSION_DURATION_SECONDS,
  verifyAdminToken,
  type AdminSession,
} from "./admin-token";

export const ADMIN_COOKIE_NAME = "senhill_admin_session";

export {
  createAdminToken,
  verifyAdminToken,
  type AdminRole,
  type AdminSession,
} from "./admin-token";

export async function setAdminSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    // HTTPS-only in production. Left off locally because dev runs on plain
    // http://localhost, where a secure cookie would never be stored at all.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
}

/**
 * The current admin session, or null if not signed in.
 *
 * Reads the token only. It does NOT confirm the admin still exists or is still
 * active — for that use `requireAdmin`, which checks the database. The
 * distinction matters: a deactivated admin's token stays cryptographically
 * valid until it expires, so anything that grants access must verify against
 * the database rather than trusting the token alone.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAdminToken(token);
}
