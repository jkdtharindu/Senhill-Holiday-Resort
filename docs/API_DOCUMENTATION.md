# API Documentation

Base URL (local dev): `http://localhost:3000/api`

**Sessions are httpOnly cookies, not bearer tokens.** This section originally specified
`Authorization: Bearer <token>` before any code existed; as built, both auth systems set an
httpOnly, signed cookie on sign-in (`senhill_admin_session` for admins, Auth.js's own cookie for
customers) and every subsequent request is authenticated by the browser sending that cookie
automatically — there is no header to construct by hand. The cookie is deliberately unreadable
by page JavaScript, which is what keeps a stored token from being exfiltrated by an XSS bug.
Two entirely separate cookies, two entirely separate secrets: a customer session can never call
an admin-only route and vice versa. See `ARCHITECTURE.md` and `MAINTENANCE.md` §1–2.

**Response shape:** built as camelCase field names inside an object envelope (e.g.
`{ "calendar": [...] }`, `{ "admin": {...} }`), not the snake_case bare-array style shown in a
few of this document's original examples (written before implementation began). Kept consistent
across every endpoint built so far rather than varying per route — a frontend written in
TypeScript has no reason to convert field casing back and forth, and an object envelope leaves
room to add metadata later (pagination, a window summary) without a breaking change. Where an
example below still shows the original style, read it for the *shape of the data*, not the exact
keys — the endpoints below marked "as built" show the real, current field names.

---

## Auth

### `POST /auth/customer/google`
```json
{ "credential": "<Google ID token>" }
```
→ `{ "token": "...", "customer": { "id", "name", "email", "phone" } }`
Finds-or-creates a Customer. Never creates an Admin.

### `POST /auth/admin/login`
```json
{ "email": "admin@hotel.com", "password": "..." }
```
→ `{ "token": "...", "admin": { "id", "name", "email", "role" } }`

### `POST /auth/admin/create` — super_admin only
```json
{ "name": "New Admin", "email": "...", "password": "..." }
```
→ new admin account, `role: "admin"` (super_admin role must be granted separately/manually,
not via this endpoint, to avoid accidental privilege escalation).

---

## Bookable Items (Rooms & Villa)

### `GET /bookable-items`
Public. Returns all active Rooms + the Villa, with images, description, custom_notes, capacity.
No pricing field — pricing is out of scope this version.

### `POST /bookable-items` — admin
Create a Room or the Villa entity.
```json
{ "kind": "room", "name": "Room 1", "description": "...", "capacity": 2 }
```

### `PUT /bookable-items/:id` — admin
Partial update (name, description, capacity, custom_notes, active, images).

---

## Calendar

### `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` — as built, done
Public, no session required — the response is identical for every caller. Returns
**CalendarState only** — no guest details, no room-level breakdown. Dates with no admin-set
DayMode return `state: "unavailable"` and `dayMode: null` — not omitted from the array, so the
frontend can render them distinctly (e.g. greyed out) rather than treating a gap in the response
as an error.

**BookingWindow enforcement:** `from`/`to` are clamped server-side to `today`–`today+90 days`
(Asia/Colombo) for this endpoint. A request entirely outside that window returns `{ "calendar":
[] }`; a request that only partially overlaps is silently trimmed to the window's edge, not
rejected. Admin-only calendar endpoints (`GET /api/calendar/day-mode`) are not clamped.

```json
{
  "calendar": [
    { "date": "2026-09-09", "dayMode": null, "state": "unavailable" },
    { "date": "2026-09-10", "dayMode": "room_mode", "state": "open" },
    { "date": "2026-09-11", "dayMode": "room_mode", "state": "reserved" },
    { "date": "2026-09-12", "dayMode": "villa_mode", "state": "booked" }
  ]
}
```

CalendarState is computed at request time from `day_modes` + active `bookings`
(`src/lib/calendar.ts`), never stored — see `ARCHITECTURE.md`, "Why CalendarState is derived, not
stored". A booking against a Room or the Villa that has since been deactivated does not count
toward "every room taken" or the villa's own status — the colour reflects what is bookable now,
not a historical snapshot including inventory nobody can book any more.

