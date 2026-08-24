# Tasks

## Completed ✓
- [x] Grill Me session — full architecture, data model, and edge cases confirmed (see PRD.md)
- [x] Docs generated: PRD, UBIQUITOUS_LANGUAGE, DATABASE_SCHEMA, API_DOCUMENTATION,
      ARCHITECTURE, HITL, README, tasks, GOOGLE_OAUTH_SETUP
- [x] Post-generation audit pass — multi-night date-range conflicts, capacity, pricing scope cut
- [x] Pre-build feedback round — property identity, seeded super admin, DayMode switch-block
      rule, booking window, bulk day-mode assignment, hosting/DB requirement, auth approach

## In Progress →
- [~] Slices 1–3 complete and verified end to end against the live database, including a real
      Google sign-in by the owner. Both auth systems confirmed independent: a guest session
      cannot reach any admin route.
      Slice 4 done: rooms, villa and photo management work against live Neon and Vercel Blob.
      Slice 5 done: DayMode single-date and bulk-by-pattern assignment, with DayModeSwitchBlock
      verified against a real booking on the live database.
      Slice 6 done: the public `GET /api/calendar` aggregate, driven through open/reserved/booked
      for both room-mode and villa-mode against real bookings on the live database.
      Slice 7 done: the day-detail view (`GET /calendar/:date`) — RoomStatus per item for a
      customer, full guest + payment + ApprovalVote detail for an admin, from one shared
      fetch-derive cycle. Verified against the live database with a real booking and vote.
      Slice 8 done: booking creation (`POST /bookings`) — full FR5a validation (BookingWindow,
      DayMode match, conflict detection, capacity), verified against the live database including
      the multi-reason rejection case and the half-open boundary on both window and conflict
      checks. Built with Sonnet 5 as an owner-approved exception to MODEL_SELECTION.md's Opus 5
      recommendation — see the model note in API_DOCUMENTATION.md.
      Slice 9 done: ApprovalVote (`POST /bookings/:id/vote`) — the two-admin approval mechanism,
      with per-vote and per-status-change audit-log entries all inside one transaction, plus a
      `SELECT ... FOR UPDATE` on the booking to serialize concurrent votes. Verified against the
      live database with a second temporary admin: both the 2-approve → booked path and the
      1-decline → declined path (with a prior approve standing) worked correctly; re-voting from
      the same admin captured `previousVote: "approve"` without double-counting; a vote on an
      already-resolved booking returned 409; the audit log captured every vote plus both status
      transitions with denormalized admin names. Built with Opus 4.7 as an owner-approved
      over-spec exception to MODEL_SELECTION.md's Sonnet 5 recommendation.
      **Next: Slice 10, admin comprehensive booking update.** Nothing further is needed from the
      owner for Slices 10–11.
      Trade-offs accepted for launch are logged in `MAINTENANCE.md`, not carried as open work.

## Next To Do ○ (suggested build order — vertical slices)

**⚠️ MODEL SELECTION REQUIRED:** Before starting any slice, check [MODEL_SELECTION.md](MODEL_SELECTION.md) for the assigned Claude model. Claude will ask you to confirm before proceeding.

- [x] Slice 1: Next.js + Postgres scaffold — **done. Applied to the live Neon database.**
      Built: Next 16 + TypeScript + Tailwind 4 scaffold; Drizzle schema for all 9 tables
      (`src/db/schema.ts`); generated migration (`drizzle/0000_initial_schema.sql`); connection
      pooling (`src/db/index.ts`); Asia/Colombo date module with 35 passing tests
      (`src/lib/dates.ts`); idempotent seed script (`src/db/seed.ts`); `.env.example`.
      Verified against the live database: 9 tables created (10 after Slice 2 added
      `admin_login_attempts`); seed applied and confirmed idempotent on re-run; check
      constraints reject `check_out <= check_in`, zero-night stays, zero guests, and any
      booking status outside the enum. Remaining: first deploy to Vercel.
