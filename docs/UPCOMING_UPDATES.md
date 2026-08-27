# Upcoming Updates & Future Requirements

**Last Updated:** 2026-08-27 | **Owner:** Tharindu | **Status:** In Planning

---

## 0. Priority Roadmap

### ✅ Recently Completed

- [x] **Customer day-detail with room thumbnail images** (2026-08-26)
  - Completed: Customers now see all room images in day-detail view (vertical list layout)
  - Displays: Room name, capacity, all thumbnail images (multiple per room), and booking status
  - Files affected: `src/lib/day-detail.ts`, `src/lib/day-detail-service.ts`, `src/app/(guest)/calendar/[date]/page.tsx`
  - Images load in display order, responsive thumbnail size (h-16 w-24)
  - Status: ✅ Live on main branch

- [x] **Admin calendar with color-coded availability at a glance** (2026-08-27)
  - Completed: New "Availability at a glance" panel on `/admin/calendar`, above the existing
    DayMode-configuration grid — same 4-colour CalendarState scheme the guest `/calendar` page
    already used (green=open, amber=partly taken, red=fully booked, grey=not yet opened), so an
    admin scanning for "what needs attention" learns one palette, not two.
  - Click-to-expand inline: clicking a date fetches `GET /api/calendar/:date` (the endpoint
    already returned admin-detail — guest name, phone, payment stage — when an admin session is
    present; no new endpoint needed) and renders the per-room breakdown, including thumbnails
    from the day-detail image feature above, directly below the grid. Clicking the same date
    again collapses it. No navigation away from the calendar page.
  - Files affected: new `src/app/admin/(panel)/calendar/availability-calendar.tsx` (client
    component owning the click/fetch/expand state), `src/app/admin/(panel)/calendar/page.tsx`
    (fetches `fetchCalendarDays` alongside the existing DayMode query, builds a second month
    grid keyed on CalendarState)
  - Verified: production build succeeds, all 183 existing unit tests still pass, manually
    exercised in the browser — grid renders correct colours from live data, click expands the
    right date's rooms with images loaded, re-click collapses, network tab confirms the admin
    (not customer) response shape is returned.
  - Customer-facing color-coded calendar was **already built** (Slice 6/12) at
    `src/app/(guest)/calendar/page.tsx` using the identical `CalendarState`/`STATE_CLASSES`
    scheme — no separate work needed there; this admin panel now matches it exactly.
  - Status: ✅ Live on main branch

- [x] **Approval queue block — prevent approving out of turn** (2026-08-27)
  - Completed: `POST /bookings/:id/vote` now hard-blocks (409) an `approve` vote when another
    `reserved` booking on the same item, with overlapping dates, has a stronger claim — an admin
    can no longer accidentally confirm a later reservation while an earlier/paid one for the
    same dates is still sitting undecided.
  - Priority rule (owner decision): a booking with an advance payment recorded always outranks
    one without, regardless of submission order; between two unpaid or two paid bookings,
    earlier wins. `decline` is never blocked — it only frees a date.
  - Response names the stronger booking (`blocked_by: { bookingId, guestName }`); the admin
    booking-detail page now shows a direct link to it inside the error alert.
  - Files affected: `src/lib/vote.ts` (new `findApprovalQueueBlocker`, extended
    `decideVoteOutcome`, 11 new unit tests), `src/lib/vote-service.ts` (fetches competing
    `reserved` bookings on the same item/overlap, only for an approve vote),
    `src/app/api/bookings/[id]/vote/route.ts` (surfaces `blocked_by`),
    `src/app/admin/(panel)/bookings/[id]/vote-panel.tsx` (renders the link)
  - Verified: production build succeeds, all 194 unit tests pass (24 in vote.test.ts alone,
    covering every priority-tier combination and that decline is never blocked).
  - See `docs/MAINTENANCE.md` §13 and `docs/API_DOCUMENTATION.md`'s `/vote` section for the
    full design rationale.
  - Status: ✅ Live on main branch

