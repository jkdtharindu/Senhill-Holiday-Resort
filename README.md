# Senhill Holiday Resort — Hedigalle
## Hotel & Villa Booking System with Admin Approval

Senhill Holiday Resort's booking platform: individual rooms or the whole villa, admin-controlled
per-day mode (room basis vs. villa-only basis), two-admin approval before a booking is confirmed,
and manual payment tracking.

**Status: Slices 1–12 complete and deployed to Vercel (2026-08-25).** Live at
https://senhill-holiday-resort.vercel.app. Full stack: Next.js + Postgres (Neon) + NextAuth.js
(Google Sign-In for guests, email/password for admins), all 14 frontend screens (7 guest + 7 admin),
all API endpoints, DayMode switching with conflict detection, two-admin booking approval, payment
tracking, audit logging. Awaiting owner for final content (room names/capacities, branding, notes).
See `docs/tasks.md` for the full build order and `docs/DEPLOYMENT_STATUS.md` for deployment log.

## Getting started

You need a Neon Postgres database first — there is deliberately no offline or in-memory mode,
because bookings and approvals are meaningless if they do not survive a restart.

```bash
cp .env.example .env.local   # then paste your Neon connection string into it
npm install
npm run db:migrate           # creates all 9 tables
npm run db:seed              # first super_admin + placeholder rooms
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Runs the test suite (no database needed) |
| `npm run typecheck` | TypeScript check with no build |
| `npm run build` | Production build — same one Vercel runs |
| `npm run db:generate` | Writes a new migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:studio` | Opens a browser UI to inspect the database |
| `npm run db:seed` | Seeds the super admin, placeholder rooms, and site settings |

`.env.local` holds every secret and is git-ignored. Never commit it. If a credential does get
committed, rotate it — deleting it in a later commit does not remove it from git history.

## Documentation index
- `docs/PRD.md` — problem, personas, functional requirements, the DayMode/CalendarState mechanic
  (read this one first — it's the core of the whole system), BookingWindow rule, success metrics
- `docs/UBIQUITOUS_LANGUAGE.md` — glossary; match these terms exactly in code (don't invent synonyms)
- `docs/DATABASE_SCHEMA.md` — tables, columns, relationships, derived-value rules
- `docs/API_DOCUMENTATION.md` — every planned endpoint, request/response shapes
- `docs/ARCHITECTURE.md` — stack decisions and why, security posture, persistence requirement
- `docs/GOOGLE_OAUTH_SETUP.md` — step-by-step Google Sign-In setup via NextAuth.js (written for
  zero prior OAuth experience)
- `docs/HITL.md` — actions that require explicit human approval before proceeding
- `docs/MAINTENANCE.md` — decisions carrying a known trade-off, each with the condition under
  which it should be revisited once the app is live. Read the "Revisit when" lines first
- `docs/tasks.md` — build checklist in vertical slices, plus the full decision log

## Quick summary of the core mechanic
Every calendar date is set by an admin to one of two modes — individually, or in bulk by
pattern (e.g. "all weekends in this range"):
- **room_mode** — individual rooms are bookable that day
- **villa_mode** — only the whole villa is bookable that day

Mutually exclusive by design, which is what keeps room and villa bookings from ever conflicting
over the same dates — see `docs/PRD.md` §9. A date's mode is **blocked from switching** if a
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
- **First Super Admin:** supplied via `SEED_SUPER_ADMIN_EMAIL` in `.env.local` (seeded at
  Slice 2). Deliberately not committed — this repo is public, and naming the highest-privilege
  account in it is free reconnaissance for anyone reading. See `.env.example`.
- **Hosting:** Vercel (live: https://senhill-holiday-resort.vercel.app, deployed 2026-08-25). Database: Neon, live (Singapore region, same for local and production).
- **Room/Villa content:** the upload/edit panel is built (Slice 4) and real property photos are
  loaded. Room names and capacities are still the seeded placeholders — real values are still
  needed from the owner.

## Stack
Next.js 16 (App Router, TypeScript) + PostgreSQL (Neon) + Drizzle ORM + Vercel Blob for images +
NextAuth.js for customer Google auth. See `docs/ARCHITECTURE.md` for full rationale.
