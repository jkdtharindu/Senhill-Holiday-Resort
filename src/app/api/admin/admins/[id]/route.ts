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

const patchSchema = z.object({ active: z.boolean() });

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
      { error: "Provide `active` as true or false." },
      { status: 400 },
    );
  }
  const { active } = parsed.data;

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
  if (target.id === auth.admin.id && !active) {
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
  if (target.role === "super_admin" && !active) {
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

  if (target.active === active) {
    return Response.json({ admin: target }); // already in the requested state
  }

  const [updated] = await db
    .update(adminUsers)
    .set({ active })
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
