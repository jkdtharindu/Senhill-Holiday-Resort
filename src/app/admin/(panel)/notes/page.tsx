/**
 * Notes editor (Slice 12).
 *
 * Two levels of notes exist, and the distinction matters: DefaultNotes are
 * site-wide and shown on every booking, while each room's CustomNotes cover
 * only that room. Both are edited from here so an admin can see them
 * together, but the per-room text is edited on the items screen where the
 * rest of that room's content lives — duplicating the editor here would give
 * two places to change one field.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CardPanel, PageHeader, PageShell } from "@/components/ui/card";
import { BORDER, cx, TEXT_BODY, TEXT_HEADING, TEXT_MUTED } from "@/components/ui/styles";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fetchItems } from "@/lib/items-service";
import { NotesEditor } from "./notes-editor";

export const metadata: Metadata = {
  title: "Notes",
  robots: { index: false, follow: false },
};

export default async function AdminNotesPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  const [[settings], items] = await Promise.all([
    db.select({ defaultNotes: siteSettings.defaultNotes }).from(siteSettings).limit(1),
    fetchItems({ includeInactive: true }),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Booking notes"
        description="What guests are told when they book. The site-wide notes apply to every booking; each room can add its own on top."
      />

      <CardPanel
        title="Site-wide notes (DefaultNotes)"
        description="Check-in and check-out times, house rules — anything true for every stay."
      >
        <NotesEditor initialNotes={settings?.defaultNotes ?? ""} />
      </CardPanel>

      <CardPanel
        title="Per-room notes (CustomNotes)"
        description="Edited on each room's own card, where the rest of its content lives."
      >
        <ul className="flex flex-col">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={cx("flex flex-col gap-1 py-3", i > 0 && "border-t", i > 0 && BORDER)}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href="/admin/items"
                  className={cx(
                    "text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                    TEXT_HEADING,
                  )}
                >
                  {item.name}
                </Link>
                {!item.active && (
                  <span className={cx("text-xs", TEXT_MUTED)}>hidden from guests</span>
                )}
              </div>
              <p className={cx("text-sm leading-relaxed", TEXT_BODY)}>
                {item.customNotes.trim() === "" ? (
                  <span className={TEXT_MUTED}>No custom notes for this one.</span>
                ) : (
                  item.customNotes
                )}
              </p>
            </li>
          ))}
        </ul>
      </CardPanel>
    </PageShell>
  );
}
