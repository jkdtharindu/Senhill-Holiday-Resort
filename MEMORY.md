# Memory

Decisions and schema changes logged with reasoning and rejected alternatives. Append-only, dated entries.

---

## 2026-08-24: Skipped three read-booking endpoints; fetch directly from server components instead

**Decision:** Do not build `GET /bookings/my`, `GET /bookings` (admin list), or `GET /bookings/:id` (admin detail).

**Why:** Every screen that would consume these is a Next.js server component rendering on the same server as the database. Having each page issue an HTTP request to its own API to re-authenticate and re-serialize rows it can already read is inefficient — it adds latency (round-trip through the network layer) and redundancy (session validation twice, rows fetched twice) for no benefit.

**The pattern instead:** Each page directly queries the database through Drizzle ORM service modules:
- Guest `/my-bookings` queries `bookings` directly, scoped by `session.user.id`.
- Admin `/admin/bookings` calls `fetchAdminBookings(filters)` from `src/lib/admin-bookings-service.ts`.
- Admin `/admin/bookings/[id]` calls `fetchAdminBooking(id)` from the same module.

URL query parameters (`?status=reserved&from=2026-09-10`) are passed as function arguments to the service — the filter set survives intact, so a filtered view remains a shareable link.

**Rejected alternative:** Build the three endpoints anyway as a matter of convention. Cost: every page would add unnecessary latency and re-validation, making the app slower than it needs to be for no user-facing benefit. The pattern that won here prioritizes local performance (same-server direct fetch) over API-first architecture (HTTP for everything).

**Revisit when:** A requirement outside this Next.js app needs booking data — a mobile client, an integration, a reporting tool. At that point, the three endpoints become real API surfaces that wrap the existing service functions. The service modules stay in `src/lib/`, and query logic lives in one place rather than being reimplemented per transport.

---

## 2026-08-25: First Vercel deployment — environment variable namespacing

**Decision:** Deploy app to Vercel using a single shared Neon PostgreSQL database URL across local and production environments, with all secrets (database URL, JWT secrets, OAuth credentials) stored only in `.env.local` (git-ignored locally) and Vercel's environment settings (never committed).

