# Database Schema

PostgreSQL. Table/column names use the exact terms from `UBIQUITOUS_LANGUAGE.md`.

## `customers`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| google_id | text | unique, from Google's `sub` claim |
| name | text | |
| email | text | unique |
| phone | text | collected on first booking (not guaranteed by Google) |
| created_at | timestamptz | |

## `admin_users`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| email | text | unique |
| password_hash | text | bcrypt |
| role | text | `admin` \| `super_admin` |
| active | boolean | super_admin can deactivate instead of deleting |
| created_by | uuid | FK → admin_users, nullable (first super_admin is seeded) |
| created_at | timestamptz | |

## `admin_login_attempts`
Added at Slice 2, alongside admin auth — not in the original schema draft. Backs the rate
limiter (`src/lib/auth/rate-limit.ts`): every sign-in attempt, successful or not, is recorded
here, keyed by email and by IP. Deliberately **not** a lockout table — see `MAINTENANCE.md` §4
for why a hard lockout on a 2–3 person admin team is a worse risk than a sliding window.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| email | text | recorded even for a non-existent account, so probing counts too |
| ip_address | text | nullable; best-effort, from `x-forwarded-for` |
| succeeded | boolean | |
| attempted_at | timestamptz | |

No FK to `admin_users` — a failed attempt against an email with no matching account must still be
recorded to be counted against. Rows are never deleted programmatically; `pruneOldAttempts()`
exists in `rate-limit.ts` but nothing schedules it yet (`MAINTENANCE.md` §4).

## `bookable_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| kind | text | `room` \| `villa` |
| name | text | |
| description | text | |
| capacity | integer | max guest count; bookings over this are rejected server-side |
| custom_notes | text | item-specific notes, admin-editable |
| active | boolean | soft-disable |
| display_order | integer | |
| created_at | timestamptz | |

## `bookable_item_images`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| bookable_item_id | uuid | FK → bookable_items |
| image_url | text | Vercel Blob URL |
| display_order | integer | |

## `day_modes`
One row per calendar date that's been explicitly configured. **A date with no row has no
default mode — it is not bookable at all** (confirmed via Grill Me, see PRD.md §9). This is a
deliberate choice, not a placeholder to revisit.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| date | date | unique |
| mode | text | `room_mode` \| `villa_mode` |
| set_by | uuid | FK → admin_users |
| updated_at | timestamptz | |

**DayModeSwitchBlock (application-level rule, not a DB constraint):** before updating a
`day_modes.mode` value, the API must check whether any `bookings` row exists for that date with
`status IN ('reserved','booked')` under the *current* mode. If so, reject the update (409) —
see `PRD.md` FR11b.

**BulkDayModeAssignment:** no separate table needed — this is an API-layer operation
(`PUT /calendar/day-mode` accepting multiple dates or a pattern, see `API_DOCUMENTATION.md`)
that writes/updates multiple `day_modes` rows in one transaction. Each row still gets its own
`set_by`/`updated_at`, so per-date attribution isn't lost even when set in bulk.

