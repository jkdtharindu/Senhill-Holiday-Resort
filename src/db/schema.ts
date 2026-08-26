/**
 * Database schema — Senhill Holiday Resort booking system.
 *
 * Table and column names match docs/DATABASE_SCHEMA.md and the glossary in
 * docs/UBIQUITOUS_LANGUAGE.md exactly. Do not introduce synonyms here.
 *
 * Two values are deliberately NOT stored, because storing them would create a
 * second source of truth that can drift:
 *   - CalendarState (open/reserved/booked/unavailable) — derived at query time
 *   - RoomStatus (per-room open/booked) — derived at query time
 * See docs/ARCHITECTURE.md, "Why CalendarState is derived, not stored".
 */

import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ------------------------------------------------------------------ enums */

export const adminRole = pgEnum("admin_role", ["admin", "super_admin"]);
export const itemKind = pgEnum("item_kind", ["room", "villa"]);
export const dayModeKind = pgEnum("day_mode_kind", ["room_mode", "villa_mode"]);
/**
 * `cancelled` is terminal and distinct from `declined`: a decline is the
 * two-admin approval process rejecting a request that was never confirmed;
 * a cancellation undoes a booking that had already been accepted (or a
 * pending request the guest withdrew themselves). Keeping them apart matters
 * for the audit trail — "we said no" and "it was called off" are different
 * facts about the same date.
 *
 * Every date-blocking query in this app names the statuses that block by
 * allowlist (`inArray(status, [...])`), never by excluding `declined`, so a
 * cancelled booking stops holding its dates the moment its status changes.
 * That is the whole date-recovery mechanism — there is no second place to
 * update. See lib/cancellation.ts.
 */
export const bookingStatus = pgEnum("booking_status", [
  "reserved",
  "booked",
  "declined",
  "cancelled",
]);
export const paymentStage = pgEnum("payment_stage", [
  "unpaid",
  "advance_paid",
  "fully_paid",
  "refunded",
]);
export const voteKind = pgEnum("vote_kind", ["approve", "decline"]);