- [x] **DayMode clearing — unset a date back to "not bookable"** (2026-08-27)
  - Completed: admins can now clear a previously-set `room_mode`/`villa_mode` date back to unset,
    for renovations or special closures. Same booking-conflict rule as a mode switch — a date
    with an active booking under its current mode cannot be cleared.
  - Files affected: `src/lib/day-mode.ts`, `src/lib/day-mode-service.ts`, new `DELETE
    /api/calendar/day-mode`, `src/app/admin/(panel)/calendar/day-mode-controls.tsx`
  - Status: ✅ Live on main branch

- [x] **Email notifications (Resend)** — ✅ **SHIPPED 2026-08-27** (Sonnet 5, no exception)
  - Was priority 3 below; built ahead of Reserve Request at the owner's request, alongside the
    contact page.
  - Built: guest confirmation + admin alert on `POST /bookings`; approved/declined on the
    resolving vote; cancellation confirmation. `src/lib/email.ts` (Resend wrapper, best-effort,
    never throws), `src/lib/email-templates.ts` (one function per event), `src/lib/
    notification-recipients.ts` (active-admin lookup). Every send fires only after its write
    transaction commits, so mail failure/latency can never affect the booking/vote/cancellation
    itself.
  - Resolves `docs/MAINTENANCE.md` §5, previously flagged as "the largest operational risk in
    the system."
  - Cost: Resend free tier (100/day, 3,000/month) — well within this property's expected volume.
  - See `docs/API_DOCUMENTATION.md`'s "Email Notifications" section for the full mechanism.
  - Status: ✅ Live on main branch

- [x] **Email send log + volume circuit breaker** (2026-08-27)
  - Completed: `email_log` table recording every send attempt (including ones that never leave),
    a hard circuit breaker at 80 recipients/resort-local-day, a dashboard warning from 30/day,
    and an admin "Recent email activity" panel showing failures with their reasons inline.
  - Why: `sendEmail` swallows its own errors by design so mail can't break a booking — which is
    also why the 2026-08-27 outage produced no signal for hours. This makes that silence visible.
  - Files: new `src/lib/email-log.ts` (pure, 12 tests), `src/lib/email-log-service.ts`,
    `drizzle/0003_email_log.sql`, plus `email.ts`, `badge.tsx` and the admin dashboard
  - Migration applied to the live database with owner approval; verified end-to-end with a real
    send, not just a green build.
  - Not built: delivery confirmation (needs Resend webhooks), retries, push alerting.
  - Status: ✅ Live on main branch

- [x] **Contact page** (2026-08-27)
  - Completed: public `/contact` with phone numbers, email addresses, and a map to the property,
    plus a notice asking guests to call ahead and confirm the final approach road — guards
    against the map's routing being wrong or stale on a rural access road.
  - Files affected: new `src/app/(guest)/contact/page.tsx`, `src/lib/contact-info.ts` (shared
    with the email templates' footer so contact details can't drift between the two surfaces)
  - Status: ✅ Live on main branch

### 🔴 Immediate (Current Sprint) — New Build Order

- [ ] **0. Verify a sending domain so guests actually receive email** — ⚠️ **BLOCKING FOR LAUNCH**
  - Why: an unverified Resend account only accepts mail addressed to the account owner. Real
    guests currently receive **nothing** — their confirmation is rejected and logged as `failed`.
    Discovered by a real production booking on 2026-08-27, not in testing.
  - Status: **deferred on cost, not on judgement.** The business is pre-revenue; a domain is
    ~$12/yr and not affordable yet (owner decision, 2026-08-27). `EMAIL_RESTRICT_TO` is set in
    Vercel as an interim so the owner at least gets alerted to new bookings.
  - Route A (preferred): buy a domain → verify at resend.com/domains → point `EMAIL_FROM` at it
    → **unset `EMAIL_RESTRICT_TO`**. No code change. Also retires the `*.vercel.app` address.
  - Route B (free): switch to Gmail SMTP with an app password (500/day). Code change confined to
    `src/lib/email.ts`; guests would see a personal Gmail address as the sender.
  - Interim reality: staff confirm bookings by phone, which the manual-approval flow already
    required. Two of the three admins are not being emailed and must check the panel.
  - See `docs/MAINTENANCE.md` §5 for the full trade-off and the exact provider error.

