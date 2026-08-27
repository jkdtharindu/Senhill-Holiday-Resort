/**
 * Guest-facing contact page.
 *
 * Static content plus a Google Maps embed — no API key required, since this
 * uses the plain `/maps?...&output=embed` iframe form rather than the
 * JavaScript Maps SDK. `CONTACT_INFO` (lib/contact-info.ts) is the single
 * source of truth shared with the email templates' footer, so the phone
 * number and address can never drift between the two surfaces.
 *
 * The route-accuracy notice exists because turn-by-turn directions to a
 * resort access road are exactly the kind of detail consumer map data gets
 * wrong or stale — a guest trusting the map's last-mile routing over a
 * phone call to the property is the specific failure this guards against.
 */

import { Alert } from "@/components/ui/alert";
import { CardPanel, PageHeader, PageShell } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { cx, TEXT_BODY, TEXT_HEADING } from "@/components/ui/styles";
import { CONTACT_INFO, WHATSAPP_DEFAULT_MESSAGE, whatsappLink } from "@/lib/contact-info";

export const metadata = {
  title: "Contact — Senhill Holiday Resort",
};

export default function ContactPage() {
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(CONTACT_INFO.mapQuery)}&output=embed`;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Get in touch"
        title="Contact us"
        description="Have a question before you book, or need to reach us about an existing stay? Call, email, or find us on the map below."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CardPanel title="Phone">
          <ul className="flex flex-col gap-3">
            {CONTACT_INFO.phones.map((phone) => (
              <li key={phone} className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className={cx("text-sm font-medium underline-offset-2 hover:underline", TEXT_HEADING)}
                >
                  {phone}
                </a>
                <LinkButton
                  href={whatsappLink(phone, WHATSAPP_DEFAULT_MESSAGE)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="secondary"
                  size="sm"
                >
                  WhatsApp
                </LinkButton>
              </li>
            ))}
          </ul>
        </CardPanel>

        <CardPanel title="Email">
          <ul className="flex flex-col gap-1">
            {CONTACT_INFO.emails.map((email) => (
              <li key={email}>
                <a
                  href={`mailto:${email}`}
                  className={cx("text-sm font-medium underline-offset-2 hover:underline", TEXT_HEADING)}
                >
                  {email}
                </a>
              </li>
            ))}
          </ul>
        </CardPanel>
      </div>

      <CardPanel title="Location">
        <p className={cx("mb-3 text-sm leading-relaxed", TEXT_BODY)}>{CONTACT_INFO.address}</p>

        <Alert tone="warning" title="Please call ahead to confirm your route">
          Map directions to the property can be inaccurate or outdated on the final
          approach roads. Before you set off, call us on{" "}
          <a href={`tel:${CONTACT_INFO.phones[0].replace(/\s+/g, "")}`} className="font-medium underline">
            {CONTACT_INFO.phones[0]}
          </a>{" "}
          and we&apos;ll guide you in — this avoids the map sending you down the wrong
          road near arrival.
        </Alert>

        <div className="mt-4 overflow-hidden rounded-md border border-stone-300 dark:border-stone-800">
          <iframe
            title="Map to Senhill Holiday Resort"
            src={mapSrc}
            width="100%"
            height="360"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </CardPanel>
    </PageShell>
  );
}
