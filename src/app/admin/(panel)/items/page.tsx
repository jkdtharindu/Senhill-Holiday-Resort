/**
 * Rooms & villa manager (Slice 12).
 *
 * Shows inactive items too — an admin managing inventory needs to see what
 * they have hidden in order to bring it back, which is exactly the opposite
 * of the guest listing's requirement.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { CardPanel, EmptyState, PageHeader, PageShell } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/require-admin";
import { MAX_IMAGES_PER_ITEM } from "@/lib/images";
import { fetchItems } from "@/lib/items-service";
import { ItemEditor } from "./item-editor";

export const metadata: Metadata = {
  title: "Rooms & villa",
  robots: { index: false, follow: false },
};

export default async function AdminItemsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  const items = await fetchItems({ includeInactive: true });
  const rooms = items.filter((i) => i.kind === "room");
  const villas = items.filter((i) => i.kind === "villa");

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Admin"
        title="Rooms & villa"
        description="Names, descriptions, capacity, notes and photos. Hiding an item removes it from the guest site without deleting its bookings."
      />

      {items.length === 0 ? (
        <EmptyState
          title="No rooms or villa yet"
          description="Nothing has been created. Run the seed script, or add items through the API."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {[
            { heading: "Individual rooms", list: rooms },
            { heading: "The villa", list: villas },
          ]
            .filter((group) => group.list.length > 0)
            .map((group) => (
              <section key={group.heading} className="flex flex-col gap-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  {group.heading}
                </h2>

                {group.list.map((item) => (
                  <CardPanel
                    key={item.id}
                    title={item.name}
                    description={`Sleeps ${item.capacity} · ${item.photos.length} photo${item.photos.length === 1 ? "" : "s"}`}
                    actions={
                      item.active ? (
                        <Badge tone="open">Visible to guests</Badge>
                      ) : (
                        <Badge tone="neutral">Hidden</Badge>
                      )
                    }
                  >
                    <ItemEditor item={item} maxPhotos={MAX_IMAGES_PER_ITEM} />
                  </CardPanel>
                ))}
              </section>
            ))}
        </div>
      )}
    </PageShell>
  );
}
