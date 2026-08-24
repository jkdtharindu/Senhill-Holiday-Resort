/**
 * Reduce a caller-supplied post-sign-in destination to a safe same-origin
 * path (Slice 12).
 *
 * The `?next=` parameter exists so the day-detail, booking and my-bookings
 * screens can send a guest to sign in and get them back where they were.
 * Without this check it is an open redirect: `?next=https://evil.example`
 * would bounce a guest straight off our domain at the exact moment they have
 * just authenticated — the moment a convincing fake page is most valuable to
 * whoever sent them the link.
 *
 * Kept as its own module rather than a helper inside the sign-in page so it
 * can be unit tested. A security check that only runs in a page is a security
 * check nobody can prove works.
 */

/** Where to send someone when the requested destination is not trustworthy. */
const FALLBACK = "/";

/** Control characters and DEL — never legitimate in a path we generated. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return FALLBACK;

  // Must be a path, not an absolute URL. Rules out `https://…`,
  // `javascript:…` and any other scheme in one check.
  if (!raw.startsWith("/")) return FALLBACK;

  // `//host` and `/\host` both look like local paths but browsers resolve
  // them as protocol-relative URLs to a DIFFERENT host. Backslash included
  // because browsers normalise it to a forward slash here.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return FALLBACK;

  // A newline can be used to split a Location header into two.
  if (CONTROL_CHARS.test(raw)) return FALLBACK;

  return raw;
}
