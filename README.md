# Senhill Holiday Resort — Hedigalle
## Hotel & Villa Booking System with Admin Approval

Planning-stage documentation for Senhill Holiday Resort's booking platform: individual rooms or
the whole villa, admin-controlled per-day mode (room basis vs. villa-only basis), two-admin
approval before a booking is confirmed, and manual payment tracking.

**Status: docs finalized and reconciled at build kickoff (2026-08-23) — no code written yet.**
See `tasks.md` for the build order, the full decision history, and the short list of items still
waiting on the owner (second admin account, room inventory, photo mapping, notes copy).

## Documentation index
- `PRD.md` — problem, personas, functional requirements, the DayMode/CalendarState mechanic
  (read this one first — it's the core of the whole system), BookingWindow rule, success metrics
- `UBIQUITOUS_LANGUAGE.md` — glossary; match these terms exactly in code (don't invent synonyms)
- `DATABASE_SCHEMA.md` — tables, columns, relationships, derived-value rules
- `API_DOCUMENTATION.md` — every planned endpoint, request/response shapes
- `ARCHITECTURE.md` — stack decisions and why, security posture, persistence requirement
- `GOOGLE_OAUTH_SETUP.md` — step-by-step Google Sign-In setup via NextAuth.js (written for
  zero prior OAuth experience)
- `HITL.md` — actions that require explicit human approval before proceeding
- `tasks.md` — build checklist in vertical slices, plus the full decision log

## Quick summary of the core mechanic
Every calendar date is set by an admin to one of two modes — individually, or in bulk by
pattern (e.g. "all weekends in this range"):
- **room_mode** — individual rooms are bookable that day
- **villa_mode** — only the whole villa is bookable that day

Mutually exclusive by design, which is what keeps room and villa bookings from ever conflicting
over the same dates — see `PRD.md` §9. A date's mode is **blocked from switching** if a
conflicting booking already exists under the current mode — the admin must resolve it first.

Customers can only view/book within a **rolling 90-day window** from today; admins aren't
restricted by that window and can configure further ahead.

The public/customer calendar shows a simple 4-color state per day (`unavailable` / `open` /
`reserved` / `booked`). Logging in and picking a specific date reveals more detail (per-room
status). Only admins see guest identity and full booking details.

## Key decisions locked in
1. **No default DayMode** — unconfigured dates are `unavailable` until an admin opens them.
2. **No customer self-cancellation** — only an admin can move a booking out of `reserved`.
3. **No pricing in-app anywhere** — customers see a fixed notice that an advance payment is
   required; the amount and collection happen entirely outside the system, manually.
4. **Multi-night bookings** require the whole range to be conflict-free, or the request is
   rejected with the specific conflicting date(s) named.
5. **Capacity** is enforced server-side per Room/Villa.
6. **DayMode switching is blocked** while conflicting bookings exist under the current mode.
7. **Google Sign-In** (customers only) uses NextAuth.js — the simpler path recommended given no
   prior OAuth experience. Admins use a fully separate email/password system.
8. **Database must be real, persistent, always-on Postgres from day one** — no demo/in-memory
   fallback, even in local development.
9. **Images on Vercel Blob** — chosen over Supabase Storage/S3 since hosting is already Vercel.
10. **All dates resolve in `Asia/Colombo`** — never UTC or server-local. Vercel runs UTC, 5.5h
    behind; untreated, "today" would roll at 05:30 local and shift the booking window and every
    calendar colour by a day for part of each night.
11. **`check_in`/`check_out` are half-open** — a 10th→13th stay occupies the 10th, 11th and 12th;
    the 13th is free for the next arrival.
12. **Advance-only money fields** — `total_amount`/`balance_due` dropped as pricing;
    `advance_amount`/`advance_paid_date` kept as admin-only record-keeping. No number is ever
    shown to a customer.

## Project specifics
- **Property:** Senhill Holiday Resort, Hedigalle. Logo/branding deferred — not needed yet.
- **First Super Admin:** `jkdtharindu@gmail.com` (seeded at Slice 2).
- **Hosting:** Vercel, confirmed. Database: Neon recommended (native Vercel integration).
- **Room/Villa content:** real data (rooms, capacity, images, notes) will be entered manually by
  the admin via the panel once built — the initial build uses clearly-labeled placeholder data.

## Stack
Next.js 14 (App Router, TypeScript) + PostgreSQL (Neon) + Vercel Blob for images +
NextAuth.js for customer Google auth. See `ARCHITECTURE.md` for full rationale.
"# Senhill-Holiday-Resort" 
