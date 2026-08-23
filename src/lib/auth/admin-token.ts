/**
 * Admin session tokens — signing and verification.
 *
 * Deliberately free of any Next.js import. Cookie handling lives next door in
 * `admin-session.ts`; keeping the cryptography separate means it can be tested
 * directly, and the security-critical half of this system has no framework
 * coupling to reason around.
 *
 * SEPARATION FROM CUSTOMER AUTH
 * -----------------------------
 * Entirely independent from the NextAuth/Google sign-in customers use:
 * different secret, different cookie, no shared tables, no shared code. A
 * customer session — even a stolen or forged one — carries nothing this module
 * accepts, because verification demands a signature from ADMIN_JWT_SECRET,
 * which the customer system never holds.
 *
 * Changing anything here is HITL-gated (docs/HITL.md): a mistake that lets a
 * Google-authenticated customer obtain an admin session defeats the entire
 * two-admin approval mechanism.
 */

import { SignJWT, jwtVerify } from "jose";

/**
 * How long an admin stays signed in.
 *
 * Eight hours covers a working day without a re-login mid-shift, and expires
 * overnight so a session left open on a shared or lost device does not stay
 * valid indefinitely.
 */
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;

/** Marks tokens as ours, so one minted for anything else is rejected. */
const JWT_ISSUER = "senhill:admin";
const JWT_AUDIENCE = "senhill:admin-panel";

export type AdminRole = "admin" | "super_admin";

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
}

function secretKey(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_JWT_SECRET is not set. Admin sign-in cannot work without it. See .env.example.",
    );
  }
  if (secret === process.env.NEXTAUTH_SECRET) {
    // One shared secret would mean a token minted by the customer system
    // verifies here. The two must stay cryptographically unrelated for the
    // separation to be real rather than nominal.
    throw new Error(
      "ADMIN_JWT_SECRET must not be the same value as NEXTAUTH_SECRET. The admin and " +
        "customer auth systems are deliberately independent — sharing a secret would " +
        "let a customer session be accepted as an admin one.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminToken(session: AdminSession): Promise<string> {
  return new SignJWT({
    email: session.email,
    name: session.name,
    role: session.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.adminId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Verify a token and return the session, or null.
 *
 * Null for every failure mode — expired, tampered, wrong issuer, malformed —
 * because callers treat them identically: no session. Distinguishing them in a
 * response would only tell an attacker which part of their forgery to fix.
 */
export async function verifyAdminToken(
  token: string,
): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"], // pinned, so a token claiming alg:none is refused
    });

    const { sub, email, name, role } = payload as {
      sub?: string;
      email?: unknown;
      name?: unknown;
      role?: unknown;
    };

    if (
      typeof sub !== "string" ||
      typeof email !== "string" ||
      typeof name !== "string" ||
      (role !== "admin" && role !== "super_admin")
    ) {
      return null;
    }

    return { adminId: sub, email, name, role };
  } catch {
    return null;
  }
}
