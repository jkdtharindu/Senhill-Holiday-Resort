# Product Requirements Document (PRD)
## Senhill Holiday Resort — Hedigalle
### Hotel & Villa Booking System with Admin Approval

### 1. Overview
A booking platform for **Senhill Holiday Resort, Hedigalle** — a single independent
hotel/villa property. Guests reserve individual
rooms or the whole villa as a package. Every booking requires two-admin approval and manual
payment confirmation before it counts as fully booked. Each calendar day is admin-configured to
offer either individual rooms or the whole villa — never both — which keeps inventory conflict-free.

### 2. Problem statement
Management currently has no central visibility into bookings and no structured approval step
before a reservation is final. This system solves both: a color-coded shared calendar and a
two-admin approval gate. Pricing is **not** managed or displayed in-app in this version —
customers are simply informed that an advance payment is required to confirm a booking; the
payment amount and collection happen manually, outside the system.

### 3. Goals
- Give the public/customers a simple, color-coded calendar (open / reserved / booked) with no
  guest details exposed at the month/week/year view.
- Let a logged-in customer drill into a specific date to see per-room availability (still no
  other guests' identity) before booking.
- Require two-admin sign-off before any booking is treated as confirmed/booked.
- Let admins set per-day mode (room vs. villa) at a glance.
- Let a Super Admin manage the admin team itself.

### 4. Non-goals (out of scope for this version)
- Online payment processing — confirmed manually by an admin after payment is received outside
  the app.
- **In-app pricing.** No price is displayed, calculated, or managed anywhere in this version.
  The customer only sees a fixed notice that an advance payment is required to confirm the
  booking; the amount and collection happen entirely outside the system, arranged manually.
- Automatic messaging/reminders via SMS or WhatsApp. **Email is no longer out of scope** — see
  FR6b, added 2026-08-27.
- Guest reviews/ratings.
- Multi-property support — one hotel/villa only.
- ~~Shared inventory blocking logic between villa and rooms~~ — resolved by the DayMode
  mechanic (§9): since a day is always exclusively room-mode or villa-mode, the two inventories
  can never conflict. No additional blocking logic is needed.
- Booking requests spanning nights with different DayModes, or hitting an already-booked or
  `unavailable` date, are rejected outright — see FR5a. There is no partial-booking or
  auto-splitting logic.

### 5. User personas

| Persona | Access | Primary needs |
|---|---|---|
| **Customer** | Google Sign-In | Browse rooms/villa, see color-coded availability, drill into a date for room-level detail, submit a booking request, track own booking status |
| **Admin** | Email/password | Full booking + guest visibility, approve/decline bookings, mark payment received, set per-day mode, edit room/villa content and notes |
| **Super Admin** | Email/password | Everything Admin can do, plus create/manage other Admin accounts |

### 6. Functional requirements

**Public / Customer**
- FR1: View bookable items (individual rooms, whole villa) with images, description, and notes.
- FR2: View a month/week/year calendar showing exactly 4 color states per date: `unavailable`,
  `open`, `reserved`, `booked` — see §9 for exact derivation rules. No guest details at this
  level, for anyone (public or logged-in).
- FR3: After logging in and selecting a specific date, see the day-detail view: for a
  room-mode day, per-room status (e.g. "Room 1: booked, Room 2: booked, Room 3: open"); for a
  villa-mode day, the villa's own status. Still no other guest's identity/contact info at this
  level.
- FR4: See DefaultNotes (site-wide) plus CustomNotes (item-specific) during the booking flow.
- FR5: Submit a booking request for a date range on one BookableItem — a Room (room-mode days
  only) or the Villa (villa-mode days only). Guest count must not exceed the item's capacity.
- FR5a: If any date within the requested range has a mismatched DayMode, is `unavailable`, or
  is already booked/reserved, the entire request is rejected and the response names the
  specific conflicting date(s).
- FR5b: Customer sees a fixed notice during booking that an advance payment is required to
  confirm — no amount or payment collection happens in-app.
- FR5c: **Added 2026-08-27.** A customer may hold multiple simultaneous `reserved` requests —
  each is validated and approved/declined independently of the others, so a guest can submit a
  backup request for alternative dates while an earlier one is still under review. Capped at 6
  simultaneous `reserved` requests per customer, across every item, as abuse protection (owner
  decision). No dedicated UI for this — the existing "Book another stay" link already reaches
  the booking form regardless of any pending request, so nothing new needed to be exposed.
- FR6: Log in via Google to track own booking status (`reserved` vs `booked` vs `declined` vs
  `cancelled`).
- FR6a: **Superseded 2026-08-26.** A customer may withdraw their OWN booking while it is still
  `reserved` (self-service, immediate, no ApprovalVote). Once a booking reaches `booked`, only an
  admin can cancel it — a confirmed stay usually has an advance payment arranged offline, so
  ending it needs a human who can also arrange the refund. See `docs/tasks.md` (Slice 13) and
  `MEMORY.md` (2026-08-26 entry) for the full rule and rationale.
- FR6b: **Added 2026-08-27; currently NOT met for real guests — see below.** The customer
  receives email at each status change that matters to them: a confirmation when their request
  is submitted, an approved/declined notice when an admin's vote resolves it, and a cancellation
  confirmation. Sent via Resend, best-effort — see `docs/API_DOCUMENTATION.md`'s "Email
  Notifications" section.

  **Known deviation (2026-08-27):** the Resend account has no verified sending domain, and an
  unverified account only accepts mail addressed to the account owner. In practice this means
  **no guest other than the property owner currently receives any of these emails** — every send
  to a real guest is rejected by the provider and recorded as `failed`. The feature is built and
  tested correctly; what's missing is the $12/yr domain verification step, deferred on cost per
  owner decision (see `MEMORY.md`, 2026-08-27, and `MAINTENANCE.md` §5 for the full account).
  Admin alerts are narrowed to one working address via `EMAIL_RESTRICT_TO` in the meantime. This
  note should be removed once a domain is verified and this FR is genuinely met.
- FR6c: **Added 2026-08-27; WhatsApp buttons added same day.** A public `/contact` page shows the
  property's phone numbers, email addresses, and a map to its location, with a notice asking
  guests to call ahead and confirm the final approach road rather than rely solely on the
  embedded map's routing. Each phone number has a WhatsApp button (`wa.me` click-to-chat, guest-
  initiated with a pre-filled draft) alongside its `tel:` link — this is not automated messaging
  and does not touch §4's SMS/WhatsApp non-goal, since nothing is sent by the app itself.