- [x] Slice 2: Admin auth — **done and verified against the live database.**
      Built: bcrypt password hashing (cost 12, 12-char minimum); JWT sessions in an httpOnly
      SameSite=lax cookie, 8-hour expiry, signed with `ADMIN_JWT_SECRET` and refused if that
      secret ever equals `NEXTAUTH_SECRET`; `requireAdmin`/`requireSuperAdmin` guards that
      re-read the database rather than trusting token claims, so deactivation takes effect
      immediately; database-backed rate limiting (8 failures per email, 20 per IP, 15-minute
      sliding window, no lockout); `/admin/login` and a placeholder `/admin` dashboard.
      Endpoints: `POST /api/auth/admin/login`, `POST /api/auth/admin/logout`,
      `GET /api/auth/admin/me`, `GET|POST /api/admin/admins`, `PATCH /api/admin/admins/[id]`
      (active and/or name), `POST /api/admin/me/password` (own password only — a super admin
      cannot set someone else's, so an issued starting password can be replaced with something
      nobody else has seen).
      Verified end to end: wrong password and unknown email return byte-identical 401s (no user
      enumeration); throttling triggers on the 9th attempt with `Retry-After: 900`; throttling
      one email does not affect another; a `role: "super_admin"` field in a create request is
      ignored and a plain admin is created; a plain admin gets 403 on both super-admin actions;
      a deactivated admin cannot sign in; self-deactivation and last-super-admin deactivation
      are both blocked; no password hash appears in any response.
- [x] Slice 3: Customer auth — **done and verified with a real Google sign-in.**
      Auth.js v5 (`next-auth@5.0.0-beta.32`) with the Google provider, JWT sessions and
      **no database adapter** — the adapter would create `accounts`/`sessions`/
      `verification_tokens`, three tables DATABASE_SCHEMA.md does not define and a second place
      recording who a guest is. `src/lib/auth/customer.ts` owns the single `customers` row.
      Customers are matched on Google's `sub`, never on email: emails move between accounts, so
      matching on one would either lose a returning guest's history or hand it to a stranger.
      Sign-in is refused unless Google reports the email as verified. Session carries the
      `customers.id` and deliberately no role field.
      Verified: Auth.js catch-all at `/api/auth/[...nextauth]` does not swallow the admin routes
      (static segments win — `POST /api/auth/admin/login` still returns 200); Google accepts the
      client id, redirect URI and scopes with no `redirect_uri_mismatch` and no Testing-mode
      block. Owner completed a real sign-in on 2026-08-23: the `customers` row was created with
      name and email from Google, `phone` left null as designed, and identity stored as Google
      `sub`. A guest session gets 401 on every admin API route and 307 to /admin/login on the
      admin page — including when the guest cookie is renamed to the admin cookie name, since
      the signature still fails.
- [x] Slice 4: BookableItems CRUD + images — **done and verified against live Neon and Vercel Blob.**
      Endpoints: `GET|POST /api/bookable-items`, `GET|PATCH /api/bookable-items/[id]`,
      `POST|PATCH /api/bookable-items/[id]/images` (upload / reorder),
      `DELETE /api/bookable-items/[id]/images/[imageId]`.
      **Upload validation judges the file by its leading bytes, never the declared Content-Type** —
      the browser supplies that and a script can set it to anything. JPEG/PNG/WebP only, 8 MB cap,
      12 photos per item. Deleting a photo removes the blob too and closes the gap in
      `display_order` so positions stay contiguous.
      No DELETE for items: bookings reference the row, so removal would orphan or cascade away a
      guest's history. `active: false` instead — hidden from guests, still visible to admins, and
      a direct guest fetch 404s. `kind` is not editable (it would change what existing bookings
      mean) and only one villa may exist (villa_mode offers *the* villa, not a choice).
      Reducing capacity below an existing booking's guest count returns 409 naming the affected
      bookings, overridable with `force: true` — those guests are already coming, so it warns
      rather than blocks.
      Verified: an .exe renamed .jpg *and* declaring image/jpeg is rejected; so are an SVG carrying
      script and a 9 MB file; a genuine JPEG uploads, is publicly reachable, and is gone from
      storage after delete; unauthenticated upload 401s; a partial reorder list is refused; zero
      blobs leaked across the whole test run.
