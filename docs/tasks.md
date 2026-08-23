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
      **Next: Slice 5, the DayMode and calendar engine.** Nothing further is needed from the
      owner for Slices 4–11. Slice 4 (BookableItems + image upload) needs a Vercel Blob token.
      Trade-offs accepted for launch are logged in `MAINTENANCE.md`, not carried as open work.

## Next To Do ○ (suggested build order — vertical slices)
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
- [ ] Slice 4: BookableItems CRUD (admin: name, images, description, capacity — **no price
      field**) + public GET with images
- [ ] Slice 5: DayMode — admin sets per-date mode (single + bulk-by-pattern, e.g. "weekends");
      public/customer calendar respects it; DayModeSwitchBlock enforced (reject switch if
      conflicting bookings exist under current mode)
- [ ] Slice 6: Calendar aggregate endpoint (`GET /calendar`) — CalendarState derivation logic,
      4 states incl. `unavailable`; BookingWindow (90-day rolling) enforced server-side for
      customer-facing calls only, not admin
- [ ] Slice 7: Day-detail endpoint (`GET /calendar/:date`) — customer view (RoomStatus, no
      guest identity) vs admin view (full detail)
- [ ] Slice 8: Booking creation (`POST /bookings`) — validate BookingWindow, every date in the
      range (DayMode match, not `unavailable`, no conflict) and reject with the specific
      conflicting date(s) named; validate `guests_count` against capacity; include
      `advance_payment_notice` fixed text in the success response
- [ ] Slice 9: ApprovalVote (`POST /bookings/:id/vote`) — 2-approve/1-decline logic +
      booking_audit_log entries
- [ ] Slice 10: Admin comprehensive booking update (phone, payment stage, advance payment,
      internal notes) — same pattern as the earlier hotel project. **No currency symbol/field
      needed** — plain numeric amount, manual process.
- [ ] Slice 11: DefaultNotes + CustomNotes — admin edit, shown in booking flow (summary of
      terms/conditions per room, ~3 phrases per the owner's description — placeholder text
      until admin fills in real content via panel)
- [ ] Slice 12: **Frontend screens (~14)** — guest: home, rooms/villa listing + detail, colour-coded
      calendar, day-detail, booking form, my-bookings; admin: login, bookings list, booking detail
      (vote/payment/history), calendar + DayMode controls, items manager w/ upload, notes editor,
      admin accounts. Mobile-first — most guests will book from a phone. **Not in the original
      slice list; roughly half the remaining work.**

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