**Why:** The app has no offline mode by design — every booking and approval must persist immediately and be visible across concurrent admin sessions. A single production-grade Neon database URL applies from day one, used locally for development and in Vercel for production. Keeping secrets out of git (via `.gitignore` and GitHub's push protection) prevents credential leaks; Vercel's environment variables keep secrets away from the repo entirely.

**Environment variable naming:** The codebase reads `process.env.DATABASE_URL`, not `NEON_DATABASE_URL` or similar. Vercel environment variables use `DATABASE_URL` as the key, matching what the code expects. Initial mistake: named it `NEON_DATABASE_URL` in Vercel, which caused a 500 build error — corrected by renaming the key to `DATABASE_URL` and redeploying. All 5 required vars are now in Vercel Production: `DATABASE_URL`, `ADMIN_JWT_SECRET`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

**The pattern:** Same connection string points to the same Neon database whether running locally or on Vercel. Seed script (`npm run db:seed`) runs once per environment to populate initial data (first super admin, placeholder rooms/villa, site settings). Database schema (9 tables) was created locally with `npm run db:migrate`; the same schema applies on Vercel's production database.

**Rejected alternatives:**
1. Separate Neon databases for local and production — added complexity and drift risk; single database + seed idempotence is simpler.
2. Keep secrets in `.env` file and commit them — violates least-privilege and makes rotation difficult; Vercel environment variables are the correct layer.
3. Build read-only endpoints (`GET /bookings`) to serve UI — decided against at Slice 12; server components query the database directly instead, eliminating unnecessary HTTP round-trips and re-authentication.

**Revisit when:** Multi-region deployment or read replicas become necessary (after launch, if scaling demands it). At that point, secrets management stays the same (Vercel env vars), but database topology changes (replica for reads, primary for writes).

**Incidents and resolutions (2026-08-25):**
- Build error: `DATABASE_URL is not set` — renamed Vercel env var from `NEON_DATABASE_URL` to `DATABASE_URL`, redeployed. ✅
- Build error: `NEXTAUTH_SECRET is not set` — verified it was added to Vercel, redeployed. ✅
- Build error: `GOOGLE_CLIENT_ID is not set` — verified it was added to Vercel, redeployed. ✅
- Runtime error: `ADMIN_JWT_SECRET is not set` on login endpoint — added missing env var to Vercel, redeployed. ✅
- GitHub push protection: Blocked push because `docs/DEPLOYMENT_STATUS.md` contained OAuth credentials — removed secrets from file, kept only placeholders, pushed successfully. ✅
- Admin login fails despite correct credentials — found that `npm run db:seed` had already run and skipped the super admin (idempotent). Verified admin account existed in database and password hash was correct. Login works. ✅

---

## 2026-08-26: Booking cancellation — asymmetric admin/guest rule, `cancelled` as a fourth terminal status

**Decision:** Add `cancelled` to `booking_status` (alongside `reserved`/`booked`/`declined`), with a
new `cancelledAt`/`cancelledBy`/`cancellationReason` on `bookings`. An admin may cancel any live
booking (`reserved` or `booked`); a guest may only withdraw their OWN booking, and only while it is
still `reserved`. Both actions are immediate — no ApprovalVote — and no refund is calculated by the
system.

**Why:** The two-admin approval rule exists to stop a date being *held* carelessly; releasing a hold
is the safe direction, so it doesn't need the same gate. A `booked` stay usually has an advance
payment arranged offline, so ending one needs a human (an admin) who can also arrange the refund —
hence the guest's self-service withdrawal stops at `reserved`. Pricing/refunds are out of scope
(PRD §4): calculating a refund from `advance_amount` would describe the deposit, not the stay, while
reading as authoritative. `cancelled` is kept distinct from `declined` for the audit trail — "we
said no" (decline, on an unconfirmed request) and "it was called off" (cancel, on something already
accepted, or withdrawn by the guest) are different facts about the same date. No date-recovery code
was needed: every date-blocking query already names what blocks by allowlist
(`inArray(status, [...])`) rather than excluding `declined`, so a cancelled booking drops out the
moment its status changes.

**Migration detail:** the check constraint tying `cancelled_at` to `status = 'cancelled'` compares
`status::text`, not the enum value directly. Drizzle runs all pending migrations in one transaction,
and Postgres refuses to evaluate an enum value added earlier in that same transaction when
validating a constraint against the already-populated table — the text cast avoids referencing the
new member and lets the migration apply cleanly.

**Rejected alternatives:**
1. Let a guest cancel a `booked` stay too — rejected because a confirmed booking commonly has money
   already collected offline; an admin needs to be in the loop to arrange the refund.
2. Compute and store a refund amount automatically — rejected as out of scope; pricing logic isn't
   part of this build (PRD §4), and a computed number would look authoritative without being one.
3. Reuse `declined` for guest-withdrawn/admin-cancelled bookings instead of adding a new status —
   rejected because it collapses two different facts ("never accepted" vs "accepted, then undone")
   into one audit-trail value.

**Revisit when:** Refunds or pricing enter scope — at that point `cancellation_reason` and
`payment_stage` may need to interact (e.g. auto-suggesting a refund amount), which they deliberately
do not today.

---

## 2026-08-27: Fire-and-forget promises do not survive Vercel serverless — use `after()`

**The bug:** Email notifications were built (2026-08-27) firing as `void notifyXxx(...).catch(...)`
immediately after each write transaction committed. This worked locally and passed every check —
build, typecheck, lint, 211 unit tests — but in production **not a single email was ever sent**.
Zero entries in Resend's own logs, so the app was never reaching the API at all.

**Cause:** On Vercel's serverless runtime, a function's execution can be frozen or torn down the
moment the HTTP response is sent. An unawaited promise still in flight at that point may simply
never finish. The booking committed (that was awaited); the email send never ran.