- [x] Slice 5: DayMode — **done and verified against the live database.**
      Endpoints: `PUT|GET /api/calendar/day-mode` (explicit dates), `PUT /api/calendar/day-mode/bulk`
      (pattern — only `weekends` for now, extendable). Any admin may set DayMode, per FR11 (not
      super-admin-only).
      Split deliberately into a pure module (`src/lib/day-mode.ts` — pattern resolution, the
      switch-block decision, no database) and a DB-orchestration module
      (`src/lib/day-mode-service.ts`) shared by both routes, so the single-date and bulk endpoints
      can never disagree about what counts as a blocked switch. The pure module has 23 unit tests
      covering the half-open boundary and the rule that a switch is blocked by a booking under the
      date's *current* mode only — never the target mode, never the other item kind.
      A request may partially succeed: each date is judged independently and the response lists
      `updated` and `blocked` (with a reason) separately, per API_DOCUMENTATION.md — not
      all-or-nothing.
      Added a read companion, `GET /api/calendar/day-mode?from=&to=`, returning raw day_modes rows
      so an admin (or this verification pass) can inspect what is configured. This is **not** the
      public CalendarState aggregate — that colour derivation is Slice 6, below.
      Verified against the live database, with a real booking inserted to force the case that
      matters most: a reserved booking blocked all three nights it covered, the checkout day (half
      open) switched freely, and declining the booking immediately freed the switch — no restart,
      no cache to invalidate. Bulk-by-weekends over a full month set exactly the 8 correct dates and
      not one weekday. Unauthenticated requests 401; a plain (non-super) admin succeeds, matching
      FR11. All test data removed afterward — day_modes and bookings both back to empty.
