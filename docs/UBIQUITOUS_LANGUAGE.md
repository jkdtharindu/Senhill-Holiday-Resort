# Ubiquitous Language

Shared glossary so the terms used in conversation, documentation, and code all mean the same
thing. Match these exactly to field/enum names in the schema and API — do not introduce
synonyms mid-build.

## Core entities

| Term | Definition |
|---|---|
| **BookableItem** | Generic term for anything a customer can reserve: a **Room** or the **Villa**. Both stored as the same entity type with a `kind` field (`room` \| `villa`) since they share fields (images, price, notes). |
| **Room** | An individual bookable unit within the property. A BookableItem with `kind = room`. |
| **Villa** | The whole-property package, bookable as one unit. A BookableItem with `kind = villa`. |
| **Booking** | A customer's request to reserve one BookableItem for a date range. |
| **Customer** | A guest with a Google-authenticated account. |
| **Admin** | A staff member with email/password login who can view full booking details and cast ApprovalVotes. |
| **SuperAdmin** | An Admin with the additional ability to create/manage other Admin accounts. |

## Day configuration

| Term | Definition |
|---|---|
| **DayMode** | Admin-set toggle per calendar date: `room_mode` (individual Rooms bookable that day) or `villa_mode` (only the Villa bookable that day). Mutually exclusive by design — see `PRD.md` §9. |

## Calendar states — two distinct levels, do not conflate

| Term | Definition |
|---|---|
| **CalendarState** | The 4-value state (`unavailable` \| `open` \| `reserved` \| `booked`) shown at month/week/year view, to *everyone* — public and logged-in customers alike. `unavailable` means no DayMode has been set yet (not bookable at all). Derived from underlying DayMode + Booking data per the rules in `PRD.md` §9, never stored as its own field. |
| **RoomStatus** | The per-Room detail (`open` \| `booked`) visible only in the **day-detail view**, reachable only after a customer logs in and selects a specific date. Distinct from CalendarState — CalendarState is the coarse color shown on the calendar grid; RoomStatus is the room-by-room breakdown shown after drilling in. |

## Booking lifecycle

| Term | Definition |
|---|---|
| **BookingStatus** | The Booking's own status: `reserved` → `booked` \| `declined` \| `cancelled`. A `reserved` Booking (pending payment/approval) does NOT prevent new customers from reserving the same room/dates — multiple customers can have simultaneous `reserved` bookings for the same dates, and the admin approves/declines them. Only `booked` (admin-confirmed) bookings prevent new reservations. A `reserved` Booking causes a date to show `reserved` CalendarState; a `booked` Booking (when all rooms are booked) causes `booked` CalendarState. `cancelled` is terminal, distinct from `declined` (see CustomerCancellation below), and every date-blocking query stops counting a Booking the moment it reaches `cancelled`. |
| **ApprovalVote** | One Admin's decision (`approve` \| `decline`) on a specific Booking. Two distinct Admins' `approve` votes move a Booking to `booked`. One `decline` vote moves it to `declined` immediately — no tiebreaker exists. |
| **Required approvals** | Always 2, fixed — not configurable per booking in this version. |
| **BookingWindow** | The rolling 90-day range from today within which customers can view/book dates. Recalculates daily; not a fixed date range. Admin views/configuration (DayMode) are not restricted to this window — admins can plan further ahead. |
| **BulkDayModeAssignment** | An admin action that sets DayMode for multiple dates matching a pattern (e.g. "all weekends in this range") in a single operation, instead of one date at a time. |
| **DayModeSwitchBlock** | The rule that a date's DayMode cannot be changed while a conflicting Booking (`reserved` or `booked`) exists under the current mode for that date. The admin must resolve the existing booking first. |
| **CustomerCancellation** | **Superseded 2026-08-26.** A Customer may withdraw (move to `cancelled`) their OWN Booking, but only while it is still `reserved` — once `booked`, only an admin can cancel it. Withdrawal is immediate, self-service, and carries no ApprovalVote. Distinct from `declined`: `declined` is the two-admin process rejecting a Booking that was never confirmed; `cancelled` undoes a Booking that was already accepted, or was withdrawn by the customer before it got that far. See `docs/tasks.md` (Slice 13) and `MEMORY.md` (2026-08-26 entry). |
| **ApprovalQueueBlock** | Added 2026-08-27. Since several `reserved` Bookings may compete for the same BookableItem and overlapping dates (see BookingStatus above and `MAINTENANCE.md` §13), an `approve` ApprovalVote is refused (409) if a competing `reserved` Booking has a stronger claim: one with an advance payment recorded always outranks one without, regardless of submission order; otherwise earlier submission wins. The response names the stronger Booking so the admin can act on it directly. A `decline` vote is never subject to this — it only frees a date, so there is nothing to jump ahead of. |

## Pricing — out of scope this version
No pricing terms are active in this version (Quotation/BaseRate dropped from scope — see
`PRD.md` §4). If pricing is added in a future version, define terms here before building it,
don't reintroduce silently.

## Capacity & advance payment terms

| Term | Definition |
|---|---|
| **Capacity** | Max guest count for a BookableItem (Room or Villa), set by an admin. Bookings requesting more guests than Capacity are rejected server-side. |
| **AdvancePaymentNotice** | The fixed, non-dynamic text shown to a customer during booking stating that an advance payment is required to confirm — no amount, no payment collection in-app. Distinct from `AdvancePayment` (below), which is the actual manually-recorded amount an admin later enters once payment is received. |

## Content terms

| Term | Definition |
|---|---|
| **DefaultNotes** | The single, site-wide block of booking terms/notes, admin-editable, shown to every customer regardless of which BookableItem they're booking. |
| **CustomNotes** | Notes specific to one BookableItem (a particular Room, or the Villa), admin-editable, shown in addition to DefaultNotes when that item is selected. |

## Payment terms

| Term | Definition |
|---|---|
| **PaymentStage** | `unpaid` \| `advance_paid` \| `fully_paid` \| `refunded` — recorded manually by an admin. No in-app payment collection in this version. |
| **AdvancePayment** | A partial payment amount + date, recorded manually. |

## Forbidden / avoided terms
- **"Reservation"** as an entity name — use only **Booking** for the entity. (The status value
  `reserved` is still correct — that's a state, not an alternate entity name.)
- **"Confirmed"** — avoided in favor of **booked**, so there's exactly one term for the
  fully-approved state.
- **"Property"** alone — ambiguous between the whole business and a BookableItem; use **Room**,
  **Villa**, or **BookableItem** (generic) specifically.
- **"Availability"** alone, in code/API names — be specific: **CalendarState** (coarse,
  month view) or **RoomStatus** (detailed, day-drill-in view). Using a generic "availability"
  field name would blur these two genuinely different concepts.