**Admin**
- FR7: Log in via email/password (fully separate from customer Google auth).
- FR8: View all bookings with full guest details, filterable by status/date/room.
- FR9: Approve or decline a booking. Two distinct admin approvals move it to `booked`. A single
  decline from either required admin moves it to `declined` immediately.
- FR10: Manually set PaymentStage and AdvancePayment amount/date per booking.
- FR11: Set DayMode (`room_mode` \| `villa_mode`) per calendar date, in advance.
- FR11a: **Bulk-assign DayMode by pattern** — e.g. select "all weekends" (Saturdays + Sundays)
  within a date range and set them to `villa_mode` in a single action, rather than one date at
  a time. Any recurring pattern (weekends, specific weekday, custom date list) should be
  supported by this mechanism, not just weekends specifically.
- FR11b: **Switching a date's DayMode is blocked if conflicting bookings already exist** under
  the current mode for that date (e.g. can't flip a room-mode day to villa-mode while a room is
  `reserved`/`booked` there). The admin must resolve those bookings first (decline, or wait for
  completion) before the switch is allowed. Confirmed via Grill Me.
- FR12: Create/edit/deactivate Rooms and the Villa: name, images, description, capacity,
  CustomNotes. (No pricing field — see §4.)
- FR14: Edit the single DefaultNotes block.
- FR15: See the full day-detail view (same as customer FR3, plus guest identity/contact and
  approval status per booking).
