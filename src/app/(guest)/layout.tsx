/**
 * Shell for every guest-facing page (Slice 12).
 *
 * A route group — `(guest)` adds no URL segment, so the home page stays at
 * `/` and the calendar at `/calendar`. Its only job is to resolve the signed-in
 * customer once and render the header, so no individual page has to remember
 * to include navigation.
 *
 * `auth()` reads cookies, which opts every page beneath this layout into
 * dynamic rendering. That is correct here rather than incidental: each of
 * these screens shows live availability, and a statically cached version would
 * show whatever the database held at deploy time.
 */

import { auth } from "@/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { getCustomerById } from "@/lib/auth/customer";

export default async function GuestLayout({
  children,
}: LayoutProps<"/">) {
  const session = await auth();
  const customer = session?.user?.id
    ? await getCustomerById(session.user.id)
    : null;

  return (
    <>
      <SiteHeader
        customer={
          customer !== null
            ? { name: customer.name, email: customer.email }
            : null
        }
      />
      {children}
    </>
  );
}
