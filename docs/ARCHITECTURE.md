# Architecture

## Stack decisions

| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend | Next.js 16 (App Router, TypeScript, Turbopack) | Approval workflow, per-day mode switching, date-range conflict validation, and image management justify a fuller framework than a no-build-step prototype this time. Scaffolded on 16 rather than the 14 named in the original draft — the version number was incidental to that decision, and starting a new project on a superseded major would mean an upgrade before launch. Note Next 16 renames `middleware` to `proxy`, and makes `params`, `cookies()` and `headers()` async-only. |
| ORM / migrations | **Drizzle ORM + drizzle-kit** | Not specified in the original draft. Chosen over Prisma because the hardest queries in this app are date-range shaped — overlap detection across a stay's nights, and CalendarState aggregation per date — which read naturally as SQL and fight an abstraction layer. Drizzle keeps them type-safe without dropping to untyped raw queries. Migrations are checked into `drizzle/` and are the source of truth for schema changes. |
| DB driver | `@neondatabase/serverless` over WebSocket (`drizzle-orm/neon-serverless`) | The WebSocket driver rather than the HTTP one because several operations must be transactional: BulkDayModeAssignment writes many `day_modes` rows at once, and casting an ApprovalVote updates the booking, the vote and the audit log together. A half-applied bulk update would leave the calendar in a state no admin asked for. |
| Tests | Node's built-in test runner (`node --test`) | No extra framework. Node 24 strips TypeScript natively, so tests run straight from `.ts` with nothing to configure. `src/lib/dates.test.ts` covers the timezone and half-open-date rules, which are the two places a silent bug would do the most damage. |
| Database | PostgreSQL, **fully persistent, always-on** — not a demo/in-memory store | This is a hard requirement, not a suggestion: the app has no meaning without bookings, approvals, and day-mode config surviving restarts and being shared across every admin session. See "Persistence requirement" below. |
| Image storage | **Vercel Blob** (confirmed) | Room/Villa photos need real file storage, not just URL fields. Chosen over Supabase Storage/S3 because hosting is already Vercel — no extra account, no extra credentials to manage, and built-in image optimisation. Revisit only if hosting ever moves off Vercel. |
| Customer auth | **NextAuth.js (Auth.js) with the Google provider** | The simplest realistic path for someone without prior OAuth experience — NextAuth handles the token exchange, session cookies, and refresh for you; you mostly just paste in a Client ID/Secret from Google Cloud Console. Far less manual token-verification code than wiring Google Identity Services by hand. See `GOOGLE_OAUTH_SETUP.md`. |
| Admin auth | Separate, custom email/password + bcrypt + own JWT — **not** routed through NextAuth | Kept deliberately apart from the customer auth system (see HITL.md) — a compromised or misconfigured NextAuth/Google setup must never be able to reach admin routes. Two independent systems, not two providers on one system. |
| Hosting | **Vercel** (confirmed) + a managed Postgres add-on — **Neon** recommended (native Vercel integration, generous free tier, simplest setup for a first-time database), Supabase or Railway are fine alternatives | Standard, low-friction pairing for Next.js; free/low tiers sufficient at single-property scale. |
| Email | **Resend** (added 2026-08-27) | Free tier (100/day, 3,000/month) comfortably covers this property's volume — a booking generates at most 2 emails, so even 50 bookings/month stays under the limit. Simple SDK, first-party Vercel integration, no separate account infra to run. Chosen over SendGrid (heavier setup) and AWS SES (needs its own AWS account) for the same "least friction for a single small property" reasoning as the hosting/DB choices above. |

## Persistence requirement (explicit, not assumed)
Confirmed by the project owner: the database must be a real, always-running managed Postgres
instance from day one — bookings, approvals, day-mode configuration, and room/villa content all
need to survive restarts and be visible across every admin's session immediately. This rules out
any local-file or in-memory fallback mode for this project (unlike the earlier SQLite-based
project, which was fine using a local file). Local development still uses a real Postgres
instance (Docker Postgres, or a free-tier Neon/Supabase dev branch) — never an in-memory mock.

## Why the DayMode mechanic lives at the data layer, not just UI
`day_modes` is a real table, not a computed/UI-only concept, because:
- Booking creation must be **rejected server-side** if it doesn't match the day's mode (a Room
  booking attempted on a `villa_mode` day must fail at the API, not just be hidden in the UI).
- Admins need to set modes **ahead of time** (e.g. mark all December weekends as villa_mode in
  one batch), which requires persistence, not a runtime calculation.