- FR15a: **Added 2026-08-27.** Every active admin receives an email alert when a guest submits a
  new booking request, naming the guest, item, dates and contact details — so the approval
  workflow (FR9) does not depend solely on an admin remembering to open the panel. A deactivated
  admin is excluded from this alert.

**Super Admin**
- FR16: Everything in Admin, plus: create new admin accounts, deactivate/remove admin accounts,
  view which admin cast which approval/decline vote.

### 7. Non-functional requirements
- Every ApprovalVote is attributed to a specific named admin.
- Public/month-level calendar and API responses never expose guest identity, phone, or contact
  info — CalendarState only.
- Day-detail view for a logged-out visitor is not available — login required, per FR3.
- Google Sign-In is customer-only; cannot create or authenticate an admin account.

### 8. Success metrics (suggested)
- % of bookings reaching `booked` without approval disagreement.
- Average time from `reserved` to `booked`.
- Admin-reported visibility confidence.

### 9. Calendar & DayMode mechanics (core mechanic — read carefully)

**DayMode** is set by an admin, per date, ahead of time:
- `room_mode` — individual Rooms are bookable that day; the Villa is not offered.
- `villa_mode` — only the Villa is bookable that day; individual Rooms are not offered.
- **No default.** A date with no explicit `day_modes` row has **no mode** — it is not bookable
  at all (neither Rooms nor Villa) until an admin sets one. This was a deliberate choice: rather
  than silently defaulting new/unconfigured dates to room-bookable, the admin must actively
  open each date for business. Confirmed via Grill Me — do not change this to an implicit
  default without re-confirming.

This is a hard, mutually-exclusive switch (between `room_mode` and `villa_mode`), plus the
"unset" possibility above. It fully resolves the earlier "separate inventory" double-booking
risk — a day can never have both Room and Villa bookings active simultaneously, because at most
one type is ever offered.

**CalendarState** (shown at month/week/year view, to everyone, public and logged-in alike) —
**4 values**:

| State | Meaning |
|---|---|
| `unavailable` | No DayMode set for this date yet — not bookable, admin hasn't opened it |
| `open` | DayMode is set; nothing booked yet (room-mode: no bookings at all; villa-mode: villa free) |
| `reserved` | DayMode is set; at least one room/villa has a booking in `reserved` status (pending admin approval) or lower-priority `booked` bookings. Multiple customers MAY have made reservations for the same room/dates; admin picks which to approve. |
| `booked` | DayMode is set; room-mode: every active room has a `booked` (admin-confirmed) booking; villa-mode: villa's booking is in `booked` status. Only `booked` bookings prevent new reservations. |

This is intentionally coarse — a color per day, nothing more, to keep the top-level calendar
simple. Room-by-room and guest-level detail is only available in the **day-detail view**,
reachable only after login + selecting a specific date (FR3/FR15). A customer attempting to
view day-detail on an `unavailable` date should see a simple "not open for booking yet" message,
not an error.

### 9a. Booking window (3-month rolling limit)
Customers can only view and book dates within a **rolling 3-month (90-day) window from today**.
Dates beyond that are not shown on the calendar at all — not greyed out, not present in the
response. This window recalculates daily (it's always "today through +90 days," not a fixed
range). Applies to the public/customer-facing calendar and booking endpoints only — admins can
see and configure DayMode further out, since they need to plan ahead of the window opening.

### 10. Booking status lifecycle
```
reserved  →  (needs 2 admin ApprovalVotes)  →  booked
   |
   └──(either required admin declines)──→  declined
```

### 11. Future considerations
- In-app pricing (Quotation/BaseRate), if manual advance-payment coordination proves too slow
  or error-prone at higher booking volume.
- Online payment collection.
- Automated reminder messaging.
- Guest reviews.
- Revisit whether DayMode should ever be non-exclusive (e.g. partial villa + partial rooms) if
  business needs change — not needed for this version.
