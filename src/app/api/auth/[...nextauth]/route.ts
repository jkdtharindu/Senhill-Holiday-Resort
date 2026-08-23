/**
 * Auth.js endpoints for guest Google sign-in.
 *
 * This catch-all sits alongside the hand-written admin routes at
 * /api/auth/admin/*. Next.js matches a static segment ahead of a catch-all, so
 * /api/auth/admin/login still reaches the admin handler and only the Auth.js
 * paths (/api/auth/signin, /api/auth/callback/google, /api/auth/session, ...)
 * fall through to here. The two systems share a URL prefix and nothing else.
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