- [ ] **1. Reserve Request for Reserved Bookings** (Allow guests to re-submit for dates in `reserved` state)
  - Why: Guests should be able to request alternative dates while their original booking is pending review
  - Complexity: Medium
  - Impact: Better UX for booking management during approval phase
  - Files: New `src/app/api/bookings/[id]/reserve-request/route.ts`, `src/lib/reserve-request.ts`, UI updates
  - Status: **NEXT TO BUILD**

- [x] **2. Booking Cancellation System** — ✅ **SHIPPED 2026-08-26** (Opus 5, no exception)
  - Built: `POST /bookings/:id/cancel`, `src/lib/cancellation.ts` (17 unit tests),
    `src/lib/cancellation-service.ts`, guest withdraw button, admin cancel panel
  - Migration `0002_booking_cancellation.sql` applied to production Neon and verified
  - Rules as decided: admin cancels any live booking; guest withdraws own `reserved` only;
    immediate with no approval vote; **no refund calculation** (record-only — pricing is out
    of scope per PRD §4, so an admin sets `paymentStage` to `refunded` by hand)
  - Date recovery required no code: every blocking query already uses a status allowlist
  - See `docs/API_DOCUMENTATION.md` and `docs/tasks.md` for the full verification log

- [x] **3. Email Notifications (Resend)** — ✅ **SHIPPED 2026-08-27** (Sonnet 5, no exception),
  built ahead of its listed priority order, at the owner's request, alongside the contact page.
  See the "Recently Completed" entry above for the full summary.

- [ ] **Restrict crops/uploads to known product origins**
  - Why: Security — prevent malicious file types
  - Complexity: Low
  - Impact: Prevents file-based attacks
  - Files: `src/lib/validation.ts`, upload route

### 🟡 Short-term (Next 2 Weeks)

- [ ] **BTree-GIST PostgreSQL exclusion constraints**
  - Why: Database-level enforcement of non-overlapping dates for `booked` bookings
  - Complexity: High
  - Impact: Eliminates race condition window entirely
  - Depends-on: Current code already handles `reserved` vs `booked` distinction
  - Files: `migrations/`, `src/db/schema.ts`

- [ ] **Admin login cleanup automation** (cron job)
  - Why: `admin_login_attempts` table grows forever (see MAINTENANCE.md §4)
  - Complexity: Medium
  - Impact: Database maintenance, keeps logs clean
  - Files: `src/api/cron/cleanup-login-attempts.ts` (or scheduled task)

- [ ] **Image malware scanning**
  - Why: Prevent malicious images in room/villa uploads
  - Complexity: Medium
  - Impact: Security hardening for file uploads
  - Options: ClamAV, VirusTotal API, or third-party scanning service

### 🟢 Nice-to-Haves (Post-MVP)

- [ ] Dark mode end-to-end testing
- [ ] CSV export for bookings
- [ ] Bulk email to guests (e.g., "resort closed Dec 25-26")
- [ ] Keyboard shortcuts in admin panel
- [ ] Customer feedback channel (form/email/Slack)

---

---

## 1. Reserve Request for Reserved Bookings

### Overview
Allow guests to submit additional reserve requests for alternative dates **while their current booking is in `reserved` status** (pending admin approval).

### Use Case
A guest submits a booking for dates A-B. While awaiting approval, they want to also request dates C-D as a backup. Both requests remain visible in their "My bookings" list, each with its own approval status.

### Current State
- Guests can submit one booking request at a time
- While awaiting approval (status = `reserved`), they cannot request alternative dates
- System forces them to wait for approval/decline before requesting other dates

### Requirements

#### 1.1 UI Changes (Guest-Facing)
- [ ] Add "Request alternative dates" button on `(guest)/my-bookings/page.tsx` when viewing a `reserved` booking
- [ ] Navigate to booking form with a modal/overlay showing:
  - Current pending booking details (read-only)
  - New date range picker for the alternative request
  - Submit button that creates a NEW booking (separate row in my-bookings)
  - Both bookings remain visible with their own statuses

