# API Documentation

Base URL (local dev): `http://localhost:3000/api`

Authenticated requests need `Authorization: Bearer <token>`. Two separate auth systems:
customer tokens (from Google Sign-In) and admin tokens (from email/password) — a customer token
can never call an admin-only route and vice versa.

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

### `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`
Public. Returns **CalendarState only** — no guest details, no room-level breakdown. Dates with
no admin-set DayMode return `state: "unavailable"` and `day_mode: null` — not omitted from the
array, so the frontend can render them distinctly (e.g. greyed out) rather than treating a gap
in the response as an error.

**BookingWindow enforcement:** `from`/`to` are clamped server-side to `today`–`today+90 days`
for this endpoint. A request for dates outside that window returns an empty array for those
dates, not an error — the frontend shouldn't even offer navigation past the window (see
`ARCHITECTURE.md` for the UI implication). Admin-only calendar endpoints are not clamped.

```json
[
  { "date": "2026-09-09", "day_mode": null, "state": "unavailable" },
  { "date": "2026-09-10", "day_mode": "room_mode", "state": "open" },
  { "date": "2026-09-11", "day_mode": "room_mode", "state": "reserved" },
  { "date": "2026-09-12", "day_mode": "villa_mode", "state": "booked" }
]
```

### `GET /calendar/:date` — customer or admin, login required
Day-detail view.
- Customer response: RoomStatus per room (room-mode day) or villa status (villa-mode day). No
  guest identity. Rejected (400) if the date is outside the BookingWindow.
- Admin response: same, plus full guest details, payment stage, and approval status per booking.
  Not restricted by BookingWindow.

### `PUT /calendar/day-mode` — admin
Set DayMode for one or more explicit dates ahead of time.
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

### `PUT /calendar/day-mode/bulk` — admin
BulkDayModeAssignment by pattern, not just an explicit date list — e.g. "every Saturday and
Sunday in this range."
```json
{
  "from": "2026-09-01", "to": "2026-11-30",
  "pattern": "weekends",
  "mode": "villa_mode"
}
```
`pattern` values: `weekends` (Sat+Sun) to start; extendable later to specific weekdays or a
custom recurrence if needed. Same partial-success/blocked response shape as the single-date
endpoint above.

---

*(No pricing endpoints — pricing is out of scope this version. See `PRD.md` §4.)*

---

## Bookings

### `POST /bookings` — customer, login required
Submit a booking request for a `check_in`–`check_out` range. Rejected (400) if the range falls
outside the BookingWindow, or if **any** date in that range fails one of these checks — the
response names every conflicting date, not just the
first one found:
- The date has no DayMode set at all (`unavailable`), or
- The date's DayMode doesn't match the chosen BookableItem kind (e.g. a Room on a `villa_mode`
  day, or the Villa on a `room_mode` day), or
- The date already has a conflicting `reserved`/`booked` booking for that item.

Also rejected (400) if `guests_count` exceeds the BookableItem's `capacity`.

On success, the response includes an `advance_payment_notice` string (fixed text, not
dynamically calculated) reminding the customer that an advance payment is required to confirm —
no amount, no in-app payment collection.

No cancellation endpoint exists for customers — a `reserved` booking can only be moved to
`declined`/`booked` via an admin's `/vote` (see below). This is by design, not a gap.

```json
{
  "bookable_item_id": "...", "check_in": "2026-09-10", "check_out": "2026-09-13",
  "guest_name": "...", "phone": "...", "guests_count": 2
}
```

**Error example (date conflict):**
```json
{
  "error": "Some requested dates are unavailable",
  "conflicting_dates": ["2026-09-11", "2026-09-12"]
}
```
→ created with `status: reserved`.

### `GET /bookings/my` — customer
Own bookings, with current status.

### `GET /bookings` — admin
Filter by `status`, `bookable_item_id`, `from`, `to`, `q` (name/phone/email search).

### `GET /bookings/:id` — admin
Full detail + `approval_votes` + `history` (audit log).

### `POST /bookings/:id/vote` — admin
Cast an ApprovalVote.
```json
{ "vote": "approve" }
```
- If this is the 2nd `approve` from a distinct admin → booking moves to `booked`.
- If `vote: "decline"` → booking moves to `declined` immediately, regardless of any prior
  `approve` vote.
- An admin voting twice on the same booking overwrites their own prior vote (does not double-count).

### `PUT /bookings/:id` — admin
Update guest info, phone (compulsory), payment_stage, advance_amount/date, internal_notes.
Same comprehensive-update pattern as before — every changed field logged to `booking_audit_log`.
Does **not** change `status` directly — status only changes via `/vote` or an explicit cancel
endpoint (not yet built).

---

## Site Settings

### `GET /site-settings`
Public. Returns `default_notes`.

### `PUT /site-settings` — admin
```json
{ "default_notes": "Check-in from 2pm..." }
```

---

## Error format
`{ "error": "human readable message" }` with appropriate status (400/401/403/404/409).
