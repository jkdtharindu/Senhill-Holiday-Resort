/**
 * PATCH /api/admin/admins/[id] — activate or deactivate an admin (super admin only)
 *
 * Deactivation rather than deletion. Every ApprovalVote and audit-log entry
 * points at an admin row, and those records exist specifically so it is always
 * possible to say who approved what. Deleting the row would either orphan that
 * history or cascade it away — both of which quietly destroy the accountability
 * the approval system is built on.
 */

import type { NextRequest } from "next/server";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/auth/require-admin";

/**
 * Both fields optional, but at least one required.
 *
 * `name` is editable because it is stamped onto every ApprovalVote and
 * audit-log entry — a wrong name there quietly corrupts the record of who
 * approved what, which is the whole reason those tables exist.
 *
 * There is deliberately no `password` field. A super admin cannot set another
 * admin's password; only its owner can, through /api/admin/me/password. And no
 * `role` field: promotion to super_admin is HITL-gated (docs/HITL.md).
 */
const patchSchema = z
  .object({
    active: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.active !== undefined || v.name !== undefined, {
    message: "Provide `active`, `name`, or both.",
  });

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/admins/[id]">,
): Promise<Response> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "Not a valid admin id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Provide `active` as true or false, a non-empty `name`, or both." },
      { status: 400 },
    );
  }
  const { active, name } = parsed.data;

  const [target] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);

  if (!target) {
    return Response.json({ error: "No such admin." }, { status: 404 });
  }

  // Locking yourself out is easy to do by accident and awkward to undo — it
  // needs another super admin, and there may not be one.
  if (target.id === auth.admin.id && active === false) {
    return Response.json(
      {
        error:
          "You cannot deactivate your own account. Ask another super admin to do it.",
      },
      { status: 409 },
    );
  }

  // Without at least one active super admin nobody can create admins, restore
  // accounts, or manage the team again — the system would need direct database
  // access to recover.
  // `active === false` rather than `!active`: with `active` optional, `!active`
  // is also true when the field is absent, which would fire this guard on a
  // rename that changes no permissions at all.
  if (target.role === "super_admin" && active === false) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(adminUsers)
      .where(
        and(
          eq(adminUsers.role, "super_admin"),
          eq(adminUsers.active, true),
          ne(adminUsers.id, target.id),
        ),
      );

    if (n === 0) {
      return Response.json(
        {
          error:
            "This is the only active super admin. Deactivating it would leave nobody " +
            "able to manage admin accounts. Create another super admin first.",
        },
        { status: 409 },
      );
    }
  }

  // Build the patch from only the fields actually supplied, so a rename never
  // silently rewrites `active` and vice versa.
  const changes: { active?: boolean; name?: string } = {};
  if (active !== undefined && active !== target.active) changes.active = active;
  if (name !== undefined && name !== target.name) changes.name = name;

  if (Object.keys(changes).length === 0) {
    return Response.json({ admin: target }); // already in the requested state
  }

  const [updated] = await db
    .update(adminUsers)
    .set(changes)
    .where(eq(adminUsers.id, id))
    .returning({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
    });

  return Response.json({ admin: updated });
}
