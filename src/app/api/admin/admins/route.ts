/**
 * GET  /api/admin/admins  — list admin accounts (any admin)
 * POST /api/admin/admins  — create an admin account (super admin only)
 */

import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/require-admin";

/**
 * Any admin can see the roster.
 *
 * Deliberately visible to all admins rather than super admins only: the
 * approval rule needs two different people, so every admin needs to know who
 * else can vote. Password hashes are never selected.
 */
export async function GET(): Promise<Response> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admins = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt));

  return Response.json({ admins });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(512),
});

/**
 * Create a new admin.
 *
 * Always creates role `admin`, never `super_admin` — there is no field here to
 * request otherwise. Promoting someone to super admin is deliberately not an
 * API operation: docs/HITL.md requires explicit human confirmation every time,
 * even from an existing super admin, because privilege escalation is the one
 * mistake that cannot be walked back by the approval system itself.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide a name, a valid email address, and a password." },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;

  const weak = validatePasswordStrength(password);
  if (weak) return Response.json({ error: weak }, { status: 400 });

  const [existing] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (existing) {
    return Response.json(
      { error: "An admin with that email address already exists." },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(adminUsers)
    .values({
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "admin",
      active: true,
      createdBy: auth.admin.id,
    })
    .returning({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
      createdAt: adminUsers.createdAt,
    });

  return Response.json({ admin: created }, { status: 201 });
}