### `GET /calendar/:date` — customer or admin, login required — as built, done
Day-detail view. Login required for everyone — there is no logged-out response at all (PRD §9).
Serves two different shapes from the same URL depending on who is asking, decided server-side
(an admin session takes priority if both happen to be present):
- Customer response: RoomStatus per room (room-mode day) or villa status (villa-mode day). No
  guest identity. Rejected (400) if the date is outside the BookingWindow.
- Admin response: same, plus full guest details, payment stage, advance payment, internal notes
  and every ApprovalVote (with the voting admin's name) per booking. Not restricted by
  BookingWindow — admins plan further out than customers can book (§9a).

A date with no DayMode set is **not an error** for either caller — the response carries
`unavailable: true` and an empty `items` array, for the frontend to render "not open for booking
yet" rather than treating a gap as a failure.

```json
{
  "role": "customer",
  "date": "2026-09-15",
  "dayMode": "room_mode",
  "unavailable": false,
  "items": [
    { "itemId": "...", "name": "Room 1", "capacity": 4, "status": "booked", "bookingId": "..." },
    { "itemId": "...", "name": "Room 2", "capacity": 4, "status": "open", "bookingId": null }
  ]
}
```

Admin response adds a `booking` object (or `null`) per item:
```json
{
  "itemId": "...", "name": "Room 1", "capacity": 4, "status": "booked", "bookingId": "...",
  "booking": {
    "bookingId": "...", "guestName": "...", "phone": "...", "email": "...", "guestsCount": 2,
    "status": "reserved", "checkIn": "2026-09-15", "checkOut": "2026-09-17",
    "paymentStage": "advance_paid", "advanceAmount": "5000.00", "advancePaidDate": "2026-09-01",
    "internalNotes": "...",
    "approvals": [{ "adminId": "...", "adminName": "Owner", "vote": "approve", "votedAt": "..." }]
  }
}
```

Implemented as a pure derivation module (`src/lib/day-detail.ts`, 11 unit tests) — RoomStatus only
has 2 values, so a merely `reserved` booking reads identically to `booked` at this level, and the
half-open range applies here too (checkout day frees the room). Guest identity is attached only in
`src/lib/day-detail-service.ts`'s admin path, never in the pure module, so there is no code path
where it could leak into a customer response by accident.

Verified against the live database: 3 rooms all `open` with no bookings; a real `reserved` booking
against Room 1 (with a real ApprovalVote attached) read `booked` with full guest + vote detail for
the admin and only `status`/`bookingId` for the customer; the villa mirrored a `booked` villa
booking the same way; the booking's checkout day read `open` again once its own DayMode was set,
confirming the half-open boundary; an unauthenticated request 401'd; a date outside the 90-day
window 400'd for the customer. All test data removed afterward.

**Second consumer added 2026-08-27, no endpoint change needed.** The admin calendar's
"Availability at a glance" panel (`/admin/calendar`) fetches this same endpoint client-side when
an admin clicks a date, and renders the returned `items` (including `images`, added alongside the
customer day-detail thumbnail feature the same day) inline below the calendar grid. This endpoint
already served admin-shaped output whenever an admin session was present — the panel exists solely
because nothing had called it from the admin UI before. See `src/app/admin/(panel)/calendar/availability-calendar.tsx`.

### `PUT /calendar/day-mode` — admin — as built, done
Set DayMode for one or more explicit dates ahead of time. Any admin, not just super admin, per
FR11. Refuses more than 500 dates in one request (`MAX_EXPLICIT_DATES` in
`src/lib/day-mode.ts`) — not a business rule, a typo-catching safety cap; see `MAINTENANCE.md`
§11.
```json
{ "dates": ["2026-12-25", "2026-12-26"], "mode": "villa_mode" }
```
Rejected (409) per-date if `DayModeSwitchBlock` applies — i.e. that date already has a
`reserved`/`booked` booking under its *current* mode. Response lists which dates succeeded and
which were blocked, since a bulk request may partially succeed:
```json
{
  "updated": ["2026-12-26"],
  "blocked": [{ "date": "2026-12-25", "reason": "Existing booking under current mode" }]
}
```
Verified against the live database with a real booking inserted: blocked every night it covered,
let the checkout day switch freely (half-open range), and freed the switch immediately once the
booking was declined.

### `GET /calendar/day-mode?from=&to=` — admin — as built, done, not in the original plan
Raw `day_modes` rows in a date range — `[{ date, mode, setBy, updatedAt }]`. Not the public
CalendarState aggregate (that's `GET /calendar`, above); this exists so an admin picking dates to
set can see what's already configured. Not clamped to the BookingWindow — admins plan further
ahead than customers can book, per PRD §9a.

### `PUT /calendar/day-mode/bulk` — admin — as built, done
BulkDayModeAssignment by pattern, not just an explicit date list — e.g. "every Saturday and
Sunday in this range." Refuses a `from`–`to` span wider than 2 years (`MAX_BULK_RANGE_DAYS`),
same reasoning as the 500-date cap above.
```json
{
  "from": "2026-09-01", "to": "2026-11-30",
  "pattern": "weekends",
  "mode": "villa_mode"
}
```
`pattern` values: `weekends` (Sat+Sun) to start; extendable later to specific weekdays or a
custom recurrence if needed. Same partial-success/blocked response shape as the single-date
endpoint above. Verified against the live database: a full month set exactly the correct weekend
dates, not one weekday slipped through.

---

*(No pricing endpoints — pricing is out of scope this version. See `PRD.md` §4.)*

---

## Bookings

### `POST /bookings` — customer, login required — as built, done
Submit a booking request for a `check_in`–`check_out` range. Rejected (400) if the range falls
outside the BookingWindow, or if **any** night in that range fails one of these checks — the
response names every conflicting night, not just the first one found, and nothing is created
unless every night clears (FR5a — no partial-booking, no auto-splitting):
- The date has no DayMode set at all (`reason: "unavailable"`), or
- The date's DayMode doesn't match the chosen BookableItem kind (`reason: "day_mode_mismatch"` —
  e.g. a Room on a `villa_mode` day, or the Villa on a `room_mode` day), or
- The date already has a conflicting `reserved`/`booked` booking for that item
  (`reason: "already_booked"`).

Also rejected (400) if `guests_count` exceeds the BookableItem's `capacity`, or if the item is
missing/deactivated.

`email` on the created booking is taken from the signed-in customer's own account, never from the
request body — it is how staff reach the account holder, so it must not be able to diverge from
who actually owns the account. `guest_name` and `phone` come from the body since a signed-in guest
may be booking on someone else's behalf.

On success, the response includes an `advancePaymentNotice` string (fixed text, not dynamically
calculated) reminding the customer that an advance payment is required to confirm — no amount, no
in-app payment collection.

No cancellation endpoint exists for customers — a `reserved` booking can only be moved to
`declined`/`booked` via an admin's `/vote` (see below). This is by design, not a gap.

```json
{
  "bookable_item_id": "...", "check_in": "2026-09-10", "check_out": "2026-09-13",
  "guest_name": "...", "phone": "...", "guests_count": 2
}
```

**Error example (date conflict) — as built:**
```json
{
  "error": "Some requested dates are unavailable.",
  "conflicting_dates": [
    { "date": "2026-09-10", "reason": "already_booked" },
    { "date": "2026-09-15", "reason": "unavailable" },
    { "date": "2026-09-16", "reason": "day_mode_mismatch" }
  ]
}
```
→ on success, created with `status: reserved`, `201`.

Implemented as a pure validation module (`src/lib/booking.ts`, 23 unit tests covering every
combination of reason, the half-open boundary on both the window and existing-booking conflict
checks, and that a mismatch on one night is never masked by a matching mode on another) plus a
DB-orchestration module (`src/lib/booking-service.ts`). The service re-validates a second time
inside the write transaction immediately before the `INSERT`, using the identical validation
function, to narrow the race window between the initial fetch and the write — the schema has no
exclusion constraint on overlapping date ranges, so this is a mitigation, not a hard guarantee;
logged as a follow-up in `MAINTENANCE.md`, not a blocker for this slice.

Verified against the live database: a clean 2-night booking succeeded and returned
`advancePaymentNotice`; a 7-night request spanning an existing booking, an unset date, and a
DayMode boundary was rejected 400 naming all 4 conflicting nights with their correct distinct
reasons, and created nothing; a second booking starting exactly on the first one's checkout day
succeeded (half-open boundary holds against live data); over-capacity and wrong-item-kind requests
were each rejected with a single clear error; a date outside the 90-day window was rejected naming
the window's actual edges; the day-detail endpoint (Slice 7) immediately reflected the new booking
as `booked` for the correct room. All test data removed afterward.

**Model note:** built with Sonnet 5 rather than the Opus 5 recommended in `MODEL_SELECTION.md`, at
the owner's explicit request as a one-off exception. Verification was correspondingly more
thorough — 23 unit tests plus a live-database pass exercising every conflict-reason combination —
specifically because this is the multi-constraint validation MODEL_SELECTION.md flagged as
highest-risk.

**Added 2026-08-27 — email notifications (Resend).** On success, two emails are sent
best-effort after the transaction commits: a confirmation to the guest (`booking.email`) and an
alert to every *active* admin, naming the guest, item, dates, phone and email so an admin can act
without opening the panel first. See "Email Notifications" below for the shared mechanism and why
a mail failure never affects this endpoint's response.

### `GET /bookings/my` — customer — **not built, by decision (Slice 12)**
### `GET /bookings` — admin — **not built, by decision (Slice 12)**
### `GET /bookings/:id` — admin — **not built, by decision (Slice 12)**

These three read endpoints were specified before the frontend existed. When Slice 12 built the
screens that would have consumed them, every page turned out to be a server component rendering
on the same server as the database — so calling them would have meant a page issuing an HTTP
request to itself, re-authenticating and re-serialising rows it could read directly.

Owner decision at the start of Slice 12: **skip the endpoints, read through service modules
instead.** The equivalent reads now live in:

| Was going to be | Is now | Used by |
|---|---|---|
| `GET /bookings/my` | a scoped query in the page itself | `/my-bookings` |
| `GET /bookings` | `fetchAdminBookings()` in `src/lib/admin-bookings-service.ts` | `/admin/bookings` |
| `GET /bookings/:id` | `fetchAdminBooking()` in the same module | `/admin/bookings/[id]` |

The filter set survives unchanged — `status`, `bookable_item_id`, `from`, `to` and a
name/phone/email `q` search are the arguments to `fetchAdminBookings`, and appear as URL query
parameters on `/admin/bookings` so a filtered view stays a shareable link.

**Revisit when** something outside this Next.js app needs booking data — a mobile client, or an
integration. At that point these become real endpoints wrapping the same service functions, so
there is still one place the query logic lives. Logged in `MAINTENANCE.md`, not carried as open
work.

### `POST /bookings/:id/vote` — admin — as built, done
Cast an ApprovalVote. Any signed-in, active admin may vote (no super-admin restriction, per FR9).
```json
{ "vote": "approve" }
```
- If this is the 2nd `approve` from a distinct admin → booking moves to `booked`.
- If `vote: "decline"` → booking moves to `declined` immediately, regardless of any prior
  `approve` vote (no tiebreaker — a decline is terminal).
- An admin voting twice on the same booking overwrites their own prior vote via the unique
  constraint on `(booking_id, admin_id)`; a re-vote never double-counts.
- Voting on a booking whose status is already `booked` or `declined` returns 409 — the two-admin
  process is closed on it, and a late vote is treated as a stale form submission rather than a
  legitimate action.
- **Added 2026-08-27 — approval queue.** An `approve` vote returns 409 if another `reserved`
  booking on the *same item*, with *overlapping dates*, has a stronger claim (see
  `MAINTENANCE.md` §13 and `src/lib/vote.ts`'s `findApprovalQueueBlocker`). Priority: a booking
  with an advance payment recorded outranks one without, regardless of which was submitted first;
  otherwise earlier submission wins. The response names the stronger booking so the admin can
  jump to it:
  ```json
  {
    "error": "Jane Doe's booking for overlapping dates was received first — decide that one before approving this one.",
    "blocked_by": { "bookingId": "...", "guestName": "Jane Doe" }
  }
  ```
  `decline` is **never** blocked this way — declining only frees a date, so there is nothing to
  jump ahead of.

Response:
```json
{
  "previousVote": "approve",           // or "decline" or null (first vote from this admin)
  "previousStatus": "reserved",
  "status": "booked",                  // the booking's status AFTER the vote
  "statusChanged": true
}
```

Implemented as a pure decision module (`src/lib/vote.ts`, 13 unit tests) plus a DB-orchestration
module (`src/lib/vote-service.ts`) that runs the vote write, any resulting status update, and
the audit-log entries in one transaction, with a `SELECT ... FOR UPDATE` on the booking row to
serialize concurrent votes — two admins voting simultaneously cannot both read `reserved` and
both apply; one queues behind the other, sees the updated status, and (correctly) gets rejected
409 if the first vote already resolved the booking.

**Audit log** (`booking_audit_log`): every call writes an `approval_vote` row with the admin's
previous vote (or null) as `old_value` and the new vote as `new_value`. When the vote also
changes booking status, a second `status` row is written in the same transaction with the
from/to status pair. Admin name is denormalized so history reads correctly if the admin is
later renamed or deactivated.

Verified against the live database: unauthenticated → 401; two distinct admins approving one
booking moved it through reserved → reserved → booked; a re-vote from the same admin recorded
`previousVote: "approve"` and did not double-count; the second booking's decline from a distinct
admin (with a prior approve standing) moved it straight to declined; a further vote on the
already-booked booking returned 409 with a clear message; the audit log captured all 3 votes
plus both status transitions with correct old/new values and admin names; Slice 7's day-detail
endpoint immediately reflected the two approvals under the booking's `approvals` array. All test
data removed afterward (bookings cascade to approval_votes and booking_audit_log per schema).

**Model note:** built with Opus 4.7 rather than the Sonnet 5 recommended in
`MODEL_SELECTION.md` — an over-spec exception (opposite direction from Slice 8's under-spec
one). Not incorrect, just heavier than needed for a straightforward state-machine slice.
Logged per the exception protocol in MODEL_SELECTION.md so both directions get treated the
same way.

**Added 2026-08-27 — email notifications (Resend).** When this vote is the one that resolves
the booking (the 2nd distinct `approve`, or any `decline`), the guest gets an "approved"/"declined"
email after the transaction commits. A vote that does not resolve the booking (e.g. the first of
two approvals) sends nothing — it is not guest-visible news yet. See "Email Notifications" below.

### `POST /bookings/:id/cancel` — admin, or the booking's own customer — as built, done
Cancel a booking. Terminal and immediate: there is no un-cancel, and no ApprovalVote is
required. The two-admin rule exists to stop a date being *held* carelessly; releasing one is
the safe direction, and a single decline already resolves a booking today without a second
opinion.

**Who may cancel what** (owner decision, 2026-08-26) — deliberately asymmetric:

| Actor | `reserved` | `booked` | `declined` / `cancelled` |
|-------|-----------|----------|--------------------------|
| Admin | ✅ cancels | ✅ cancels | ❌ 409 |
| Guest (own booking) | ✅ withdraws | ❌ 403 — must contact staff | ❌ 409 |
| Guest (someone else's) | ❌ 404 | ❌ 404 | ❌ 404 |

A guest may not cancel a confirmed stay because an advance payment has usually been arranged
offline by that point (PRD §4/FR5b) — unwinding it is a conversation, not a button.

```json
{ "reason": "Guest called to cancel — family emergency" }
```
- `reason` is **required for an admin** (400 if absent or blank) — it is the record staff rely
  on in a dispute. It is **optional for a guest**, defaulting to `"Withdrawn by guest"`.
- Max 500 characters. Body is `.strict()` — any other key (including `status` or `cancelledBy`)
  is rejected 400 rather than silently ignored.
- An empty body is valid for a guest withdrawal.

Which actor is calling is decided **from the session, never from the body** — a guest cannot
claim to be an admin by sending a field. If a caller somehow holds both an admin and a customer
cookie, the admin claim wins and that admin's id is what lands in `cancelled_by`.

**Ownership is checked before status**, so a guest probing another customer's booking id gets an
identical `404 Booking not found.` whatever state that booking is in — the refusal cannot be used
to discover whether someone else's booking exists or what state it is in.

Response `200`:
```json
{
  "status": "cancelled",
  "previousStatus": "booked",
  "cancelledAt": "2026-08-26T09:14:22.000Z",
  "reason": "Guest called to cancel — family emergency"
}
```

**Date recovery is automatic, and there is no code that performs it.** Every date-blocking query
in the app names the statuses that block by allowlist — `["booked"]` in `booking-service.ts`,
`["reserved","booked"]` in `calendar-service.ts`, `day-detail-service.ts`, `day-mode-service.ts`
and the bookable-items capacity check. A cancelled booking drops out of all of them the instant
its status changes. Adding an explicit "free the dates" step would create a second source of
truth for availability, which `ARCHITECTURE.md` rules out. If a future query ever filters by
*excluding* `declined` rather than naming what blocks, that query is the bug.

**No refund is calculated, by design.** Pricing is out of scope (PRD §4) — the app stores no room
rates, only `advance_amount` as a manual record of cash collected offline. A percentage computed
against that would describe the deposit, not the stay, while reading as authoritative. Cancelling
records the fact; an admin arranges the refund offline and then sets `paymentStage` to `refunded`
through `PUT /bookings/:id`. The admin UI warns about this whenever a payment is on record.

**Schema:** `booking_status` gains `cancelled`; `bookings` gains `cancelled_at`, `cancelled_by`
(FK to `admin_users`, **null means the guest withdrew it themselves** — the absence of an admin
is the record, never backfilled with a placeholder) and `cancellation_reason`. A check constraint
ties them together: `(status::text = 'cancelled') = (cancelled_at IS NOT NULL)`. The `::text`
cast is load-bearing — drizzle runs all pending migrations in one transaction, and PostgreSQL
refuses to evaluate an enum value added earlier in that same transaction when validating a
constraint against the already-populated table.

Implemented as a pure decision module (`src/lib/cancellation.ts`, 17 unit tests covering the full
actor × status matrix) plus a DB-orchestration module (`src/lib/cancellation-service.ts`) that
locks the booking `SELECT ... FOR UPDATE` — same reasoning as `/vote` — so two simultaneous
cancel requests cannot both read a live status; the second is correctly refused 409 rather than
overwriting the first one's record of who cancelled and why.

**Audit log** (`booking_audit_log`): two rows per cancellation in the same transaction — a
`status` row with the from/to pair, and a `cancellation_reason` row carrying the reason.
`changed_by` is null for a guest withdrawal, with `changed_by_name` recorded as
`"Guest (self-service)"` so the history still reads correctly.

**Added 2026-08-27 — email notifications (Resend).** After the cancellation commits, the guest
gets a confirmation email at `booking.email`, worded slightly differently depending on who acted
("your booking has been withdrawn, as you requested" for a guest self-cancel vs. "your booking has
been cancelled" for an admin-initiated one) — see `bookingCancelledEmail` in
`src/lib/email-templates.ts`. No separate refund amount appears in the email; it only notes that
a refund, if one applies, will be handled separately, matching the "no refund calculated" rule
above. See "Email Notifications" below.

### `PUT /bookings/:id` — admin — as built, done
Comprehensive update: `guestName`, `phone` (compulsory, cannot be blanked), `email`,
`paymentStage` (`unpaid`\|`advance_paid`\|`fully_paid`\|`refunded`), `advanceAmount`,
`advancePaidDate`, `internalNotes`. All fields optional in the request body — only the ones
present are validated and written. Request body is `.strict()` — an unrecognized key (including
`status`) is rejected 400 rather than silently ignored.
```json
{ "phone": "0779999999", "paymentStage": "advance_paid", "advanceAmount": "50.00" }
```
Does **not** change `status` directly — status only changes via `/vote` or an explicit cancel
endpoint (not yet built), so an admin cannot sidestep the two-admin approval process through this
route.

Response:
```json
{ "changedFields": ["phone", "payment_stage", "advance_amount"] }
```
An empty patch (no fields present) is rejected 400. A patch where every present field already
matches the current value succeeds with `changedFields: []` and writes nothing to
`booking_audit_log`.

Implemented as a pure diff/validation module (`src/lib/booking-update.ts`, unit tests covering
no-op detection, blank-phone/blank-name rejection, negative/non-numeric advance amount rejection,
malformed date rejection, and exact field-diff output) plus a DB-orchestration module
(`src/lib/booking-update-service.ts`) that locks the booking row (`SELECT ... FOR UPDATE`),
computes the diff, and writes the update plus one `booking_audit_log` row per changed field in a
single transaction.

Verified against the live database: unauthenticated → 401; an empty `{}` body → 400; a
whitespace-only `phone` → 400; a request naming an unknown key (`status`) → 400 rather than
silently ignored; a 404 on an unknown booking id; a real multi-field update (phone, payment
stage, advance amount, advance paid date, internal notes) persisted correctly and produced exactly
one `booking_audit_log` row per changed field with correct old/new values and the admin's
denormalized name; `status` and every untouched field were left unchanged. All test data removed
afterward.

---

## Email Notifications

**Added 2026-08-27.** Not a separate API endpoint — a side effect of three existing booking
routes, sent via [Resend](https://resend.com). Documented once here rather than repeated per
route; each route above links back to this section for the specifics of when it fires.

**Events covered** (`src/lib/email-templates.ts` — one function per event, sharing a common HTML
shell so a branding change is one edit):
| Event | Trigger | Recipient(s) |
|---|---|---|
| Booking confirmation | `POST /bookings` succeeds | the guest |
| New-booking alert | `POST /bookings` succeeds | every **active** admin (`adminUsers.active = true`) |
| Approved | a vote resolves a booking to `booked` | the guest |
| Declined | a vote resolves a booking to `declined` | the guest |
| Cancelled | `POST /bookings/:id/cancel` succeeds | the guest |

**Best-effort, never blocking.** `src/lib/email.ts`'s `sendEmail()` catches its own errors —
a missing `RESEND_API_KEY`, a Resend API error, a network failure — and only logs them; it never
throws. Every call site fires the email **after** its write transaction has already committed, so a
slow or failing mail provider can never turn a successful booking/vote/cancellation into an error
response, and never holds a `SELECT ... FOR UPDATE` row lock open waiting on a network call.

**Scheduled with `after()` from `next/server` — never a bare `void promise`.** This is
load-bearing, not stylistic. The first version of this feature used
`void notifyXxx(...).catch(...)` and sent **zero** emails in production while working perfectly
locally: Vercel's serverless runtime can freeze a function the instant its response is sent, and an
unawaited promise still in flight then may never run. `after()` wraps Vercel's `waitUntil` to keep
the invocation alive until the callback settles, without delaying the response. Do not "simplify"
these back to fire-and-forget. See `MEMORY.md` (2026-08-27 entry) for the full post-mortem.

**Recipients:** `src/lib/notification-recipients.ts`'s `getActiveAdminEmails()` is the single
query deciding who gets an admin alert — a deactivated admin is excluded, since they can no
longer act on it anyway. If that list is ever empty (mid-transition between admins), the guest's
own confirmation still sends; a missing admin alert is a visibility gap, not a reason to fail the
booking.

**Sending domain.** `EMAIL_FROM` (env var) controls the `From:` address. Until a custom domain is
verified in Resend, it is set to Resend's own `onboarding@resend.dev` test sender — functional,
but guests see a generic address rather than the property's own domain. Once a domain is verified
in the Resend dashboard, update `EMAIL_FROM` in both `.env.local` and Vercel's project settings;
no code change needed.

**Cost.** Resend's free tier (100 emails/day, 3,000/month) covers this property's expected volume
by a wide margin — a booking generates at most 2 emails (guest + admin alert), and even 50
bookings/month stays well under the free tier. See `docs/MAINTENANCE.md` §5 for the fuller
trade-off discussion (SMS/WhatsApp still out of scope, no guest-configurable preferences).

> **Reading Resend's response headers:** `x-resend-daily-quota` / `x-resend-monthly-quota` are
> **usage counters**, not limits. A fresh account returning `x-resend-daily-quota: 1` has sent one
> email today — it is *not* capped at one. This was misread once during the 2026-08-27 build and
> briefly mistaken for an account restriction; the plan limits are the published ones above.

**Volume monitoring — not built.** There is currently no record of send attempts anywhere, so
neither "how many went out today" nor "did any fail" is answerable without adding instrumentation.
An `email_log` table was discussed on 2026-08-27 (owner asked about alerting on unusual daily
volume) and would close both gaps at once. Worth noting for scale: at 3 rooms + a villa, 100 emails
in one day is not achievable by legitimate bookings — such a spike would indicate a bug or abuse,
so a useful alert threshold sits far below the plan cap (~30–50/day), not at it.

**Templates as a starting point, not a final admin-editable system.** The owner asked for these
to remain editable "as templates for the future" — today that means editing the plain functions in
`email-templates.ts` directly. If per-event admin-editable copy is wanted later (mirroring
DefaultNotes' pattern, Slice 11), treat this file's current wording as the seed content for that,
not as a system to build from scratch.

---

## Site Settings

### `GET /site-settings` — public — as built, done
Returns the site-wide `default_notes` (booking terms shown to every customer in the booking flow).
Cached/polled by customers on page load; updated by admins through `PUT /site-settings` below.

Response:
```json
{ "defaultNotes": "Check-in from 2pm. WiFi password on the fridge..." }
```

Implemented as a direct read-query in the route handler (no caching layer — the database is the
authority).

Verified against the live database: public access (no auth required) returns the current notes,
and every update via `PUT` appears immediately on the next `GET`.

### `PUT /site-settings` — admin — as built, done
Update site-wide booking terms. `defaultNotes` is optional in the request body — if absent,
nothing changes. If present, it must be non-blank (whitespace-only rejected 400).

Request:
```json
{ "defaultNotes": "Check-in from 2pm. WiFi password on the fridge. No loud noise after 10pm." }
```

Response:
```json
{ "changed": true }
```
or
```json
{ "changed": false }
```
A `PUT` to the same value succeeds with `changed: false` — idempotent, no error.

Implemented as a pure validation module (`src/lib/site-settings.ts`, unit tests covering
no-op detection, blank-value rejection, multiline text, and change detection) plus a
DB-orchestration module (`src/lib/site-settings-service.ts`) that fetches the current value,
validates the patch, and writes the update with `updated_by` and `updated_at` denormalization.

Verified against the live database: unauthenticated → 401; empty `{}` body → `changed: false`;
blank `defaultNotes` → 400 with clear message; a real update → `changed: true` and persisted
correctly; `GET` immediately sees the new value; re-PUTting the same value → `changed: false`.
No audit log per the schema — only the `updated_by` and `updated_at` fields track history.

---

## Contact page

**Added 2026-08-27.** `/contact` — a static guest-facing page, not an API endpoint (no route to
document here). Phone numbers, email addresses and the property address come from
`src/lib/contact-info.ts`'s `CONTACT_INFO` constant — the single source of truth shared with the
email templates' footer, so the two surfaces cannot drift apart.

Includes a Google Maps embed (the key-free `/maps?...&output=embed` iframe form, not the
JavaScript Maps SDK) built from `CONTACT_INFO.mapQuery`, plus a warning notice: **guests are told
to call ahead and confirm the final approach road** rather than trust the embedded map's
turn-by-turn routing. This exists because consumer map data for a rural resort access road is
exactly the kind of detail that goes stale or wrong — the notice is a deliberate hedge against
"map hallucination" sending a guest down the wrong road on arrival, not a general disclaimer.

---

## Error format
`{ "error": "human readable message" }` with appropriate status (400/401/403/404/409).
