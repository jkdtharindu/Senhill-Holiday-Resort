# Upcoming Updates & Future Requirements

Status: **In Planning** | Last Updated: 2026-08-26

---

## 1. Booking Cancellation System

### Overview
Enable customers and admins to cancel bookings with proper refund handling and date recovery.

### Current State
- **NOT implemented** — booking system only supports: `reserved`, `booked`, `declined` statuses
- No cancellation UI (customer-facing or admin-facing)
- No refund logic
- Dates cannot be freed back to calendar once booked

### Requirements

#### 1.1 Database Schema Changes
- [ ] Add `"cancelled"` to `bookingStatus` enum in `src/db/schema.ts`
- [ ] Add `cancelledAt` timestamp field to `bookings` table
- [ ] Add `cancelledBy` UUID field (admin who cancelled, if admin-initiated; null if customer-initiated)
- [ ] Add cancellation reason/notes field (e.g., "Customer requested", "No-show policy", etc.)

#### 1.2 Business Rules
- [ ] Define cancellation window (e.g., full refund if >30 days before check-in, partial if 7-30 days, non-refundable if <7 days)
- [ ] Decide: who can initiate cancellation? (customer only, admin only, or both?)
- [ ] Decide: does cancellation require approval votes like bookings? Or is it auto-approved within policy window?
- [ ] When cancelled: immediately free dates back to calendar (set day mode back to available for re-booking)

#### 1.3 Customer-Facing Features
- [ ] Add "Cancel Booking" button on `(guest)/my-bookings/page.tsx`
- [ ] Create cancellation confirmation modal (show cancellation policy, refund amount)
- [ ] Add cancellation request endpoint: `POST /api/bookings/:id/cancel`
- [ ] Show cancellation status in booking details
- [ ] Email confirmation to customer when cancelled

#### 1.4 Admin-Facing Features
- [ ] Add "Cancel" action in admin booking detail view (`admin/.../bookings/[id]/page.tsx`)
- [ ] Optional: approval workflow (maybe cancellations need 1 vote to approve?)
- [ ] Show cancellation history in booking audit log
- [ ] Filter bookings by `cancelled` status in admin list

#### 1.5 Refund Handling
- [ ] Add refund logic service (calculate refund % based on cancellation date vs check-in)
- [ ] Update `paymentStage` enum to support `refund_initiated`, `refund_completed` (or extend current `refunded`)
- [ ] Log refund amount and reason in audit trail
- [ ] **NOTE:** Actual payment processing (Stripe, PayPal, etc.) is out of scope per PRD §4 — track as manual refund record only

#### 1.6 API Routes
- **POST** `/api/bookings/:id/cancel` — Customer or admin initiates cancellation
- **GET** `/api/bookings/:id/cancellation-policy` — Returns refund % based on dates (optional, for frontend)

#### 1.7 Testing
- [ ] Unit tests for cancellation refund calculation
- [ ] Unit tests for date recovery logic (freed dates should re-open for booking)
- [ ] Integration tests: cancel → dates freed → new booking created on same dates
- [ ] Audit log verification: every cancellation logged with admin name and reason

---

## 2. Model Switching After Bookings (Already Protected)

### Status: ✅ **IMPLEMENTED**

The system already prevents admins from switching day modes (room-basis ↔ full villa) when bookings exist:
- Check `src/lib/day-mode.ts:170-176` — blocks switches if active bookings under current mode exist
- Response: "Existing booking under current mode"

**No action needed** — this is working as designed.

---

## 3. Future Enhancements (Post-MVP)

### 3.1 Cancellation Policy Customization
- [ ] Allow admins to define custom refund tiers (% back vs days-before-arrival)
- [ ] Support per-item cancellation policies (e.g., villa has stricter terms than rooms)
- [ ] Display policy on booking confirmation screen

### 3.2 Cancellation Analytics
- [ ] Track cancellation rate by item, date, customer
- [ ] Report: % of bookings cancelled in last 30/90 days
- [ ] Early warning: flag customers with multiple cancellations

### 3.3 Auto-Cancellation for No-Shows
- [ ] If guest doesn't show by check-in + grace period (e.g., 24h), auto-cancel
- [ ] Log as system cancellation (no admin action)
- [ ] Refund policy: non-refundable (as per typical hospitality rules)

### 3.4 Cancellation Notifications
- [ ] Email guest: "Your cancellation has been received" + refund timeline
- [ ] Email admin: "Booking [X] cancelled by [customer/admin]" + refund amount
- [ ] Optional: SMS notification for urgent cancellations

### 3.5 Group/Multi-Booking Cancellation
- [ ] Support cancelling entire booking groups at once
- [ ] Cascading refunds across related bookings

---

## Implementation Priority

**Phase 1 (MVP):**
1. Schema changes (add `cancelled` status, timestamps)
2. Cancellation refund calculation logic
3. Customer cancellation endpoint + UI
4. Admin cancellation endpoint + UI
5. Audit logging

**Phase 2 (Polish):**
- Refund policy customization
- Auto-cancellation for no-shows
- Analytics & reporting

**Phase 3 (Nice-to-Have):**
- SMS notifications
- Group cancellations

---

## Notes for Implementer

- Cancellation is **not** the same as declining a booking (which happens via votes)
- Dates freed by cancellation should immediately become available; consider bulk re-opening if many cancelled at once
- Refund % should be calculated at **cancellation time**, not payment time, for accuracy
- Keep cancellation reason audit trail detailed — may be needed for disputes
