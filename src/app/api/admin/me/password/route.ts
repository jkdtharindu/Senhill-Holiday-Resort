/**
 * POST /api/admin/me/password — change your own admin password.
 *
 * Only ever changes the password of the admin making the request. A super admin
 * cannot set someone else's password through here, which means a generated
 * starting password can be replaced by its owner with something nobody else has
 * ever seen — including whoever created the account.
 */

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/require-admin";

const schema = z.object({
  currentPassword: z.string().min(1).max(512),
  newPassword: z.string().min(1).max(512),
});

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide your current password and the new one." },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const [admin] = await db
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, auth.admin.id))
    .limit(1);

  if (!admin) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  // Re-check the current password even though they hold a valid session. A
  // session left open on an unattended machine should not be enough to lock the
  // real owner out of their own account.
  if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
    return Response.json(
      { error: "Your current password is not correct." },
      { status: 403 },
    );
  }

  const weak = validatePasswordStrength(newPassword);
  if (weak) return Response.json({ error: weak }, { status: 400 });

  if (currentPassword === newPassword) {
    return Response.json(
      { error: "The new password must be different from the current one." },
      { status: 400 },
    );
  }

  await db
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(adminUsers.id, auth.admin.id));

  // Note: sessions are stateless JWTs, so any session already issued for this
  // admin stays valid until it expires. Changing a password does not sign other
  // devices out. Logged in docs/MAINTENANCE.md rather than silently accepted.
  return Response.json({ ok: true });
}