- [x] Slice 6: Calendar aggregate endpoint — **done and verified against the live database.**
      `GET /api/calendar?from=&to=` — public, no session required, response identical for every
      caller.
      Split into a pure derivation module (`src/lib/calendar.ts`, 18 unit tests) and the route as
      a thin HTTP adapter, matching the pattern from Slice 5. The pure function decides one date's
      colour from a pre-fetched snapshot of day_modes + active bookings — no per-date queries.
      room_mode: `open` if no active room is taken, `booked` if every active room is taken (0
      active rooms reads as `open`, not `booked`), `reserved` otherwise — counted by distinct
      room id, not booking row count. villa_mode: mirrors the villa's own booking status
      (`booked` beats `reserved` if both somehow overlap one date, so derivation never crashes on
      an anomalous state even before Slice 8's booking-creation validation exists to prevent it).
      A booking against a deactivated Room or the Villa is excluded from both branches — the
      colour reflects what is bookable *now*.
      Verified against the live database: an absurdly wide request (`2000-01-01`..`2050-01-01`)
      revealed the true clamp (`2026-08-23`..`2026-11-21`, 91 entries) rather than trusting the
      constant; a fully-out-of-window request returns `{ calendar: [] }`; a partially-overlapping
      one is trimmed to the window edge, not rejected. Drove a real room through 0/3 → 1/3 → 2/3 →
      3/3 booked and watched `open → reserved → reserved → booked`; drove a real villa booking
      through `open → reserved → booked`; confirmed the checkout day reads `open` (half-open
      range) on both room and villa dates. Deactivating the only room holding a booking flipped
      that date from `reserved` to `open` in an isolated retest — the first version of this check
      was run against leftover state from an earlier step and gave a misleading result, corrected
      by re-running it cleanly rather than trusting the first pass. All test data removed
      afterward.
      Corrected `API_DOCUMENTATION.md`: the response is `{ "calendar": [...] }` with camelCase
      `dayMode`, not the bare snake_case array in the original planning-stage example, matching
      every other endpoint built so far — documented explicitly, along with the preamble's
      `Authorization: Bearer` line, which was never accurate (both auth systems use httpOnly
      cookies, not a header the caller constructs).
      **Follow-up the same day:** added a server-rendered `/calendar` page — the first visual
      (non-JSON) view of Slice 6's output, a month grid over the 90-day window. Extracted the
      fetch-derive cycle out of the route into `src/lib/calendar-service.ts` so the route and the
      page share one implementation. Caught and fixed a real bug before it shipped: the page built
      as a **static** page (prerendered once at build time) because nothing in it reads cookies or
      headers, the only signals Next's static analysis treats as a dynamic trigger — left alone it
      would have shown a BookingWindow frozen at the last deploy and never reflected a DayMode set
      the next day. Fixed with `export const dynamic = "force-dynamic"`; confirmed by rebuilding
      and checking the route listing flip from prerendered to dynamic, not just by reading the page
      in dev.
- [x] Slice 7: Day-detail endpoint (`GET /calendar/:date`) — **done and verified against the
      live database.**
      **Model used: Sonnet 5**, per MODEL_SELECTION.md.
      Built as a pure derivation module (`src/lib/day-detail.ts`, 11 unit tests covering the
      half-open boundary, distinct-room counting, and that RoomStatus collapses `reserved` and
      `booked` to the same value) plus a DB-orchestration module
      (`src/lib/day-detail-service.ts`) shared by the route, same split as Slices 5–6. Admin
      enrichment (guest identity, payment stage, ApprovalVotes with the voting admin's name) is
      added only in the service layer's admin path — never in the pure module — so there is no
      code path where it could leak into a customer response by accident.
      Added `getOptionalAdmin()` to `src/lib/auth/require-admin.ts` (thin wrapper around
      `requireAdmin()`) so the route can try the admin path without writing a 401/403 Response
      when the caller turns out to be a customer instead — `requireAdmin()`'s own behaviour,
      including the distinct 403 for a deactivated admin, is unchanged.
      Verified against the live database: 3 rooms read `open` with no bookings; a real
      `reserved` room booking with a real ApprovalVote attached read `booked` with full detail
      for the admin and only status/bookingId for the customer; a real `booked` villa booking
      mirrored the same way; the booking's checkout day read `open` again once DayMode was set
      there, confirming the half-open boundary against live data, not just the pure-module
      tests; unauthenticated request 401'd; a date outside the 90-day window 400'd for the
      customer only (admin unrestricted, per §9a). All test data removed afterward.

- [x] Slice 8: Booking creation (`POST /bookings`) — **done and verified against the live
      database.**
      **Model used: Sonnet 5** — owner-approved one-off exception to MODEL_SELECTION.md's Opus 5
      recommendation for this slice. Verification was scaled up accordingly (23 unit tests plus
      a live-database pass covering every conflict-reason combination) to cover the risk Opus 5
      was meant to address. See MODEL_SELECTION.md for the note on this exception.
      Built as a pure validation module (`src/lib/booking.ts`) plus a DB-orchestration module
      (`src/lib/booking-service.ts`) that re-validates a second time inside the write
      transaction, immediately before the `INSERT`, to narrow the race window between the fetch
      and the write — flagged as a mitigation, not a hard guarantee, since the schema has no
      exclusion constraint on overlapping date ranges (see `MAINTENANCE.md`).
      Validates, in order: item exists and is active; `check_out` after `check_in`;
      `guests_count` against capacity; every night in the range against the BookingWindow; then
      every night against DayMode-set/DayMode-match/existing-conflict, collecting ALL conflicting
      nights (not just the first) with a distinct machine-readable reason each
      (`unavailable` / `day_mode_mismatch` / `already_booked`) — no partial-booking, no
      auto-splitting, per FR5a.
      Verified against the live database: a clean 2-night booking succeeded with
      `advancePaymentNotice`; a 7-night request spanning an existing booking, an unset date, and
      a DayMode boundary was rejected naming all 4 conflicting nights with correct distinct
      reasons and created nothing; a second booking starting exactly on the first one's checkout
      day succeeded (half-open boundary against live data); over-capacity and wrong-item-kind
      requests were each cleanly rejected; an out-of-window date was rejected naming the actual
      window edges; Slice 7's day-detail endpoint immediately reflected the new booking as
      `booked`. All test data removed afterward.

- [x] Slice 9: ApprovalVote (`POST /bookings/:id/vote`) — **done and verified against the live
      database.**
      **Model used: Opus 4.7** — over-spec exception to MODEL_SELECTION.md's Sonnet 5
      recommendation (opposite direction from Slice 8's under-spec exception, both logged per the
      same protocol). Not incorrect, just heavier than needed for a straightforward state-machine
      slice.
      Built as a pure decision module (`src/lib/vote.ts`, 13 unit tests) plus a DB-orchestration
      module (`src/lib/vote-service.ts`) that runs the vote write, any resulting status update,
      and the audit-log entries in one transaction, with `SELECT ... FOR UPDATE` on the booking
      row to serialize concurrent votes — two admins voting simultaneously cannot both read
      `reserved` and both apply; one queues behind the other, sees the updated status, and gets
      rejected 409 if the first vote resolved the booking.
      Also added a `BookingStatus` type export to `src/db/schema.ts` (matching the existing
      `DayModeKind` pattern), used by the pure module — pattern to follow for future enums.
      Rules enforced: two distinct admins approving → `booked`; one decline (from either
      required admin) → `declined` immediately with no tiebreaker; a re-vote overwrites the
      admin's own prior vote via the unique constraint on `(booking_id, admin_id)`; a vote on a
      booking already `booked` or `declined` returns 409 (stale-submission case).
      Audit log: every vote writes an `approval_vote` row (`old_value` = previous vote or null,
      `new_value` = new vote); when the vote also changes booking status, a second `status` row
      is written in the same transaction with the from/to pair. Admin name is denormalized so
      the trail reads correctly even if the admin is later renamed or deactivated.
      Verified against the live database with a temporary second admin: two admins approving
      moved booking through reserved → reserved → booked; re-vote from the same admin captured
      `previousVote: "approve"` and did not double-count; the second booking's decline (with a
      prior approve standing) moved straight to declined; a further vote on the already-booked
      booking returned 409; the audit log captured all 3 votes plus both status transitions with
      correct denormalized admin names; Slice 7's day-detail endpoint immediately reflected the
      two approvals under the `approvals` array. All test data removed afterward — bookings
      cascade to `approval_votes` and `booking_audit_log`, then the temp admin was deleted
      (foreign-key ordering handled).

- [ ] Slice 10: Admin comprehensive booking update (phone, payment stage, advance payment,
      internal notes) — same pattern as the earlier hotel project. **No currency symbol/field
      needed** — plain numeric amount, manual process.
      **Model: Sonnet 5** — See MODEL_SELECTION.md before starting. Routine CRUD with precedent
      pattern. Claude will ask to confirm model selection.

- [ ] Slice 11: DefaultNotes + CustomNotes — admin edit, shown in booking flow (summary of
      terms/conditions per room, ~3 phrases per the owner's description — placeholder text
      until admin fills in real content via panel)
      **Model: Haiku 4.5** — See MODEL_SELECTION.md before starting. Low complexity, straightforward
      CRUD. Claude will ask to confirm model selection.

- [ ] Slice 12: **Frontend screens (~14)** — guest: home, rooms/villa listing + detail, colour-coded
      calendar, day-detail, booking form, my-bookings; admin: login, bookings list, booking detail
      (vote/payment/history), calendar + DayMode controls, items manager w/ upload, notes editor,
      admin accounts. Mobile-first — most guests will book from a phone. **Not in the original
      slice list; roughly half the remaining work.**
      **Model: Opus 5** ⭐ CRITICAL — See MODEL_SELECTION.md before starting. Largest remaining scope
      (~50% of work), 14 screens across 2 user types, requires careful component architecture.
      Claude will ask to confirm Opus 5 is selected.

## Discovered & resolved (grill session)
- [x] Default DayMode for unset dates — no default, `unavailable` state.
- [x] Customer self-cancellation — not supported, admin-only.

## Discovered & resolved (post-generation audit pass)
- [x] Multi-night bookings crossing a DayMode boundary — whole range must be consistent;
      rejection names the specific conflicting date(s).
- [x] Room/Villa capacity — added, enforced server-side.
- [x] Pricing scope — dropped entirely; fixed AdvancePaymentNotice shown instead.

## Discovered & resolved (pre-build feedback round)
- [x] DayMode-switch-after-booking-exists — **blocked**, admin must resolve existing bookings
      first (`DayModeSwitchBlock`).
- [x] Currency — confirmed moot; all payment handling is manual, no currency field/symbol needed.
- [x] Bulk DayMode assignment — added `PUT /calendar/day-mode/bulk`, pattern-based (starting
      with `weekends`).
- [x] Booking window — 90-day rolling limit from today, customer-facing only.
- [x] Property identity — **Senhill Holiday Resort, Hedigalle**. Logo deferred, not needed yet.
- [x] Super admin seed email — supplied by the owner, kept in `.env.local` as
      `SEED_SUPER_ADMIN_EMAIL`. Never committed; the repo is public.
- [x] Google auth approach — NextAuth.js + Google provider (simpler than raw token
      verification), admin auth stays fully separate.
- [x] Hosting — Vercel confirmed. DB must be real, persistent, always-on Postgres (Neon
      recommended) — not a demo/in-memory store, from day one.
- [x] Room/Villa content — real data to be entered by the admin manually via the panel once
      built; use clearly-labeled placeholder data for initial scaffold/testing only.

## Discovered & resolved (build-kickoff review — 2026-08-23)
- [x] Property name conflict (folder said "Satori Hills", docs said "Senhill") — **Senhill Holiday
      Resort, Hedigalle** is the public-facing name everywhere: headline, browser tab, Google OAuth
      app name. Folder name is a working title only, ignore it.
- [x] Money fields vs. the no-pricing rule — **advance only**. `total_amount` and `balance_due`
      dropped from `bookings` (they were pricing by another name, contradicting PRD §4).
      `advance_amount`, `advance_paid_date` and `payment_stage` stay as admin-only record-keeping
      per FR10. No number is ever shown to a customer.
- [x] Image storage — **Vercel Blob** (was "Supabase Storage or S3"). Hosting is already Vercel,
      so this avoids a second account and a second set of credentials. See ARCHITECTURE.md.
- [x] Timezone — all date boundaries resolve in **`Asia/Colombo` (UTC+5:30)**, never UTC or
      server-local. Vercel runs UTC; untreated, "today" rolls at 05:30 local and shifts both the
      BookingWindow and every CalendarState colour by a day for part of each night. Rule written
      into DATABASE_SCHEMA.md.
- [x] `check_in`/`check_out` semantics were never defined — now **half-open** (hotel standard):
      a 10th→13th stay occupies the 10th, 11th, 12th; the 13th is free for the next arrival.
      Written into DATABASE_SCHEMA.md. Affects conflict detection, RoomStatus and CalendarState.
- [x] Customer phone collection (open question in GOOGLE_OAUTH_SETUP.md §4) — collected on the
      **booking form**, not at first login. Google doesn't reliably supply one and `POST /bookings`
      already requires it.
- [x] UI/screens were never scoped — all 11 slices describe data and endpoints, none describe a
      page. Added as Slice 12 below (~14 screens, roughly half the remaining work).

## Deferred by decision — see docs/MAINTENANCE.md
Owner decision 2026-08-23: proceed as built; review these once the app is live and running.
Each entry there carries a "Revisit when" trigger rather than an open action.
- [ ] Guest identity matched on Google `sub`, with email-reassignment takeover behaviour
- [ ] No Auth.js database adapter (blocks multi-provider login and forced sign-out until added)
- [ ] Rate limiting: no lockout by design; IP limit is soft off-Vercel; `admin_login_attempts`
      grows unbounded because `pruneOldAttempts` is not scheduled
- [ ] **No notifications anywhere** — largest operational risk; approval depends on someone
      opening the panel
- [ ] No self-service admin password reset; sole-super-admin lockout needs database access
- [ ] CORS unrestricted; no refresh-token rotation; image upload validation due with Slice 4

## Open — needs the owner, not code
- [x] **Second admin account** — created 2026-08-23: `srivacation0@gmail.com`, role `admin`.
      Two active admins now exist, so bookings can reach `booked`; the dashboard warning cleared.
      **Name is the placeholder "Senhill Admin"** — it is stamped onto every ApprovalVote and
      audit-log entry, so replace it with the real name via `PATCH /api/admin/admins/[id]`.
- [ ] **Room inventory** — count, name and capacity per Room; Villa capacity (marketing copy in
      `docs/source-material/Hotel details.txt` implies 15). Placeholder data until supplied.
- [x] **Photo-to-room mapping** — resolved as a non-question. Owner confirmed 2026-08-23 that
      images are not fixed one-time content: admins upload and replace them through the panel as
      the property changes. The 8 files in `docs/source-material/` are templates for initial
      testing only. Slice 4 therefore needs upload / replace / reorder / delete, not a one-off
      import — and the same applies to descriptions and notes.
- [ ] **DefaultNotes / CustomNotes copy** and the exact **AdvancePaymentNotice** wording.
- [ ] **No notifications anywhere** (PRD §4 rules out email/SMS). Consequence to accept
      consciously: a guest hears nothing after booking, and two admins must approve a request
      neither was told about. Requires someone opening the admin panel daily. Flag if unacceptable —
      it would be a scope addition, not a bug fix.

## Assumption flagged for confirmation (not yet explicitly asked)
- [ ] Admin calendar/DayMode configuration is **not** restricted by the 90-day BookingWindow
      (admins can plan further ahead than customers can book) — reasonable default, stated in
      PRD.md §9a, but not explicitly asked. Flag if this is wrong.

## Blocked (can't start yet)
- [ ] Actual deployment — HITL-gated per HITL.md (hosting choice itself is now decided: Vercel)

## Future (post-MVP, per PRD §11)
- [ ] In-app pricing (Quotation/BaseRate), if manual coordination doesn't scale
- [ ] Online payment collection
- [ ] Automated reminder messaging
- [ ] Guest reviews
- [ ] Revisit DayMode exclusivity if business needs change
- [ ] Real logo/branding once available

---

## Recent decisions (running log — newest on top)
- **Build-kickoff review (2026-08-23)** — Read all 9 docs end to end before writing code. Owner
  confirmed three decisions: public name is **Senhill Holiday Resort, Hedigalle** (folder name
  "Satori Hills" is a working title, ignore it); **advance-only money fields** — dropped
  `total_amount` and `balance_due` from `bookings` as they contradicted PRD §4, kept
  `advance_amount`/`advance_paid_date`/`payment_stage` as admin-only per FR10; image storage
  is **Vercel Blob**, replacing the earlier "Supabase Storage or S3" (hosting is already Vercel —
  one fewer account and credential set). Three gaps closed by stated assumption rather than
  question, since each had one defensible answer: `Asia/Colombo` for every date boundary (Vercel
  runs UTC, 5.5h behind — would shift the BookingWindow and calendar colours nightly); half-open
  `check_in`/`check_out` (checkout day is not an occupied night); phone collected on the booking
  form rather than at first login. Added **Slice 12** — the ~14 frontend screens, which no
  existing slice covered despite being roughly half the work. Estimate: 10–13 working sessions
  across 8 phases. Still blocked on the owner for: second admin account, room inventory,
  photo-to-room mapping, notes copy — and a conscious decision about having no notifications.

- **Pre-build feedback round (this chat)** — Owner supplied: property name (Senhill Holiday
  Resort, Hedigalle), super admin email (kept out of the repo, see `.env.example`), hosting (Vercel + must-be-real
  persistent Postgres), room data will be entered manually later (placeholder for now), notes
  content will be added manually via admin panel later. Resolved remaining conflicts: no price
  field anywhere (confirmed), DayMode switch blocked if conflicting bookings exist. New features
  added: bulk DayMode assignment by pattern (e.g. weekends), 90-day rolling BookingWindow.
  Recommended NextAuth.js for customer Google auth (simpler than manual token verification) —
  admin auth stays fully separate per HITL.md.
- **Audit pass (this chat)** — Reviewed all 8 docs for gaps before build. Resolved: multi-night
  date-range conflict validation (rejects with named conflicting dates), added Capacity field
  per BookableItem, **dropped pricing entirely from scope** (no Quotation/BaseRate/`/pricing`
  endpoints — customer sees a fixed AdvancePaymentNotice instead, amount handled manually).
- **Follow-up (this chat)** — Resolved the 2 open questions: DayMode has no default
  (`unavailable` 4th CalendarState added), and customer self-cancellation is not supported
  (admin-only). Updated PRD, DATABASE_SCHEMA, UBIQUITOUS_LANGUAGE, API_DOCUMENTATION accordingly.
- **Grill Me session (this chat)** — Confirmed: single property, Room + Villa as separate
  BookableItems, DayMode toggle (room_mode/villa_mode, mutually exclusive — resolves earlier
  double-booking concern from a prior draft), 2-admin ApprovalVote system, manual payment only,
  Google auth for customers / separate email+password for admins, Next.js + Postgres stack,
  3-tier calendar detail (public/logged-in coarse CalendarState → logged-in day-detail
  RoomStatus → admin full detail with guest identity).