## Why CalendarState is derived, not stored
`CalendarState` (`open`/`reserved`/`booked` shown on the month view) is deliberately **not** a
column anywhere — it's computed from `bookings.status` + `day_modes.mode` at query time. Storing
it directly would create a sync problem (two sources of truth that can drift). The aggregation
rule itself is documented once, in `PRD.md` §9 and `DATABASE_SCHEMA.md`, and should be
implemented as a single shared query/function reused by both `/calendar` and `/calendar/:date`
— not reimplemented per endpoint.

## Why two separate approval endpoints don't exist (single `/vote` route)
Approve and decline are modeled as one endpoint with a `vote` field, not two separate routes,
because the business rule ("2 approvals to confirm, 1 decline to kill it") lives in one place —
the handler for `POST /bookings/:id/vote` — rather than being duplicated logic split across two
route handlers that could drift out of sync.

## BookingWindow enforcement — server-side, not just UI
The 90-day rolling BookingWindow is enforced in the API layer (`GET /calendar`, `POST
/bookings`), not just by hiding calendar navigation in the frontend. A determined customer
hitting the API directly with an out-of-window date must still be rejected. The frontend's job
is to make it a non-issue in practice (don't render a "next month" arrow past the window), not
to be the only enforcement.

## BulkDayModeAssignment — pattern matching kept server-side and simple
`pattern: "weekends"` is resolved server-side by iterating the given date range and matching
day-of-week — no client-side date math, so the rule can't drift between frontend and backend.
Deliberately starting with just `weekends` rather than a full recurrence-rule engine (like iCal
RRULE) — add more patterns only if actually needed, per the project's general bias toward
building the minimum that solves the stated problem.

## Business logic pattern: pure module, service module, thin route
Established at Slice 5 and repeated at Slice 6 — the convention later slices (bookings,
approvals) should follow rather than reinvent per feature:

- **A pure module** (`src/lib/day-mode.ts`, `src/lib/calendar.ts`) holds the actual business
  rule as plain functions over data the caller already fetched — no database import. This is
  what makes rules like DayModeSwitchBlock and CalendarState derivation directly unit-testable,
  the same reasoning `src/lib/dates.ts` established at Slice 1.
- **A service module** (`src/lib/day-mode-service.ts`, `src/lib/calendar-service.ts`) does the
  actual fetch-from-Postgres-then-call-the-pure-function cycle, so two different routes needing
  the same query don't each write their own version and drift apart.
- **The route file stays a thin adapter** — parse the request, call the service, return JSON.
  Early in Slice 5 the service logic briefly lived inside one route file with a second route
  importing from it; moved out once it was clear that let one endpoint's shape quietly affect
  another's behavior, which a route file (meant to be request-in/response-out) shouldn't do.

## Frontend organization (Route groups & layouts)

Built with Next.js 16 App Router route groups (`(guest)` and `admin/(panel)`) and shared layouts:

- **(guest)** wraps all customer-facing routes (`/`, `/rooms`, `/calendar`, `/book`, `/my-bookings`, `/signin`). These add no URL segment, keeping every existing URL unchanged. The layout loads the guest session and renders `SiteHeader` (logo, main nav, sign-in/sign-out).
- **admin/(panel)** wraps all admin panel routes (`/admin`, `/admin/bookings`, `/admin/calendar`, etc.). Also adds no URL segment. The layout calls `requireAdmin()` and redirects unauthenticated requests to `/admin/login`. Renders `AdminHeader` (admin nav with role-based visibility).
- **/admin/login** sits **outside** `(panel)` so a sign-in screen structurally cannot render admin chrome for a session that does not exist yet.

This pattern means a guest browsing `/calendar` and an admin browsing `/admin/bookings` have completely separate navigation chrome and database access patterns, with no code shared between the two except the database layer and a small set of business-logic functions.

## Component system & shared primitives

Built a minimal reusable component library in `src/components/ui` used across all 14 screens:

- **Design tokens** (`styles.ts`): cx() helper, PAGE_BG, SURFACE, BORDER, TEXT_* color tokens, FOCUS_RING, CARD spacing — ensures visual consistency and keeps responsive breakpoints centralized.
- **Form primitives** (`field.tsx`, `button.tsx`): TextField, TextAreaField, SelectField all wire id+label+aria-describedby automatically; Button and LinkButton separated to keep nav as `<a>` (next/link) and actions as `<button>`.
- **Layout** (`card.tsx`): PageShell, PageHeader, CardPanel, DescriptionList, EmptyState — reused across every screen to reduce layout code duplication.
- **Data display** (`table.tsx`): DataTable component with caption (required for a11y), columns, empty state, row rendering — bookings list, admin list.
- **Messaging** (`alert.tsx`, `badge.tsx`): Alert tone variants (error, success, warning, info), status badges with calendarStateMeta() for day states, BookingStatusBadge for guest/admin dual interpretation.

## Data fetching: Server components, no HTTP reads to own API

Every screen is a server component that fetches directly from the database via Drizzle ORM. There are no `GET /bookings`, `GET /bookings/my`, or `GET /bookings/:id` endpoints — decided at Slice 12 that an app issuing HTTP requests to itself to re-authenticate and re-serialize rows it can already read is inefficient, so the pattern is:

- Guest `/my-bookings`: server component queries bookings directly, scoped by `session.user.id`.
- Admin `/admin/bookings`: server component calls `fetchAdminBookings()` from `src/lib/admin-bookings-service.ts`, passing filters from URL params (`?status=reserved&from=2026-09-10`). Same filter set that an endpoint would have taken, but applied as function arguments instead.
- Admin `/admin/bookings/[id]`: calls `fetchAdminBooking()` with the same service module.

If a future requirement (mobile app, third-party integration) needs HTTP reads, they would become thin wrappers over the existing service functions — query logic lives in one place rather than reimplemented per transport. See MAINTENANCE.md §14.

## Email notifications — fire-after-commit, never blocking (added 2026-08-27)

Three write routes (`POST /bookings`, `POST /bookings/:id/vote`, `POST /bookings/:id/cancel`)
send email as a side effect. The pattern is the same in all three, and is worth naming once here
rather than trusting each call site to reinvent it correctly:

1. The write happens inside its own `db.transaction(...)`, same as before this feature existed.
   Nothing about the write path changed.
2. Whatever the email needs (guest name, item name, dates) is captured from data already read
   inside that transaction — no extra query is added to the write path itself.
3. The transaction resolves, and **only then** — outside it, after `await db.transaction(...)`
   — is the notification fired, via `void notifyXxx(...).catch(...)`.
4. `lib/email.ts`'s `sendEmail()` never throws; a Resend error or a missing API key is logged and
   swallowed there.

The result: a mail provider outage can never turn a successful booking, vote, or cancellation
into an error response, and the row lock held by each route's `SELECT ... FOR UPDATE` is never
extended by a slow network call to a third party. This is a deliberate reliability trade —
worse observability (a failed send is a log line, not a retried job or a user-visible error) in
exchange for guaranteeing the booking system itself never depends on email working. See
`docs/API_DOCUMENTATION.md`'s "Email Notifications" section for what each event sends and to
whom, and `docs/MAINTENANCE.md` §5 for what is deliberately still out of scope (SMS, delivery
tracking, admin-editable template copy).

## Known trade-offs and deferred work
Decisions taken with a known cost, each with the condition under which it should be revisited,
are logged in `MAINTENANCE.md` — not repeated here. That file is the watch list for once the
app is live; this one records why the architecture is shaped the way it is.

## Security posture (MVP-level, revisit before real launch)
- Admin routes check role server-side (`admin` vs `super_admin`), never trust client-side UI
  hiding alone.
- Public calendar/day-detail responses are shaped differently per audience (customer vs admin)
  at the API layer — the API itself withholds guest data from customer-scoped requests, rather
  than relying on the frontend to hide fields that were already sent.
- Admin login **is** rate limited (implemented in Slice 2): 8 failures per email and 20 per IP
  in a 15-minute sliding window, counted in Postgres rather than process memory so it survives
  across serverless instances. Deliberately not a lockout — see `MAINTENANCE.md` §4.
- Admin passwords are bcrypt (cost 12). The "no such account" path runs a throwaway comparison so
  it takes the same time as a real one, closing the timing channel that would otherwise reveal
  which emails are real admin accounts.
- Admin route guards re-read the database on every request rather than trusting token claims, so
  deactivating an admin or changing a role takes effect immediately rather than at token expiry.
- Still not implemented: refresh-token rotation, CORS restricted to known origins, image upload
  validation (file type/size limits, malware scanning — due with Slice 4, do not ship the upload
  UI without it).

## Scaling triggers
- Single property, moderate booking volume — Postgres on a small managed instance is fine
  indefinitely at this scale; no premature scaling work needed.
- If this becomes a multi-property product later (explicitly out of scope per PRD §4), every
  table needs a tenant key — treat that as its own project, not a bolt-on.
