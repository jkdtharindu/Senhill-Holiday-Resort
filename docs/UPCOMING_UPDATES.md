# Upcoming Updates & Future Requirements

**Last Updated:** 2026-08-26 | **Owner:** Tharindu | **Status:** In Planning

---

## 0. Priority Roadmap

### ✅ Recently Completed

- [x] **Customer day-detail with room thumbnail images** (2026-08-26)
  - Completed: Customers now see all room images in day-detail view (vertical list layout)
  - Displays: Room name, capacity, all thumbnail images (multiple per room), and booking status
  - Files affected: `src/lib/day-detail.ts`, `src/lib/day-detail-service.ts`, `src/app/(guest)/calendar/[date]/page.tsx`
  - Images load in display order, responsive thumbnail size (h-16 w-24)
  - Status: ✅ Live on main branch

### 🔴 Immediate (Current Sprint) — New Build Order

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

- [ ] **3. Email Notifications** (SendGrid/Resend)
  - Why: Guests don't know booking received; admins have no alerts
  - Complexity: Medium
  - Impact: Critical operational visibility
  - Files: New `src/services/email.ts`, env config, API routes
  - Status: **THIRD PRIORITY**

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

**Build Order (Owner Approved 2026-08-26):**

1. **Reserve Request for Reserved Bookings** — Allow guests to submit multiple reserve requests while awaiting approval
   - Enables better booking management UX
   - No schema changes needed (uses existing bookings table)
   - Medium complexity

2. **Booking Cancellation System** — Full cancellation workflow with refunds & date recovery
   - Schema changes (add `cancelled` status, timestamps)
   - Cancellation refund calculation logic
   - Customer + admin UI
   - Audit logging
   - High complexity

3. **Email Notifications** — Send emails on booking events (reserve, approval, cancellation)
   - SendGrid/Resend integration
   - Templates for guest & admin emails
   - Medium complexity

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

### General
- All three features should follow HITL guidelines (see docs/HITL.md)
- Each feature requires Claude model selection check (see docs/MODEL_SELECTION.md)