**Fix:** `after()` from `next/server`, which wraps Vercel's `waitUntil` and keeps the invocation
alive until the callback settles — without delaying the response. Applied in all three call sites:
`booking-service.ts`, `vote-service.ts`, `cancellation-service.ts`.

**Why this was invisible for so long — the real lesson.** Three separate things each hid it:
1. **`sendEmail()` swallows its own errors by design** (so mail failure can't break a booking).
   Correct, but it means a total failure produces no signal anyone sees.
2. **Local dev doesn't reproduce it.** A long-lived Node process happily finishes stray promises;
   only the serverless freeze exposes the bug. Passing locally proved nothing about production.
3. **No record of send attempts exists**, so "did it even try?" was unanswerable without
   instrumenting it by hand.

**Rejected alternatives:**
1. `await` the send inside the request — rejected: makes every booking wait on a third-party API,
   and a Resend outage would slow or fail bookings. The whole point was decoupling.
2. Send inside the transaction — rejected for the same reason plus it holds a
   `SELECT ... FOR UPDATE` row lock open across a network call.
3. A job queue — rejected as far too much machinery for a handful of emails a week.

**Also corrected the same day:** I misread the `x-resend-daily-quota: 1` response header as
"this account is capped at 1 email/day" and briefly told the owner domain verification was
blocking sends. It is a **usage counter**, not a limit — two consecutive test emails both sent and
delivered. Resend's free tier is 100/day, 3,000/month as originally documented. Don't re-derive an
account limit from that header.

**Revisit when:** any new background work is added after a response (webhooks, analytics, cleanup).
The rule is `after()`, never a bare `void promise`. Also worth revisiting once an `email_log`
table exists — the owner asked on 2026-08-27 about alerting on unusual daily volume, and the same
table would close the "no record of send attempts" gap that made this bug invisible.

---

## 2026-08-27: A request body may DECLINE privilege, never claim it (`actingAs: "guest"`)

**The bug:** the owner could not withdraw their own pending booking from the guest
"My bookings" screen. It failed with "A cancellation reason is required" — a message from the
ADMIN branch of `POST /bookings/:id/cancel`, which they were never meant to reach.

**Cause:** the two auth systems are independent, so one browser can hold a customer cookie and an
admin cookie simultaneously. The route resolved that by letting the admin session win. Reasonable
for the admin panel, wrong here: the guest withdraw button sends no reason (guests are not
required to explain themselves), so an owner — permanently holding both cookies — hit the admin
branch and was refused. Their own request became un-withdrawable from the guest UI. Not an edge
case for this property, where the owner books rooms.

**Fix:** the guest button sends `actingAs: "guest"`, and the route skips the admin lookup when it
sees it.

**The principle, which is the part worth keeping:** this does not violate the route's own rule
that the actor is decided from the session and never from the body. The body can only make a
caller GIVE UP admin powers, never claim them. There is deliberately no `actingAs: "admin"`, and
the field is typed as a literal rather than a boolean or free string so one cannot be added
casually. Routing through the guest path applies the guest rules in full — ownership is still
checked against the customer session, so it reaches nobody else's booking, and a `booked` stay
still cannot be withdrawn. **Declining privilege is always safe; claiming it never is.**

**Rejected alternatives:**
1. Drop the reason requirement for admins — rejected: the reason is what staff rely on in a
   dispute, and it exists for accountability when cancelling someone else's stay.
2. Have the route load the booking and treat "admin cancelling their own booking" as a guest
   withdrawal — rejected: `admin_users` and `customers` are deliberately separate systems with no
   shared key, so linking them means matching on email, which `MAINTENANCE.md` §1 already rules
   out as unreliable.
3. Split into two endpoints, one per actor — rejected for the reason the route was unified in the
   first place: one rule about who may cancel what, in one place, cannot drift.

**Revisit when:** another route needs to serve both actors. The same pattern applies — let the
caller decline privilege explicitly, never infer intent, and never let the body claim a role.

---
