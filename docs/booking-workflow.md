# Booking workflow, admin confirmation, and email notifications

Purpose
- Document the expected booking lifecycle, concurrency and payment policies, admin confirmation behavior, and email notification requirements. This is the canonical developer + product spec for how reservations, payments, and confirmations should operate going forward.

Scope
- Applies to both room-mode and villa-mode bookings.
- Uses the existing database fields and status names unless explicitly noted.

Key decisions (confirmed)
- Pre-confirmation state: use the existing status value `reserved` (no new DB-status added).
- Concurrency policy: allow multiple concurrent `reserved` bookings for the same date/resource; payments may be captured while bookings remain `reserved`. Admins are responsible for resolving conflicts (see conflict resolution below).
- Confirmation email: send an automated confirmation email to the customer when the booking reaches `booked` *and* an admin records the paid amount (i.e., the booking is both confirmed and paid). Admins and configured internal staff emails will also receive notification when admin marks booking as `booked` and records paid amount.
- Conflict auto-action on confirmation: when a booking is confirmed to `booked`, the system will automatically mark (auto-decline) other overlapping `reserved` bookings for the same bookable_item/date range. If those losers had recorded payments, the system will also flag them for refund processing (manual by default; auto-refund is a future enhancement).

Desired booking lifecycle (mapping to DB)
- reserved (pre-confirmation; customers can still create additional reserved bookings for the same slot)
- booked (finalized after two admin approvals and any admin-recorded payment step defined by admin workflow)
- declined (explicitly declined by admin or auto-declined by the system when another reservation is confirmed)

Concurrency and calendar implications
- Calendar derivation continues to show `reserved` dates (as today), since `reserved` reflects a soft hold and admin attention is required.
- Because multiple `reserved` rows may exist for the same date, calendar colour semantics remain: `reserved` means at least one reservation exists; `booked` means the slot is final and blocks further confirmations.
- Only `booked` should be considered the final blocker that prevents other bookings from being confirmed to `booked`.

Payment workflow
- Payments are recorded but not automatically captured by this system — payment processing is manual or handled by integrated payment provider outside this MVP.
- Data model: the existing columns `payment_stage`, `advance_amount`, and `advance_paid_date` are used to record payment status and timestamps. Keep using these fields.
- If a customer pays while their booking is `reserved`:
  - The system records the payment information (admin or payment webhook may populate `payment_stage` and `advance_paid_date`).
  - The booking remains `reserved` until admin votes/confirmations move it to `booked`.
  - When admin later confirms a booking to `booked`, if other overlapping `reserved` bookings exist and they recorded payments, those bookings will be auto-declined and flagged for refund.

Admin confirmation and email notification flow
- Approval: booking reaches `booked` when two distinct admins cast `approve` votes (existing `approval_votes` logic applies).
- Paid confirmation: an admin may record the paid amount and set `payment_stage` to `advance_paid` or `fully_paid`. For the email trigger we require both:
  - booking status = `booked`, and
  - `payment_stage` is updated to `advance_paid` or `fully_paid` with a non-null `advance_paid_date` and `advance_amount`.
- When both conditions are met, the system will:
  1) send an automated confirmation email to the customer (customer email on the booking), and
  2) optionally send a copy/notification to configured admin support emails (site settings or admin user list).
- The email template should be customizable (DB or file-based); use placeholders described below.

Email template placeholders (recommended)
- {{customer_name}} — guest name
- {{booking_id}} — booking UUID/reference
- {{resource_name}} — Room name or "Whole Villa"
- {{check_in}} / {{check_out}} — dates
- {{paid_amount}} — amount admin recorded
- {{paid_date}} — date admin recorded
- {{admin_name}} — confirming admin name
- {{support_contact}} — site admin contact info

Sample email subject and body (example)
- Subject: "Senhill Holiday Resort — Booking Confirmed ({{booking_id}})"
- Body (plain text / markdown):

  Dear {{customer_name}},

  Thank you — your booking for {{resource_name}} from {{check_in}} to {{check_out}} is now confirmed.

  Booking reference: {{booking_id}}
  Paid: {{paid_amount}} on {{paid_date}}

  If you have questions, contact us at {{support_contact}}.

  Best,
  Senhill Holiday Resort ({{admin_name}})

Logging & audit
- Persist an `email_log` entry for each outbound confirmation (suggested new table: `email_log` with booking_id, to_address, template, rendered_body, status, sent_at, attempt_count, response_text). If you prefer not to add a table yet, record an `booking_audit_log` row indicating that a confirmation email was sent and its basic metadata (recipient, template id, timestamp).
- Always write a `booking_audit_log` row for admin actions: marking `payment_stage`, setting `advance_amount`/`advance_paid_date`, and for the status transition reserved -> booked. This already exists; ensure the email send is also audited.