#### 1.2 API Changes
- [ ] New endpoint: `POST /api/bookings/[id]/reserve-request` (or just use existing POST /api/bookings with a reference to the original)
  - Input: new `check_in`, `check_out`, `guests_count` (other fields inherited from original booking)
  - Output: new booking created with status = `reserved`
  - No validation change needed — uses existing booking validation logic

#### 1.3 Business Logic
- [ ] Multiple reserve requests allowed for the same guest (they can stack up to 3-5 pending requests)
- [ ] Each reserve request is **independent** — approval/decline of one does not affect others
- [ ] If one reserve request is approved (`booked`), the guest still sees other `reserved` requests
- [ ] Optional: Add a limit to prevent abuse (e.g., max 3 simultaneous `reserved` bookings per guest)

#### 1.4 Database
- [ ] No schema changes needed — each reserve request is just another row in `bookings` table
- [ ] Consider adding an optional `reference_booking_id` column to link related requests together (for reporting/UX)

#### 1.5 Testing
- [ ] Guest can create multiple reserve requests for same item
- [ ] Each request appears separately in my-bookings
- [ ] Approve/decline one does not affect others
- [ ] Both `reserved` and `booked` requests visible together

---

## 2. Booking Cancellation System

### Overview
Enable customers and admins to cancel bookings with proper refund handling and date recovery.

### Current State
- **NOT implemented** — booking system only supports: `reserved`, `booked`, `declined` statuses
- No cancellation UI (customer-facing or admin-facing)
- No refund logic
- Dates cannot be freed back to calendar once booked

### Requirements

#### 2.1 Database Schema Changes
- [ ] Add `"cancelled"` to `bookingStatus` enum in `src/db/schema.ts`
- [ ] Add `cancelledAt` timestamp field to `bookings` table
- [ ] Add `cancelledBy` UUID field (admin who cancelled, if admin-initiated; null if customer-initiated)
- [ ] Add cancellation reason/notes field (e.g., "Customer requested", "No-show policy", etc.)

#### 2.2 Business Rules
- [ ] Define cancellation window (e.g., full refund if >30 days before check-in, partial if 7-30 days, non-refundable if <7 days)
- [ ] Decide: who can initiate cancellation? (customer only, admin only, or both?)
- [ ] Decide: does cancellation require approval votes like bookings? Or is it auto-approved within policy window?
- [ ] When cancelled: immediately free dates back to calendar (set day mode back to available for re-booking)

#### 2.3 Customer-Facing Features
- [ ] Add "Cancel Booking" button on `(guest)/my-bookings/page.tsx`
- [ ] Create cancellation confirmation modal (show cancellation policy, refund amount)
- [ ] Add cancellation request endpoint: `POST /api/bookings/:id/cancel`
- [ ] Show cancellation status in booking details
- [ ] Email confirmation to customer when cancelled

#### 2.4 Admin-Facing Features
- [ ] Add "Cancel" action in admin booking detail view (`admin/.../bookings/[id]/page.tsx`)
- [ ] Optional: approval workflow (maybe cancellations need 1 vote to approve?)
- [ ] Show cancellation history in booking audit log
- [ ] Filter bookings by `cancelled` status in admin list

#### 2.5 Refund Handling
- [ ] Add refund logic service (calculate refund % based on cancellation date vs check-in)
- [ ] Update `paymentStage` enum to support `refund_initiated`, `refund_completed` (or extend current `refunded`)
- [ ] Log refund amount and reason in audit trail
- [ ] **NOTE:** Actual payment processing (Stripe, PayPal, etc.) is out of scope per PRD §4 — track as manual refund record only

#### 2.6 API Routes
- **POST** `/api/bookings/:id/cancel` — Customer or admin initiates cancellation
- **GET** `/api/bookings/:id/cancellation-policy` — Returns refund % based on dates (optional, for frontend)

#### 2.7 Testing
- [ ] Unit tests for cancellation refund calculation
- [ ] Unit tests for date recovery logic (freed dates should re-open for booking)
- [ ] Integration tests: cancel → dates freed → new booking created on same dates
- [ ] Audit log verification: every cancellation logged with admin name and reason

