/**
 * Shared style tokens for the whole UI (Slice 12).
 *
 * Slices 1–11 built each page's Tailwind classes inline, which was fine for
 * three placeholder pages but does not survive 14 screens: the surface,
 * border and text colours were being retyped on every card, and a palette
 * change would have meant a find-and-replace across the app. These constants
 * are the single definition of each recurring combination.
 *
 * Kept as plain strings rather than a CSS layer or `@apply` so Tailwind's
 * static extractor still sees every class literally — a runtime-composed
 * class name would be purged from the production build.
 *
 * Colour roles (unchanged from the pages built in earlier slices, so the new
 * screens sit alongside them without a visual seam):
 *   stone   — surfaces, borders, body text
 *   teal    — the brand accent and every primary action
 *   emerald — open / approved / paid
 *   amber   — reserved / partly taken / awaiting a second vote
 *   rose    — booked-out / declined
 *   red     — errors and destructive actions
 */

/** Join class names, dropping anything falsy. Avoids a clsx dependency. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Full-height page background. Every top-level `main` uses this. */
export const PAGE_BG = "bg-stone-100 dark:bg-stone-950";

/** A raised surface sitting on PAGE_BG — cards, panels, table bodies. */
export const SURFACE = "bg-white dark:bg-stone-900";

/** The border that separates SURFACE from PAGE_BG. */
export const BORDER = "border-stone-300 dark:border-stone-800";

/** Primary heading text. */
export const TEXT_HEADING = "text-stone-900 dark:text-stone-50";

/** Body copy. */
export const TEXT_BODY = "text-stone-600 dark:text-stone-400";

/** De-emphasised text — captions, hints, timestamps. */
export const TEXT_MUTED = "text-stone-500 dark:text-stone-500";

/** The brand accent, for links and eyebrow labels. */
export const TEXT_ACCENT = "text-teal-800 dark:text-teal-500";

/**
 * Focus ring used by every interactive element.
 *
 * `focus-visible` rather than `focus` so a mouse click does not leave a ring
 * behind, while keyboard navigation still shows clearly where it is — the
 * whole admin panel has to be operable without a mouse.
 */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

/** Standard card: surface + border + rounding. */
export const CARD = cx("rounded-md border", BORDER, SURFACE);

/** The eyebrow label above a page title. */
export const EYEBROW = cx(
  "text-xs font-medium uppercase tracking-[0.18em]",
  TEXT_ACCENT,
);