Conflict resolution details (when one booking becomes `booked`)
- In the same DB transaction that transitions a booking to `booked`, the system must:
  1) re-validate that no other booking is `booked` for the same resource/date range; if found, abort with 409.
  2) mark the target booking as `booked`.
  3) find overlapping `reserved` bookings and mark them `declined` (auto-decline). For each auto-declined booking, write booking_audit_log rows explaining the reason.
  4) for any auto-declined booking with `payment_stage != 'unpaid'`, flag it in the audit and create a refund task record (or enqueue a refund job). Refund execution is manual for MVP; add an admin dashboard list for "refunds to process".

Edge cases & recommended policies (MVP defaults)
- Pending expiry: implement a configurable expiry (recommend 48–72 hours) for `reserved` bookings without progress (no admin vote, no recorded payment). Expired reservations auto-decline and notify customer.
- Multiple paid reservations: MVP: do not auto-capture or auto-refund payments; instead, auto-decline losers and create a refund task for manual processing. Future enhancement: automatic refunds can be implemented when a payment provider supports idempotent refunds.
- Admin override: provide an admin action to manually set a booking `booked` even if it would cause auto-declines (super-admin override) — treat this carefully and audit it.

Implementation notes for developers
- No DB schema change required for MVP (we use existing `bookings.status`, `payment_stage`, `advance_amount`, `advance_paid_date`, `approval_votes`, `booking_audit_log`).
- Suggested optional additions:
  - `email_log` table (see earlier) to track sends and failures.
  - `refund_tasks` table or job queue entries to track payments needing refunds.
- Transactions & locking:
  - Wrap confirm + auto-decline + audit log writes in a single transaction with appropriate SELECT ... FOR UPDATE checks on the bookings involved.
  - Re-check availability in-transaction before committing to avoid race conditions.
- Tests to add:
  - Concurrent reserved creation and later confirm conflict resolution.
  - Confirm that booked status blocks further confirmations and that auto-declines occur.
  - Email send is triggered only when both booked and paid conditions are met.

Admin & customer email notification tasks (future work items to track in tasks.md)
- Task 1: Add an email template editor in admin panel (store templates in DB, support {% raw %}{{...}}{% endraw %} placeholders).
- Task 2: Implement `email_log` table and sending pipeline with retry/backoff and admin-visible failure reports.
- Task 3: Add refund task queue and admin UI to process refunds, with audit trail.
- Task 4: Implement configurable `reserved` expiry and automated decline job (cron or background worker).
- Task 5: Add notification preferences and admin distribution lists (support contact list in `site_settings`).
- Task 6: Add customer notifications for key events: reserved (optional), declined (required when auto-declined), booked (confirmation), refund processed.
- Task 7: End-to-end integration tests covering payment + booking + confirmation + auto-decline + refund flow.

Future workflows & roadmap (this stream)
- Phase A (Docs + small infra): add this docs/booking-workflow.md, add `email_log` and `refund_tasks` schema proposals, and add admin UI stubs for template and refund list.
- Phase B (MVP behavior): implement auto-decline on confirm, record refund tasks, implement email send on confirm+paid, log email sends.
- Phase C (Ops & automation): implement refund automation, waiting list promotion, and optional auto-refund for losers.
- All upcoming implementation work for booking confirmation, email facility, and refund handling will be tracked in docs/tasks.md and in future PRs on feature branches under this stream.

Cross-references & required doc updates
- PRD.md — add a short product-facing bullet summarizing the concurrency and email-confirmation behavior (I can submit a small PR to update PRD.md if you want).
- DATABASE_SCHEMA.md — references to `payment_stage` and `booking_audit_log` already exist. If you accept adding `email_log` or `refund_tasks`, I will prepare a migration proposal and update DATABASE_SCHEMA.md accordingly.
- MAINTENANCE.md — append an operational note that notifications are now enabled and to revisit delivery metrics and timeouts.
- UBIQUITOUS_LANGUAGE.md — recommended: update with explicit definitions for `reserved`, `booked`, `declined`, `payment_stage`, `advance_paid`, and `refund_task`. This improves clarity for product and devs.

Checklist for this PR (what will be included)
- New file: docs/booking-workflow.md (this file).
- Small follow-up PRs (tracked in tasks.md): admin UI changes, schema migrations (optional), email pipeline implementation, refund tasking.

Contact / owner
- Document owner: product or ops contact who will approve policy choices (please supply an email or name to record here).

---

End of booking-workflow.md (draft).