---

## 3. Model Switching After Bookings (Already Protected)

### Status: ✅ **IMPLEMENTED**

The system already prevents admins from switching day modes (room-basis ↔ full villa) when bookings exist:
- Check `src/lib/day-mode.ts:170-176` — blocks switches if active bookings under current mode exist
- Response: "Existing booking under current mode"

**No action needed** — this is working as designed.

---

## 4. Future Enhancements (Post-MVP)

### 4.1 Cancellation Policy Customization
- [ ] Allow admins to define custom refund tiers (% back vs days-before-arrival)
- [ ] Support per-item cancellation policies (e.g., villa has stricter terms than rooms)
- [ ] Display policy on booking confirmation screen

### 4.2 Cancellation Analytics
- [ ] Track cancellation rate by item, date, customer
- [ ] Report: % of bookings cancelled in last 30/90 days
- [ ] Early warning: flag customers with multiple cancellations

### 4.3 Auto-Cancellation for No-Shows
- [ ] If guest doesn't show by check-in + grace period (e.g., 24h), auto-cancel
- [ ] Log as system cancellation (no admin action)
- [ ] Refund policy: non-refundable (as per typical hospitality rules)

### 4.4 Cancellation Notifications
- [ ] Email guest: "Your cancellation has been received" + refund timeline
- [ ] Email admin: "Booking [X] cancelled by [customer/admin]" + refund amount
- [ ] Optional: SMS notification for urgent cancellations

### 4.5 Group/Multi-Booking Cancellation
- [ ] Support cancelling entire booking groups at once
- [ ] Cascading refunds across related bookings

---

## Implementation Priority

**Build Order (Owner Approved 2026-08-26; email notifications reordered ahead of Reserve Request
at the owner's request on 2026-08-27 — see the "Recently Completed" entries above):**

1. **Reserve Request for Reserved Bookings** — Allow guests to submit multiple reserve requests while awaiting approval
   - Enables better booking management UX
   - No schema changes needed (uses existing bookings table)
   - Medium complexity
   - Status: not yet built — still next

2. **Booking Cancellation System** — Full cancellation workflow with refunds & date recovery
   - Schema changes (add `cancelled` status, timestamps)
   - Cancellation refund calculation logic
   - Customer + admin UI
   - Audit logging
   - High complexity
   - Status: ✅ shipped 2026-08-26 (no refund calculation — record-only, see the entry above)

3. **Email Notifications** — Send emails on booking events (reserve, approval, cancellation)
   - Resend integration
   - Templates for guest & admin emails
   - Medium complexity
   - Status: ✅ shipped 2026-08-27, ahead of its listed order

---

## Notes for Implementer

### Reserve Requests
- Multiple reserve requests allowed for same guest (stacking pending requests)
- Each is independent — approval of one doesn't affect others
- Optional: Add `reference_booking_id` for linking related requests

### Cancellation
- Cancellation is **not** the same as declining a booking (which happens via votes)
- Dates freed by cancellation should immediately become available; consider bulk re-opening if many cancelled at once
- Refund % should be calculated at **cancellation time**, not payment time, for accuracy
- Keep cancellation reason audit trail detailed — may be needed for disputes
- **As built:** no refund % is calculated anywhere — pricing is out of scope (PRD §4). See the
  "Booking Cancellation System" entry above.

### Email Notifications (as built, 2026-08-27)
- Built as best-effort, fire-after-commit — a mail failure never affects the booking/vote/
  cancellation it's attached to. See `docs/ARCHITECTURE.md`'s "Email notifications" section.
- Templates are plain functions in `src/lib/email-templates.ts`, not database rows — kept
  editable as code for now rather than building an admin-editable system pre-emptively.
- No SMS/WhatsApp, no delivery tracking/retry, no guest opt-out. See `docs/MAINTENANCE.md` §5.

### General
- All three features should follow HITL guidelines (see docs/HITL.md)
- Each feature requires Claude model selection check (see docs/MODEL_SELECTION.md)
