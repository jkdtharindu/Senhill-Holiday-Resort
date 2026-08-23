/**
 * POST /api/auth/admin/login
 *
 * Admin sign-in. Entirely separate from customer Google sign-in — this route
 * cannot authenticate a customer, and the customer flow cannot produce a
 * session this route would issue.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { createAdminToken, setAdminSessionCookie } from "@/lib/auth/admin-session";
import { fakeVerifyPassword, verifyPassword } from "@/lib/auth/password";
import {
  checkRateLimit,
  clientIpFrom,
  recordLoginAttempt,
} from "@/lib/auth/rate-limit";

const loginSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(512),
});

/**
 * One message for every failure.
 *
 * Never "no such account" or "wrong password" — the difference tells an
 * attacker which emails are real admin accounts, letting them narrow their
 * effort to addresses worth attacking.
 */
const GENERIC_FAILURE = "Email or password is incorrect.";

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Enter both an email address and a password." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;
  const ip = clientIpFrom(request.headers);

  const limit = await checkRateLimit(email, ip);
  if (!limit.allowed) {
    return Response.json(
      {
        error:
          "Too many sign-in attempts. Wait a few minutes and try again — this " +
          "clears on its own, your account is not locked.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const [admin] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
      passwordHash: adminUsers.passwordHash,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  // Spend the same time hashing whether or not the account exists, so response
  // timing does not reveal which admin emails are real.
  const passwordMatches = admin
    ? await verifyPassword(password, admin.passwordHash)
    : await fakeVerifyPassword(password);

  if (!admin || !passwordMatches) {
    await recordLoginAttempt(email, ip, false);
    return Response.json({ error: GENERIC_FAILURE }, { status: 401 });
  }

  if (!admin.active) {
    // Counted as a failure so a deactivated account cannot be used as an
    // unlimited oracle for testing passwords.
    await recordLoginAttempt(email, ip, false);
    return Response.json(
      {
        error:
          "This admin account has been deactivated. Ask a super admin to restore it.",
      },
      { status: 403 },
    );
  }

  const token = await createAdminToken({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });
  await setAdminSessionCookie(token);

  // Recording the success is also what resets this email's failure counter —
  // the limiter counts only failures since the last success, so nothing needs
  // deleting and the attempt history stays intact for auditing.
  await recordLoginAttempt(email, ip, true);

  // No token in the body — it is set as an httpOnly cookie, unreadable by page
  // JavaScript. Returning it here would undo that protection.
  return Response.json({
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  });
}
