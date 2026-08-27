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
      Slice 10 done: admin comprehensive booking update (`PUT /bookings/:id`) — guestName, phone
      (compulsory), email, paymentStage, advanceAmount, advancePaidDate, internalNotes, all
      optional per-request and diffed against current values so a no-op patch writes nothing to
      `booking_audit_log`. Deliberately excludes `status` (rejected 400 via a `.strict()` body
      schema) — status only changes via `/vote` or a future cancel endpoint. Built with Sonnet 5
      per MODEL_SELECTION.md, no exception. Verified against the live database: 401 unauthenticated,
      400 on an empty patch, 400 on a blank phone, 400 on an unrecognized key, 404 on an unknown
      booking id, and a real multi-field update that produced exactly one audit-log row per
      changed field with correct old/new values and the admin's denormalized name, with `status`
      and untouched fields left alone. All test data removed afterward.
      Slice 11 done: site-wide settings (`GET /site-settings` public, `PUT /site-settings` admin)
      — `default_notes` is the site-wide booking terms shown to customers in the booking flow.
      Built with Haiku 4.5 per MODEL_SELECTION.md, no exception. Verified against the live
      database: public GET succeeds without auth, admin PUT with auth succeeds or fails as
      expected (unauth 401, blank notes 400, empty patch changed: false, real update persisted
      and immediately visible via GET). All expected behaviors confirmed; database restored to
      baseline.
      Slice 12 done: all 14 frontend screens, built with Opus 5 per MODEL_SELECTION.md, no
      exception. Guest: home, rooms listing, room detail, calendar, day-detail, booking form,
      my-bookings, sign-in. Admin: login, dashboard, bookings list, booking detail
      (vote/payment/history), calendar + DayMode controls, items manager with photo upload,
      notes editor, accounts. Built on a shared component system (`src/components/ui`,
      `src/components/layout`) with route-group layouts — `(guest)` and `admin/(panel)` — that
      add no URL segment, so every existing URL is unchanged. `/admin/login` sits outside
      `(panel)` so a sign-in screen structurally cannot render nav for a session that does not
      exist. Three read endpoints were deliberately not built; see MAINTENANCE.md #14.
      Verified against the live database: all 7 admin screens 307 to login when signed out and
      200 when signed in; the two-admin approval path drove a real booking reserved -> reserved
      -> booked with a third vote correctly rejected 409; DayModeSwitchBlock refused the 3 booked
      nights while updating the 2 free ones; the FR5a rejection rendered per-date with the
      half-open boundary correct (the 13th and 14th absent, as they should be); the audit trail
      rendered all 6 entries newest-first in Asia/Colombo time; capacity reduction below an
      existing booking returned 409 and is surfaced as an explicit override rather than a
      silent `force`. Production build succeeds. Fixed along the way: a `font-family: Arial`
      rule that overrode the loaded Geist webfont, an unvalidated `?next=` open redirect (now
      `src/lib/safe-next.ts`, 13 tests), 21 `<a>` internal links causing full page reloads, and
      duplicated accessible names on every calendar cell.
      All Slice 12 verification data removed afterwards (booking, day modes, temporary admin);
      seeded placeholder notes restored.
      Trade-offs accepted for launch are logged in `MAINTENANCE.md`, not carried as open work.
      Slice 13 done: booking cancellation (`POST /bookings/:id/cancel`). Built with Opus 5 per
      MODEL_SELECTION.md, no exception. Rules settled with the owner 2026-08-26 and deliberately
      asymmetric: an admin cancels any live booking (`reserved` or `booked`); a guest may only
      withdraw their OWN booking and only while `reserved`, because a confirmed stay usually has
      an advance payment arranged offline. Immediate, with no ApprovalVote — the two-admin rule
      exists to stop a date being *held* carelessly, and releasing one is the safe direction.
      No refund is calculated, by design: pricing is out of scope (PRD §4), so a percentage of
      `advance_amount` would describe the deposit rather than the stay while reading as
      authoritative; an admin arranges the refund offline and sets `paymentStage` to `refunded`
      through the existing update route, and the admin UI warns whenever a payment is on record.
      Schema: `booking_status` gains `cancelled`, `bookings` gains `cancelled_at`/`cancelled_by`/
      `cancellation_reason`, with a check constraint tying status and timestamp together. The
      constraint uses `status::text` — drizzle runs all pending migrations in ONE transaction
      (`pg-core/dialect.js`), and Postgres refuses to evaluate an enum value added earlier in the
      same transaction when validating against the populated table; the cast avoids referencing
      it. **Date recovery needed no code at all** — every date-blocking query already names what
      blocks by allowlist (`inArray(status, [...])`) rather than excluding `declined`, so a
      cancelled booking drops out of all of them the moment its status changes.
      Verified against the live database, driving the real service modules (20 checks, all
      passed): another guest refused 404 with ownership checked before status so booking
      existence cannot leak; the owner's withdrawal recorded `cancelled_by` NULL with the audit
      trail attributing it to "Guest (self-service)"; a re-cancel refused 409; the freed dates
      accepted a brand-new booking; two admins confirmed that booking and the guest was then
      refused 403 on it while an admin cancelled it successfully with the reason recorded
      verbatim; a declined booking refused 409. All 3 test bookings and 2 test customers removed
      afterwards; the 6 pre-existing real bookings confirmed present and unchanged.
      Also fixed along the way: the admin bookings list built its status filter from a hand-kept
      array typed `BookingStatus[]`, which type-checks even when the enum grows — `cancelled`
      would have been silently unfilterable. Replaced with a total `Record<BookingStatus, string>`
      so any future status is a compile error until labelled. The approval panel would also have
      told an admin that a cancelled booking was "declined"; it now distinguishes all three
      closed states.
      **Not verified in a browser:** both new UI surfaces (the guest withdraw button and the
      admin cancel panel) sit behind authentication, and port 3000 — which this app's Google
      OAuth callback is bound to — was held by another session at the time. Production build
      succeeds and every page compiles; the logic is covered by the live pass above, but the
      rendered screens have not been eyeballed.
      Slice 14 done: admin dashboard "Upcoming stays" table (`src/app/admin/(panel)/page.tsx`).
      Built with Sonnet 5 per MODEL_SELECTION.md, no exception. Requirements settled with the
      owner 2026-08-27 after two things came up during Slice 13 follow-up: (1) a live filter on
      `/admin/bookings` errored in production — investigated and could not reproduce by calling
      the exact same query function directly against the live database with every filter
      combination; most likely transient, coinciding with the Slice 13 migration and live
      verification pass running against the same database moments earlier; (2) the owner asked
      whether Confirmed status should also depend on advance payment — traced to the two
      reserved bookings on the live database simply having zero votes cast on them yet, not a
      payment-linkage issue. Owner confirmed keeping the two-admin-vote rule exactly as built,
      no HITL change needed.
      New `fetchUpcomingBookings()` in `admin-bookings-service.ts`: `reserved` and `booked`
      bookings with `check_in >= today`, ascending (soonest first) — the opposite sort from the
      browsable list, which shows newest-first. The approve-count join was extracted into a
      shared `attachApproveCounts()` helper used by both list functions rather than duplicated.
      The dashboard's existing "Upcoming stays" stat tile now derives its count from this same
      fetched list (previously a separate `COUNT(*)` query that could never disagree with the
      table, but also never had to) and its link now anchors down to the table on the same page
      instead of off to the general bookings list.
      Verified against the live database via `fetchUpcomingBookings` directly: all 5 real
      upcoming bookings returned, strictly ascending by check-in, the one `declined` booking and
      all past dates correctly excluded. Production build succeeds.
      **2026-08-27 follow-up — browser-verified, and the real filter bug found and fixed.**
      Once port 3000 was free (the other session's dev server had exited without killing its
      child `node` process — an orphan, not a live server) and logged in as the seeded super
      admin, submitting the bookings filter form with defaults reproduced the reported
      production error exactly: `invalid input syntax for type uuid: ""`. Root cause, confirmed
      from the dev server's stack trace: the item `<select>`'s "Any" option has `value=""`, so
      submitting the form sends `item=` on the URL; `page.tsx` guarded against the param being
      *absent* but not against it being *empty*, so `""` reached
      `eq(bookings.bookableItemId, "")` and Postgres rejected it outright. Pre-existing since
      Slice 12, unrelated to Slice 13/14 — my earlier attempt to reproduce it by calling
      `fetchAdminBookings` directly missed this because every filter combination I tried passed
      either `undefined` or a real value, never an explicit `""`. Fixed in
      `src/app/admin/(panel)/bookings/page.tsx` by treating `""` the same as absent, matching
      the guard `asStatus`/`asDate` already had via their allow-lists. Re-verified in the browser
      afterward: the exact click that broke before (Apply filters with every dropdown left on
      its default) now returns the full unfiltered list.
      Also browser-verified in the same pass: the dashboard's Upcoming stays table (tile count
      matches table row count, ascending order, email inline); the admin cancel-panel's
      confirmation step (textarea, Confirm/Keep booking) opens correctly on a real `reserved`
      booking, backed out via "Keep booking" without cancelling it; the guest withdraw button's
      confirmation step opens correctly on a real booking, backed out via "Keep it". Both
      real bookings touched during this check were confirmed unchanged in the database
      afterward (`status: "reserved"`, `cancelledAt: null`).
      One tooling note: the Browser pane's synthetic `left_click` did not register as a trusted
      click on the "Cancel this booking" / withdraw buttons specifically (coordinates, DOM
      target and event listeners all checked out fine) — worked around by dispatching `.click()`
      via `javascript_tool` for those two buttons only. Everything else (navigation, the
      bookings-filter form, admin sign-in) clicked normally through the standard tool. Noted here
      in case it recurs on the same components.
      Slice 15 done (2026-08-27): three pieces of owner-requested work built in one session with
      Sonnet 5, no exception.
      **(a) DayMode clearing.** Admins could set a date to `room_mode`/`villa_mode` and switch
      between the two, but never unset one back to "not bookable" — needed for renovations or
      special closures. Added `planDayModeClearings()`/`clearDayModePlan()` (`src/lib/day-mode.ts`,
      `src/lib/day-mode-service.ts`) mirroring the existing switch-block logic: a date with an
      active booking under its current mode cannot be cleared, same rule as a mode switch. New
      `DELETE /api/calendar/day-mode` endpoint; admin UI gained a "Clear mode" option
      (`day-mode-controls.tsx`). Deletion doesn't stamp `set_by` (there is no row left to stamp,
      and day_modes has no audit log of its own), so `clearDayModePlan` deliberately takes no
      adminId.
      **(b) Email notifications (Resend).** The single largest item on `MAINTENANCE.md`'s watch
      list (§5 — "no notifications of any kind") resolved. Guest confirmation + admin alert on
      `POST /bookings`; approved/declined on the vote that resolves a booking; a cancellation
      confirmation. `src/lib/email.ts` wraps Resend and never throws — every call site fires the
      notification only after its write transaction has committed
      (`void notifyXxx(...).catch(...)` following `await db.transaction(...)`), so mail latency or
      failure can never affect whether a booking/vote/cancellation succeeds. Templates
      (`src/lib/email-templates.ts`) are plain functions sharing one HTML shell, deliberately kept
      as code — owner asked for them to stay editable "as templates for the future" rather than
      building an admin-editable system nobody asked for yet.
      **(c) Contact page.** New public `/contact` (`src/app/(guest)/contact/page.tsx`): phone
      numbers, email addresses, and a key-free Google Maps embed built from
      `src/lib/contact-info.ts`'s `CONTACT_INFO` — the same constant the email templates' footer
      reads, so the two surfaces cannot drift apart. Carries a warning notice asking guests to
      call ahead and confirm the final approach road rather than trust the embedded map's routing
      — owner-specified, to guard against "map hallucination" on a rural access road.
      **Session note:** partway through, discovered that an earlier `git checkout` in this same
      session (done to keep an unrelated commit clean) had discarded *uncommitted* documentation
      for the 2026-08-26 booking-cancellation feature — the code for that feature was already
      committed, but its `MEMORY.md` entry, `PRD.md` FR6a supersede note, and
      `DATABASE_SCHEMA.md` schema rows had not been. Reconstructed from the diff read earlier in
      the same session and restored before adding this slice's own doc updates on top.
      Verified: production build succeeds; `npm run lint` clean (two pre-existing errors from
      part (a) fixed — an unescaped quote pair and an unused `adminId` parameter left over from
      earlier in the session); all 211 unit tests pass; `/contact` browser-verified against a live
      dev server (nav link, both phone numbers as `tel:` links, both emails as `mailto:` links,
      address, warning notice, and the map iframe all rendered correctly; no console errors).
      Email sending itself was not live-verified end-to-end (would require a real Resend send and
      a real inbox check) — the code path, best-effort error handling, and fire-after-commit
      ordering were verified by reading and typechecking, not by watching a real email arrive.
      **That gap turned out to matter — see the follow-up below.**
      Slice 15 follow-up (2026-08-27, Opus 5 — over-spec exception, logged in MODEL_SELECTION.md):
      **the email feature as shipped sent zero emails in production.** The owner added the Resend
      env vars to Vercel, redeployed, submitted a real booking — the booking succeeded, but no
      email arrived and, tellingly, Resend's own logs showed no send attempt at all, meaning the
      app never reached the API.
      Cause: `void notifyXxx(...).catch(...)` fire-and-forget. Vercel's serverless runtime can
      freeze a function the moment its response is sent, so an unawaited promise still in flight
      may never run. The awaited transaction committed; the un-awaited send did not. Checked
      `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` per AGENTS.md
      rather than assuming the API from memory, then switched all three call sites
      (`booking-service.ts`, `vote-service.ts`, `cancellation-service.ts`) to `after()` from
      `next/server`, which wraps Vercel's `waitUntil` and keeps the invocation alive until the
      callback settles without delaying the response.
      **Verified properly this time:** rather than stopping at a green build, sent a real email
      through the live Resend API using the actual template module, then confirmed against the raw
      unfiltered API response (`error: null`, real message id) — and the owner confirmed both test
      emails arrived. The original failure was precisely a case of build/typecheck/tests all
      passing while proving nothing about the runtime behaviour that was broken.
      Two further corrections made in the same pass:
      (1) `sendEmail()` swallowing its own errors by design (correct, so mail can't break a
      booking) means a total failure produces no signal anyone sees — recorded as a known gap,
      with an `email_log` table proposed to close it alongside the volume alerting the owner asked
      about. Not built yet.
      (2) I misread Resend's `x-resend-daily-quota: 1` header as an account cap and briefly told
      the owner their account was restricted to 1 email/day and that domain verification was
      blocking sends. Wrong on both counts — it is a usage counter, the published free tier
      (100/day, 3,000/month) applies as originally documented, and both test emails sent fine.
      Corrected in `API_DOCUMENTATION.md` with an explicit note so the header is not misread again.
      Slice 16 done (2026-08-27): `email_log` table and volume circuit breaker — the follow-up the
      slice above identified as its own remaining gap. Built with Opus 5; over-spec against
      MODEL_SELECTION.md's criteria for work of this shape, logged as an exception there.
      Pure policy in `src/lib/email-log.ts` (12 unit tests, both thresholds tested at their exact
      boundaries) plus `src/lib/email-log-service.ts` for the DB side, following the same
      pure/service split as day-mode and vote. Every function in the service is failure-tolerant
      and never throws: a logging system that can break the thing it observes is worse than none.
      Three design decisions worth not undoing:
      (1) **The breaker fails OPEN.** If the daily count can't be read, the send proceeds. A
      transient DB error silently suppressing a real guest's confirmation is worse than briefly
      overshooting a self-imposed limit that already sits under Resend's own.
      (2) **Blocked attempts aren't counted** toward the daily total — only `sent` and `failed`
      consume provider quota. Counting blocked ones would make the breaker self-latching: once
      tripped it could never untrip.
      (3) **`sent_on` is stored, not derived** from `sent_at`. The counter has to agree with what
      an admin means by "today" in Asia/Colombo, and a UTC day boundary would disagree for part of
      every evening.
      Thresholds sized against real capacity rather than the mail plan: 3 rooms plus a villa at
      ~2 emails per booking makes a busy day single digits, so warn at 30 and hard-stop at 80
      (below Resend's 100, leaving headroom to send by hand while investigating).
      Migration `0003_email_log.sql` is purely additive — two enum types, one table, three
      indexes, no ALTER on anything existing, so none of the enum-in-transaction hazard that
      0002 needed a `::text` cast for. **Applied to the live database with the owner's explicit
      approval**, per `HITL.md`'s gate on migrations against a non-local database.
      Verified against the live database rather than by build alone — the specific lesson from the
      slice above: confirmed all 10 columns, 3 indexes and both enums exist with correct types;
      confirmed existing data untouched (13 bookings, 6 customers, 5 admins); then drove a real
      send through `sendEmail` and watched the counter go 0 → 1 with a correctly-populated `sent`
      row. Test row deleted afterwards, `email_log` back to 0. Production build succeeds, lint
      clean, 223 unit tests pass (up from 211).
      Admin dashboard gained a "Recent email activity" panel plus banners for elevated volume,
      a tripped breaker, and any same-day failures — failure reasons shown inline, since the whole
      point is that nobody should have to go looking to find out something broke.
      **Not built, deliberately:** delivery confirmation (a `sent` row means the provider accepted
      it, not that it arrived — bounces need Resend webhooks), retries, and any alerting that
      reaches someone not looking at the dashboard. Email-based alerting was considered and
      deferred: an email about too much email can feed the spike it reports. See `MAINTENANCE.md`
      §5.
      Slice 17 done (2026-08-27): "Reserve Request for Reserved Bookings" — the roadmap's own
      next item. Built with Sonnet 5, no exception, once the real scope became clear.
      Investigated before writing any code: `validateBookingRequest` (`lib/booking.ts`) has never
      looked at a customer's OTHER bookings, only at conflicts on the requested item itself, so a
      guest could already hold unlimited simultaneous `reserved` requests with zero code
      involved. `my-bookings` also already had a "Book another stay" link reaching the booking
      form regardless of any pending request. The original spec's own notes ("no validation
      change needed", "no schema changes needed") turned out to be literally true.
      Presented this to the owner before building the originally-scoped new endpoint/UI
      unchanged. Decided: no dedicated UI (existing link is sufficient), ship the one genuinely
      new piece — a hard cap of 6 simultaneous `reserved` bookings per customer, across every
      item, as abuse protection. `MAX_RESERVED_PER_CUSTOMER` in `lib/booking.ts`, enforced by a
      new `countCustomerReservedBookings` query in `lib/booking-service.ts`. No new endpoint, no
      schema change, no `reference_booking_id` column (rejected as speculative — nothing needs
      requests linked, each is judged and displayed independently).
      The cap is checked inside `validateBookingRequest`, before any per-night date work — a
      customer-level fact, so it fires regardless of which dates were asked for. Verified with a
      dedicated test that the cap message is never masked by an unrelated date-conflict error,
      and that a genuine capacity violation still takes priority over the cap.
      Verified: 7 new unit tests (237 total) — the exact boundary at 6, well past it, the
      cap-before-dates ordering, and priority against a capacity violation. The count query was
      also cross-checked against every real customer in the production database (not just unit
      tests) before being trusted, since it had never run before. Production build succeeds,
      lint clean.
      Full rationale, including the three rejected alternatives, in `MEMORY.md` (2026-08-27).

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
      booking status outside the enum.
      **2026-08-25: First Vercel deploy complete.** App is live at
      https://senhill-holiday-resort.vercel.app. Environment variables configured,
      database migrations applied to production Neon, admin login and guest auth both
      working. See `docs/DEPLOYMENT_STATUS.md` for checklist and verification log.
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

- [x] Slice 12: **Frontend screens (~14)** — **done and verified against the live database.** — guest: home, rooms/villa listing + detail, colour-coded
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
