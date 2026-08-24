/**
 * Booking request page (Slice 12).
 *
 * The server half: resolves the signed-in customer, loads the bookable items
 * and hands both to the client form. Keeping the data load here means the
 * form ships no query logic to the browser and cannot be tricked into
 * offering an item that is deactivated.
 *
 * `item` and `from` arrive as query parameters from the day-detail screen.
 * They are treated as hints only — the id is checked against the loaded
 * items, and the server re-validates the dates on submit regardless.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LinkButton } from "@/components/ui/button";
import { CardPanel, EmptyState, PageHeader, PageShell } from "@/components/ui/card";
import { getCustomerById } from "@/lib/auth/customer";
import { ADVANCE_PAYMENT_NOTICE } from "@/lib/booking";
import { currentBookingWindow, isValidDateOnly } from "@/lib/dates";
import { fetchItems } from "@/lib/items-service";
import { BookingForm, type BookableOption } from "./booking-form";

export const metadata: Metadata = {
  title: "Request a booking",
  robots: { index: false, follow: false },
};

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const session = await auth();
  const customerId = session?.user?.id;

  const params = await searchParams;
  const requestedItem = typeof params.item === "string" ? params.item : null;
  const requestedFrom = typeof params.from === "string" ? params.from : null;

  if (customerId == null) {
    // Bounce through sign-in and come back to this exact form, query intact.
    const here = new URLSearchParams();
    if (requestedItem !== null) here.set("item", requestedItem);
    if (requestedFrom !== null) here.set("from", requestedFrom);
    const query = here.toString();
    redirect(`/signin?next=${encodeURIComponent(`/book${query ? `?${query}` : ""}`)}`);
  }

  const customer = await getCustomerById(customerId);
  // Session references a customer row that no longer exists — treat as signed out.
  if (customer === null) redirect("/signin");

  const window = currentBookingWindow();
  const items = await fetchItems();

  const options: BookableOption[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    capacity: item.capacity,
  }));

  // Only honour the hint if it names an item that actually exists and is active.
  const defaultItemId =
    requestedItem !== null && options.some((o) => o.id === requestedItem)
      ? requestedItem
      : null;

  const defaultCheckIn =
    requestedFrom !== null &&
    isValidDateOnly(requestedFrom) &&
    requestedFrom >= window.from &&
    requestedFrom <= window.to
      ? requestedFrom
      : "";

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow={<Link href="/calendar" className="hover:underline">&larr; Calendar</Link>}
        title="Request a booking"
        description="Tell us the dates and who's staying. Nothing is charged here — payment is arranged directly with our team."
      />

      {options.length === 0 ? (
        <EmptyState
          title="Nothing available to book"
          description="No rooms or villa are published right now. Please check back shortly."
          action={
            <LinkButton href="/" variant="secondary" size="sm">
              Back to home
            </LinkButton>
          }
        />
      ) : (
        <CardPanel title={`Booking as ${customer.email}`}>
          <BookingForm
            items={options}
            defaultItemId={defaultItemId}
            defaultCheckIn={defaultCheckIn}
            windowFrom={window.from}
            windowTo={window.to}
            customerName={customer.name}
            customerPhone={customer.phone}
            advancePaymentNotice={ADVANCE_PAYMENT_NOTICE}
          />
        </CardPanel>
      )}
    </PageShell>
  );
}