/* -------------------------------------------------------------- customers */

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Google's `sub` claim. Stable per-account, unlike email.
  googleId: text("google_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Google does not reliably supply a phone number, so this is collected on
  // the booking form instead of at sign-in. Null until their first booking.
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------ admin_users */

/**
 * Entirely separate from `customers`. A Google-authenticated customer must
 * never be able to reach an admin route — the two auth systems share no
 * tables, no tokens, and no code path. See docs/HITL.md.
 */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("admin"),
  // Deactivate rather than delete, so their past ApprovalVotes and audit-log
  // entries keep pointing at a real row.
  active: boolean("active").notNull().default(true),
  // Who created this admin. Null for the seeded first super_admin, who by
  // definition had nobody above them. Self-referential, so the column type has
  // to be annotated explicitly or TypeScript hits a circular inference.
  createdBy: uuid("created_by").references((): AnyPgColumn => adminUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* -------------------------------------------------- admin_login_attempts */

/**
 * Every admin sign-in attempt, successful or not.
 *
 * Serves two purposes: rate limiting, and an audit trail of who signed in and
 * from where. Rate limiting has to live in the database rather than in process
 * memory because Vercel runs many short-lived instances — an in-memory counter
 * would reset constantly and let an attacker through simply by being spread
 * across instances.
 *
 * Deliberately NOT a lockout. Counting attempts in a sliding window slows an
 * attacker down without letting them disable a real admin's account by
 * deliberately failing logins against their email. With only two or three
 * admins on this system, a lockout would be a denial-of-service handed to
 * anyone who knows an admin's email address.
 */
export const adminLoginAttempts = pgTable(
  "admin_login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stored even when no such admin exists, so probing for valid emails is
    // still counted and rate limited.
    email: text("email").notNull(),
    ipAddress: text("ip_address"),
    succeeded: boolean("succeeded").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("admin_login_attempts_email_idx").on(t.email, t.attemptedAt),
    index("admin_login_attempts_ip_idx").on(t.ipAddress, t.attemptedAt),
  ],
);

/* --------------------------------------------------------- bookable_items */

export const bookableItems = pgTable(
  "bookable_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: itemKind("kind").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // Max guests. Bookings exceeding this are rejected server-side (FR5).
    capacity: integer("capacity").notNull(),
    customNotes: text("custom_notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("bookable_items_capacity_positive", sql`${t.capacity} > 0`),
    index("bookable_items_active_kind_idx").on(t.active, t.kind, t.displayOrder),
  ],
);

export const bookableItemImages = pgTable(
  "bookable_item_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookableItemId: uuid("bookable_item_id")
      .notNull()
      .references(() => bookableItems.id, { onDelete: "cascade" }),
    // Vercel Blob URL (see docs/ARCHITECTURE.md).
    imageUrl: text("image_url").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [
    index("bookable_item_images_item_idx").on(t.bookableItemId, t.displayOrder),
  ],
);

/* -------------------------------------------------------------- day_modes */

/**
 * One row per date an admin has explicitly opened for business.
 *
 * A date with NO row here has no mode and is not bookable at all — it shows as
 * CalendarState `unavailable`. This is deliberate: an admin must actively open
 * each date rather than dates silently defaulting to room-bookable.
 * Confirmed decision — see docs/PRD.md section 9. Do not add a default.
 */
export const dayModes = pgTable(
  "day_modes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().unique(),
    mode: dayModeKind("mode").notNull(),
    setBy: uuid("set_by")
      .notNull()
      .references(() => adminUsers.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("day_modes_date_idx").on(t.date)],
);

/* --------------------------------------------------------------- bookings */

/**
 * `check_in`/`check_out` are HALF-OPEN: the stay occupies the nights from
 * check_in up to but NOT including check_out. A 10th->13th booking occupies
 * the 10th, 11th and 12th; the 13th is free for the next arrival.
 * All conflict detection must use this range — see src/lib/dates.ts.
 *
 * No `total_amount` or `balance_due`: pricing is out of scope entirely
 * (docs/PRD.md section 4). `advance_amount` and `advance_paid_date` exist only
 * as admin-side record-keeping of a payment collected manually, outside the
 * app, and are never exposed to a customer.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookableItemId: uuid("bookable_item_id")
      .notNull()
      .references(() => bookableItems.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    guestName: text("guest_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    guestsCount: integer("guests_count").notNull(),
    status: bookingStatus("status").notNull().default("reserved"),
    paymentStage: paymentStage("payment_stage").notNull().default("unpaid"),
    advanceAmount: numeric("advance_amount", { precision: 12, scale: 2 }),
    advancePaidDate: date("advance_paid_date"),
    internalNotes: text("internal_notes").notNull().default(""),
    // Cancellation record. All three are null until the booking is cancelled,
    // and are written together in one transaction (lib/cancellation-service.ts).
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // The admin who cancelled it. NULL means the guest withdrew their own
    // pending request — the absence of an admin IS the signal for who acted,
    // so this column is never backfilled with a placeholder.
    cancelledBy: uuid("cancelled_by").references(() => adminUsers.id),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("bookings_checkout_after_checkin", sql`${t.checkOut} > ${t.checkIn}`),
    check("bookings_guests_positive", sql`${t.guestsCount} > 0`),
    // A cancelled booking must carry its timestamp, and a timestamp must not
    // appear on a booking in any other status. Enforced here rather than only
    // in application code so no future write path can produce a half-recorded
    // cancellation. `cancelled_by` is deliberately NOT covered: null is
    // meaningful there (a guest withdrawal), so it cannot be required.
    //
    // `status::text` is load-bearing, not incidental. Drizzle runs every
    // pending migration inside ONE transaction, and PostgreSQL refuses to
    // evaluate an enum value added earlier in the same transaction — adding
    // this constraint to the already-populated `bookings` table triggers a
    // validation scan, which would hit exactly that rule. Comparing as text
    // never references the new enum member, so the migration applies cleanly.
    // Do not "simplify" this back to `${t.status} = 'cancelled'`.
    check(
      "bookings_cancelled_at_matches_status",
      sql`(${t.status}::text = 'cancelled') = (${t.cancelledAt} IS NOT NULL)`,
    ),
    // Overlap lookups are the hottest query in the app: every calendar render
    // and every booking attempt scans bookings by item and date range.
    index("bookings_item_dates_idx").on(t.bookableItemId, t.checkIn, t.checkOut),
    index("bookings_status_dates_idx").on(t.status, t.checkIn, t.checkOut),
    index("bookings_customer_idx").on(t.customerId, t.createdAt),
  ],
);

/* --------------------------------------------------------- approval_votes */

/**
 * Two distinct admins' `approve` votes move a booking to `booked`.
 * One `decline` moves it to `declined` immediately, with no tiebreaker.
 * The unique constraint is what stops one admin's vote counting twice —
 * re-voting overwrites their own prior vote rather than adding to the tally.
 *
 * Changing this rule is HITL-gated (docs/HITL.md): it is the core trust
 * mechanism of the whole system.
 */
export const approvalVotes = pgTable(
  "approval_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminUsers.id),
    vote: voteKind("vote").notNull(),
    votedAt: timestamp("voted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("approval_votes_one_per_admin").on(t.bookingId, t.adminId),
    index("approval_votes_booking_idx").on(t.bookingId),
  ],
);

/* --------------------------------------------------------- site_settings */

/** Single-row table holding the site-wide DefaultNotes block. */
export const siteSettings = pgTable("site_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  defaultNotes: text("default_notes").notNull().default(""),
  updatedBy: uuid("updated_by").references(() => adminUsers.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------ booking_audit_log */

/**
 * Every field change on a booking and every ApprovalVote cast lands here.
 * `changed_by_name` is denormalized on purpose so the history still reads
 * correctly after an admin is renamed or deactivated.
 *
 * Weakening these writes is HITL-gated — they exist for admin accountability.
 */
export const bookingAuditLog = pgTable(
  "booking_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    changedBy: uuid("changed_by").references(() => adminUsers.id),
    changedByName: text("changed_by_name").notNull(),
    fieldChanged: text("field_changed").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("booking_audit_log_booking_idx").on(t.bookingId, t.changedAt)],
);

/* ------------------------------------------------------------------ types */

export type Customer = typeof customers.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminLoginAttempt = typeof adminLoginAttempts.$inferSelect;
export type BookableItem = typeof bookableItems.$inferSelect;
export type BookableItemImage = typeof bookableItemImages.$inferSelect;
export type DayMode = typeof dayModes.$inferSelect;
/** `room_mode` | `villa_mode` — the two values the `day_mode_kind` enum allows. */
export type DayModeKind = (typeof dayModeKind.enumValues)[number];
export type Booking = typeof bookings.$inferSelect;
/** `reserved` | `booked` | `declined` | `cancelled` — the `booking_status` enum values. */
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
/** `unpaid` | `advance_paid` | `fully_paid` | `refunded` — the `payment_stage` enum values. */
export type PaymentStage = (typeof paymentStage.enumValues)[number];
export type ApprovalVote = typeof approvalVotes.$inferSelect;
export type SiteSettings = typeof siteSettings.$inferSelect;
export type BookingAuditLog = typeof bookingAuditLog.$inferSelect;

/** The 4 CalendarState values shown on the month view. Derived, never stored. */
export type CalendarState = "unavailable" | "open" | "reserved" | "booked";
/** Per-room detail in the day-detail view. Derived, never stored. */
export type RoomStatus = "open" | "booked";