**BookingWindow** is not stored — it's computed at query time as `today` through `today + 90
days` wherever customer-facing calendar/booking endpoints are involved. Admin endpoints are not
constrained by it.

*(No `quotations`/pricing table — pricing is out of scope this version. See `PRD.md` §4 and
`UBIQUITOUS_LANGUAGE.md`. If reintroduced later, design it as its own addition, not a silent
field add.)*

## `bookings`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| bookable_item_id | uuid | FK → bookable_items |
| customer_id | uuid | FK → customers |
| guest_name | text | |
| phone | text | compulsory |
| email | text | |
| check_in | date | |
| check_out | date | |
| guests_count | integer | |
| status | text | `reserved` \| `booked` \| `declined` \| `cancelled` — see UBIQUITOUS_LANGUAGE.md |
| payment_stage | text | `unpaid` \| `advance_paid` \| `fully_paid` \| `refunded` |
| advance_amount | numeric | |
| advance_paid_date | date | |
| internal_notes | text | admin-only |
| cancelled_at | timestamptz | null until cancelled; check constraint ties it to `status = 'cancelled'` |
| cancelled_by | uuid | FK → admin_users, nullable; NULL means the guest withdrew their own `reserved` booking |
| cancellation_reason | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Date semantics (confirmed — do not reinterpret):**
- `check_in`/`check_out` follow the hotel standard: the stay occupies the nights from `check_in`
  up to **but not including** `check_out`. A 10th→13th booking occupies the 10th, 11th and 12th;
  the 13th is free for the next guest to check in. All conflict detection, `RoomStatus`, and
  `CalendarState` derivation must use this half-open range — an off-by-one here creates either
  phantom conflicts or real double-bookings.
- `check_out` must be strictly after `check_in` (no zero-night bookings).

**Timezone (confirmed — do not use server-local or UTC):** every date boundary in this system —
"today" for the BookingWindow, the current date for calendar queries, and any `date` column
comparison — is computed in **`Asia/Colombo` (UTC+5:30)**. Vercel's runtime is UTC, which is
5.5 hours behind; a naive `new Date()` would roll the date over at 05:30 local time and shift
both the 90-day window and every calendar colour by a day for part of each night. Store
`timestamptz` as usual, but resolve "what date is it" through an explicit Colombo-zoned helper
used everywhere — never ad-hoc per call site.

## `approval_votes`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| booking_id | uuid | FK → bookings |
| admin_id | uuid | FK → admin_users |
| vote | text | `approve` \| `decline` |
| voted_at | timestamptz | |
| | | unique constraint on (booking_id, admin_id) — one vote per admin per booking |

## `site_settings`
Single-row table for the global DefaultNotes block.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, single row |
| default_notes | text | site-wide booking terms, admin-editable |
| updated_by | uuid | FK → admin_users |
| updated_at | timestamptz | |

## `booking_audit_log`
Every field change on a booking, and every ApprovalVote cast, recorded here.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| booking_id | uuid | FK → bookings |
| changed_by | uuid | FK → admin_users |
| changed_by_name | text | denormalized for display |
| field_changed | text | e.g. `payment_stage`, or `approval_vote` |
| old_value | text | |
| new_value | text | |
| changed_at | timestamptz | |

## Relationships
```
admin_users 1---* admin_users (created_by, self-referential)
admin_users 1---* day_modes (set_by)
admin_users 1---* approval_votes
admin_users 1---* booking_audit_log

customers 1---* bookings

bookable_items 1---* bookable_item_images
bookable_items 1---* bookings

bookings 1---* approval_votes  (max 2 meaningful votes needed, unique per admin)
bookings 1---* booking_audit_log
```

## Derived values (not stored — computed at query time)

**RoomStatus** (per room, on a `room_mode` day): `booked` if that room has a `bookings` row with
`status IN ('reserved','booked')` overlapping the date, else `open`. (Display only — see
CalendarState below for the reservation-blocking rule.)

**CalendarState** (per date, aggregate — see `PRD.md` §9 for full rule table, now 4 values).
Implemented in `src/lib/calendar.ts`, unit-tested and verified against the live database:
- No `day_modes` row for that date: `unavailable`.
- `room_mode` day: `open` if no bookings exist; `reserved` if any room has a booking with status
  `reserved` or `booked` (but not all are booked); `booked` if all active rooms have bookings with
  status `booked`. **Key:** multiple customers CAN make reservations for the same room/dates
  simultaneously (all show as `reserved`); only `booked` (admin-confirmed) bookings prevent new
  reservations. Zero active rooms reads as `open`, not `booked`.
- `villa_mode` day: follows the villa's own booking `status` — shows `reserved` if villa has a
  `reserved` booking, `booked` if villa has a `booked` booking. If both somehow overlap the same
  date, `booked` takes precedence for display (though booking-creation validation prevents this).
- A `bookings` row against a Room or the Villa that has since been **deactivated** does not count
  toward either branch — CalendarState reflects what is bookable *now*, not a historical snapshot
  including inventory nobody can book any more.

## Key constraint reminders
- `day_modes` + `bookable_items.kind` together enforce the "never both room and villa active
  same day" rule at the query level (villa bookings only make sense against `villa_mode` days;
  room bookings only against `room_mode` days) — consider a check constraint or application-level
  validation on booking creation, since Postgres can't easily cross-validate two tables in a
  simple CHECK constraint.
- `approval_votes` unique constraint on (booking_id, admin_id) prevents one admin's vote from
  counting twice.
