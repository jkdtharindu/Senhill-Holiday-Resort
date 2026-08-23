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
