/**
 * Guest-initiated "Contact hotel via WhatsApp" — one button per
 * CONTACT_INFO.phones number, same click-to-chat pattern as the /contact
 * page's WhatsApp buttons (owner decision: both property numbers, guest
 * picks). No "use client" needed — no hooks or fetch here, just static
 * wa.me links via the server-safe LinkButton.
 */

import { LinkButton } from "@/components/ui/button";
import { CONTACT_INFO, whatsappLink } from "@/lib/contact-info";
import type { DateOnly } from "@/lib/dates";
import { guestContactMessage } from "@/lib/whatsapp-templates";

interface WhatsAppContactButtonProps {
  guestName: string;
  itemName: string;
  checkIn: DateOnly;
  checkOut: DateOnly;
}

export function WhatsAppContactButton({
  guestName,
  itemName,
  checkIn,
  checkOut,
}: WhatsAppContactButtonProps) {
  const message = guestContactMessage({ guestName, itemName, checkIn, checkOut });
  return (
    <div className="flex flex-wrap gap-2">
      {CONTACT_INFO.phones.map((phone) => (
        <LinkButton
          key={phone}
          href={whatsappLink(phone, message)}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          size="sm"
        >
          WhatsApp ({phone})
        </LinkButton>
      ))}
    </div>
  );
}
