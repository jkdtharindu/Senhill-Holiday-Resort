# Maintenance & Review Log

Decisions taken during the build that carry a **known trade-off**, plus gaps deliberately left
open. None of these is a bug. Each was the right call for launch; each has a condition under
which it stops being the right call.

**How to use this file:** read the "Revisit when" line first. If that condition has not happened,
there is nothing to do. This is a watch list, not a to-do list.

Owner decision, 2026-08-23: proceed as built, review these once the app is live and running.

---

## 1. Guests are matched on Google's `sub`, not their email

**What it does.** `customers.google_id` stores Google's internal account identifier. Sign-in
looks a guest up by that, never by email address.

**Why.** People change the email on a Google account, and a released address can later be
assigned to somebody else. Matching on email would eventually either lose a returning guest's
booking history, or show one guest another person's bookings.

**The trade-off.** If an email address turns up already attached to a *different* `sub`, the
existing customer row is **reassigned** to the new account rather than the sign-in failing —
see `findOrCreateCustomer` in `src/lib/auth/customer.ts`. The reasoning: the `sub` presenting
itself is the account that currently proves ownership of that address, and both columns are
unique so leaving the old row would block the insert entirely.

The consequence is that if a Google address genuinely changes hands, the new owner inherits the
previous owner's booking history. At single-property scale with a handful of repeat guests this
is very unlikely and the alternative (a hard sign-in failure the guest cannot resolve) is worse.

**Revisit when:** a guest reports seeing bookings that are not theirs, or the business starts
holding data sensitive enough that inheritance is unacceptable. The fix would be to keep both
rows and require staff to merge them manually.

---

## 2. No Auth.js database adapter

**What it does.** Guest sessions are JWT-only. Auth.js creates no tables; `customers` is the
single record of who a guest is.

**Why.** The Drizzle adapter would create `accounts`, `sessions` and `verification_tokens` —
three tables `DATABASE_SCHEMA.md` does not define, and a second place recording guest identity.
Two sources of truth for the same fact drift apart.

**The trade-off.** Some Auth.js features need an adapter: linking several sign-in providers to
one account, server-side session revocation, and email "magic link" sign-in. None is in scope.

**Revisit when:** a second sign-in method is wanted (Facebook, email links), or there is a need
to force-sign-out a specific guest. Adding the adapter later means a migration and a decision
about which table owns identity — plan it rather than bolting it on.

---

## 3. Sign-in refused for unverified Google emails

**What it does.** `src/auth.ts` rejects sign-in unless Google reports `email_verified`.

**Why.** The booking record uses that address to identify the guest to staff. An unverified
address is one somebody typed in, not one Google has confirmed.

**The trade-off.** A guest with an unusual Google account setup could be locked out with an
error they cannot fix themselves.

**Revisit when:** a real guest reports being refused. So far unobserved — essentially all
consumer Gmail accounts are verified.

---

## 4. Rate limiting has no lockout, and the IP limit is soft

**What it does.** 8 failed sign-ins per email and 20 per IP in a 15-minute sliding window, then
HTTP 429. See `src/lib/auth/rate-limit.ts`.

**Why no lockout.** With two or three admins, a hard lockout hands anyone who knows an admin's
email address a way to disable that account on demand. A sliding window slows an attacker
without creating that weapon.

**The trade-off — the IP limit is a speed bump, not a guarantee.** Client IP is read from the
`x-forwarded-for` header. Behind Vercel that header is set by the platform and trustworthy; if
the app is ever run anywhere else, or reached directly, that header is trivially forged and the
IP limit can be bypassed. **The per-email limit holds regardless** and is the real protection.

**Also.** The email counter resets by counting only failures since that email's last success,
rather than by deleting rows — so the attempt history survives for auditing. `admin_login_attempts`
therefore grows forever. `pruneOldAttempts()` exists but **nothing calls it on a schedule.**

**Revisit when:** hosting moves off Vercel (re-examine the IP limit), or `admin_login_attempts`
grows large enough to matter — at a few admins signing in daily, that is years away. Wire
`pruneOldAttempts` to a cron job then.

---

## 5. Email notifications — resolved 2026-08-27; SMS/WhatsApp still out of scope

**Resolved 2026-08-27.** Email notifications now exist for the four events that matter most:
guest confirmation and admin alert on `POST /bookings`, approved/declined on the vote that
resolves a booking, and a cancellation confirmation. Built on Resend; see
`docs/API_DOCUMENTATION.md`'s "Email Notifications" section for the full mechanism (best-effort,
sent after each write's transaction commits, never allowed to affect the response).

**What this fixes.** The original problem — a guest hears nothing back, and the two-admin
approval mechanism depended entirely on somebody opening the admin panel and noticing — is now
addressed: every active admin gets an email the moment a request arrives, and the guest gets one
at every status change that matters to them.

**What is still NOT covered, deliberately:**
- **SMS/WhatsApp.** Still explicitly out of scope (`PRD.md` §4) — email only.
- **No guest-configurable preferences.** A guest cannot opt out of these emails; there is no
  unsubscribe mechanism. At single-property scale with transactional (not marketing) email, this
  is an acceptable gap, not an oversight.
- **No delivery tracking or retry.** `sendEmail()` (`src/lib/email.ts`) fires once and logs on
  failure; there is no queue, no retry, and no record in the database of whether a given email
  was actually delivered. A silently-bounced admin alert (e.g. a mistyped admin email) has no
  visible symptom beyond the server log.

  **This is not hypothetical — it already bit once.** On the day this feature shipped it sent
  zero emails in production, and the swallowed-errors design meant there was no signal anywhere
  until someone thought to check Resend's dashboard by hand (see `MEMORY.md`, 2026-08-27). The
  underlying send bug is fixed; the *invisibility* that let it go unnoticed is not.

  An `email_log` table (one row per send attempt: event, recipient, outcome, timestamp) would
  close this and the volume-alerting gap below in one change. Discussed with the owner
  2026-08-27, not yet built.
- **No volume alerting.** Nothing warns if email volume spikes. Worth sizing correctly if built:
  with 3 rooms and a villa, ~2 emails per booking, a genuine day's traffic is single digits —
  100 emails/day (the plan cap) is not reachable by real bookings, so a spike means a bug or
  abuse. An alert threshold therefore belongs well below the cap (~30–50/day), not at it, and
  any alert-by-email needs a once-per-day guard so it cannot feed the very spike it reports.
- **Sending domain not yet verified.** `EMAIL_FROM` currently points at Resend's shared
  `onboarding@resend.dev` test sender rather than a domain the property owns — functional, but
  guests see a generic address. See `.env.example`'s comment for the swap-over steps once a
  domain is verified.
- **Template copy lives in code, not the admin panel.** Unlike DefaultNotes (Slice 11), the
  wording in `src/lib/email-templates.ts` can only be changed by editing the file and
  redeploying — there is no admin-editable equivalent yet, by design for now (see
  `API_DOCUMENTATION.md`'s note on this).

**Revisit when:** an admin alert email demonstrably fails to arrive and nobody notices for a
while (points at needing delivery tracking), a second sign-in/contact channel is wanted
(SMS/WhatsApp), or template copy needs to change often enough that code deploys for wording edits
becomes a real friction point (points at an admin-editable template system).

---

## 6. Two admins are required — satisfied

**What it does.** Two *different* admins must approve before a booking becomes `booked`. A single
decline kills it immediately.

**Resolved 2026-08-23.** A second admin (`srivacation0@gmail.com`, role `admin`) was created
by the owner, so bookings can now reach `booked`. The dashboard warning cleared automatically.

**Still worth knowing.** If either account is deactivated the system silently returns to the
state where nothing can be confirmed — the warning reappears, but only to whoever opens the
dashboard. The approval rule itself is HITL-gated (`HITL.md`); reducing it to one approval, or
adding a bypass, is not a routine change.

---

## 7. Admin sessions last 8 hours, with no self-service password reset

**What it does.** A signed-in admin stays signed in for 8 hours. Admins change their own
password at `POST /api/admin/me/password`, which requires the current one. There is no "forgot
password" flow — a super admin cannot set someone else's password either, by design, so a
forgotten password means creating a replacement account.

**Why no reset flow.** A password reset by email means anyone who reaches an admin's inbox can
take over an admin account. With a two-person team, asking the other person is safer and takes
seconds.

**The trade-off.** If the **only** super admin forgets their password, recovery needs direct
database access — re-running the seed script with a new `SEED_SUPER_ADMIN_PASSWORD` will not
help, because the seed skips accounts that already exist.

**Also.** Sessions are stateless JWTs, so changing a password does **not** sign other devices
out — an existing session stays valid until it expires (up to 8 hours). Someone changing their
password because they think it was compromised is not fully protected until then.

**Revisit when:** the admin team grows past about five people, a lockout actually happens, or a
password change needs to take effect on other devices immediately. The last one needs either a
session store or a `password_changed_at` column checked during token verification.

---

## 8. bcrypt cost factor is 12

Roughly 250ms per check on current hardware. Raising it later is safe: bcrypt stores the cost
inside each hash, so existing passwords keep verifying and only get upgraded when next changed.

**Revisit when:** sign-in feels slow (lower it), or in a few years as hardware improves (raise it).

---

## 9. Security work deliberately deferred

From `ARCHITECTURE.md`, still not implemented:

- **CORS is not restricted** to known origins.
- ~~Image upload validation~~ — **done in Slice 4.** Files are identified by their leading bytes
  rather than the declared Content-Type, capped at 8 MB and 12 per item, JPEG/PNG/WebP only.
  Worth knowing: there is no malware scanning and no image re-encoding, so a file that is a
  genuine JPEG but crafted to exploit an image decoder would still be stored and served. At this
  scale, with uploads restricted to two trusted admins, that is an accepted risk. **Revisit if**
  uploading is ever opened to guests — then re-encode every upload server-side, which strips
  anything hidden in the original.
- **No refresh-token rotation.** Sessions simply expire.

**Revisit:** before public launch, and specifically before the first real guest booking.

---

## 10. Data and account housekeeping

- **Placeholder rooms.** `Room 1/2/3 (placeholder)` and `Whole Villa (placeholder)` are seeded
  with guessed capacities. Names, descriptions and capacities are still placeholders — replace
  through the admin panel before launch. A deactivated `Test Room A (renamed)` also exists from
  Slice 4 verification — hidden from guests, left rather than deleted since bookings could
  reference an item row.
- **Photos loaded 2026-08-23.** The 8 images from `docs/source-material/` are now attached: 5 on
  the Villa (exterior, pool, common area) and 1 each on Room 1/2/3 (distinct bedroom shots — one
  is a bunk/family room). These are real property photos, not filler, but were sorted into rooms
  by visual inspection rather than confirmed by the owner — check the assignment holds before
  launch, and replace/reorder through the panel as needed (Slice 4).
- **Deleting a photo is irreversible.** The blob is removed along with the database row, by
  decision: at this volume the storage saving is irrelevant, but orphaned files nobody can
  identify become a real mess within a year. The admin UI must confirm before deleting, since
  there is no undo and no recycle bin.
- **`esc@example.invalid`** is a deactivated test admin account created while verifying Slice 2.
  Left in place at the owner's instruction rather than deleted. It cannot sign in. Delete it
  whenever convenient.
- **The repository is public.** No credential has ever been committed and `.env.local` has never
  been tracked — verified. But the owner's email address appears in the commit author metadata of
  every commit, which is unavoidable without rewriting history or enabling GitHub's private-email
  setting. It is an address, not a credential; the protection that matters is the account password.
- **Credential rotation.** Neon: dashboard → Roles → Reset password. Google: Cloud Console →
  Credentials → the OAuth client. Both take effect as soon as `.env.local` and the Vercel
  environment variables are updated. Nothing else in the code needs changing.

---

## 11. DayMode request-size caps are a safety net, not a business rule

**What it does.** `PUT /api/calendar/day-mode` refuses more than 500 explicit dates in one
request; `PUT /api/calendar/day-mode/bulk` refuses a `from`–`to` span wider than 2 years. Both
return 400 naming the limit.

**Why.** Nothing in `PRD.md` or `API_DOCUMENTATION.md` sets a limit — these exist only so a typo
in `to` (a wrong year, say) fails loudly with a clear message rather than silently queueing up
years of date writes. Not a real usage ceiling: legitimate admin actions (a whole year of
weekends, a few hundred explicit dates) sit far under both caps.

**Revisit when:** a genuine admin action needs to exceed one of these — for instance, setting
DayMode more than two years ahead in a single bulk call. Raise the constant in
`src/lib/day-mode.ts` (`MAX_BULK_RANGE_DAYS`, `MAX_EXPLICIT_DATES`); nothing else depends on the
specific value.

---

## 12. The destructive-SQL HITL hook is a regex safety net, not a formal guarantee

**What it does.** A `PreToolUse` hook in `.claude/settings.json` scans every Bash command Claude
runs for `DELETE FROM` / `DROP TABLE` / `DROP DATABASE` / `TRUNCATE TABLE`, case-insensitive, and
forces an approval prompt when found — including text buried inside an inline `node -e` script.
See `HITL.md`, "Enforcement".

**Why a regex, not something stronger.** The rejected alternative was a real SQL-aware parser (or
a stricter sandbox denying direct database access outright). Both are more work than this
single-admin, single-repo project needs — the hook exists to catch Claude drifting back into the
pattern that caused this entry to be written (bundling a delete into a larger verification
script), not to defend against someone deliberately trying to evade it.

**The trade-off.** A sufficiently obfuscated command — building the string from concatenated
fragments, base64, a second script file the hook never inspects — would not match the regex and
would not trigger the prompt. This is not a security boundary; it is a habit-correction net for
an assistant operating in good faith.

**Revisit when:** this hook is ever relied on as a security control rather than a workflow
safeguard — for instance, if this repo ever has multiple contributors with direct write access
whose commands are not otherwise reviewed, or if it moves toward answering to anyone beyond the
owner and the two admins.

---

## 13. Overlapping `reserved` bookings are allowed; only `booked` blocks new reservations

**What it does.** Multiple customers CAN make reservations for the same room/dates simultaneously.
All start as `reserved` (pending payment & admin approval). Only bookings with `status = 'booked'`
(admin-confirmed) prevent new reservations. This allows the admin to choose which reservation(s)
to approve when there are conflicts.

**Conflict detection design.** `POST /bookings` (Slice 8) checks for conflicts by querying only
`booked` bookings (not `reserved`). Slice 8 re-validates a second time inside the write
transaction, immediately before the `INSERT`, using the identical check. Slice 9 narrows the
approval gap with `SELECT ... FOR UPDATE` on the booking row, which fully serializes concurrent
votes on the *same* booking.

**Database constraint gap.** No exclusion constraint exists on overlapping date ranges. A
Postgres exclusion constraint on overlapping `[check_in, check_out)` ranges per `bookable_item_id`
needs the `btree_gist` extension and a `daterange` column, which the schema does not have. Adding
one is a migration; deferred to keep Slice 8/9 scoped to application logic.

**The trade-off.** Two customers requesting the same room for overlapping nights, milliseconds
apart, could both pass the `booked` check before either's `INSERT` commits — but this is the
*intended* behavior (allowing multiple `reserved` bookings). If both get committed, the admin
will see them both and approve one while declining or ignoring the other. A real database
constraint would only be needed if `reserved` bookings should also block — they shouldn't per
current design.

**Revisit when:** the business rule changes to prevent multiple reservations on the same dates,
or booking volume rises enough that a truly atomic constraint is needed. Then add `btree_gist` +
an exclusion constraint on `bookings (bookable_item_id, daterange(check_in, check_out, '[)'))`.
Note: filtered to `status = 'booked'` ONLY, not `'reserved'`, so the constraint only applies to
confirmed bookings.

**Approval queue (added 2026-08-27).** Allowing several `reserved` bookings to compete for the
same dates raised an obvious follow-up: which one should an admin approve? `POST
/bookings/:id/vote` now hard-blocks an `approve` vote (409) if another `reserved` booking on the
same item, overlapping dates, has a stronger claim — see `findApprovalQueueBlocker` in
`src/lib/vote.ts`. Priority order, owner decision 2026-08-27: a booking with an advance payment
recorded (`advancePaidDate` set) always outranks one without, regardless of submission order —
the payment is what actually secures the date. Between two unpaid bookings, or two paid ones,
earlier wins (submission time, or payment date, respectively). The blocked response names the
stronger booking (`blocked_by: { bookingId, guestName }`) so the admin can jump straight to it.
`decline` is never blocked this way — declining only frees a date, so there is nothing to jump
ahead of. This is a hard block, not a dismissable warning, per owner decision — an admin cannot
approve out of order by mistake; they must resolve the stronger claim first.

---

## 14. Three read endpoints replaced by server-component reads

`GET /bookings/my`, `GET /bookings` and `GET /bookings/:id` were specified before the frontend
existed. Slice 12 built every screen that would have consumed them as a server component, which
renders on the same server as the database — so calling them would have meant the app issuing an
HTTP request to itself, re-authenticating and re-serialising rows it could already read.

Owner decision at the start of Slice 12: skip the endpoints, read through service modules
(`src/lib/admin-bookings-service.ts`, and a scoped query in `/my-bookings`). The filter set is
unchanged; it moved from query parameters on an endpoint to arguments of `fetchAdminBookings`,
and is still expressed as URL query parameters on `/admin/bookings` so a filtered view stays a
shareable link.

The trade-off accepted: there is currently no HTTP surface for booking reads. Anything outside
this Next.js app — a mobile client, an integration, a reporting tool — would have nothing to call.

**Revisit when:** something outside this app needs booking data. Build the three endpoints then as
thin wrappers over the existing service functions, so the query logic still lives in one place
rather than being reimplemented alongside them.

---

## 15. Verified by the owner

- [x] Real Google sign-in completed 2026-08-23. The `customers` row was created correctly —
      name and email from Google, `phone` null, identity keyed on Google `sub`. A guest session
      returns 401 on every admin API route and is redirected away from the admin page.

---

## 16. Security & Operations Checklist

**Critical (Must Have Before Production)**

- [ ] **Database backups**
  - [ ] Daily automated backups configured (Neon: check dashboard)
  - [ ] Tested restore process (practice a restore on staging)
  - [ ] Backup location secure (not public S3)
  - **Revisit when:** First time a data loss or corruption issue occurs

- [ ] **Admin password security**
  - [x] Initial super_admin password changed on first login (verified by owner)
  - [ ] All admin passwords are strong (12+ chars, mixed case, numbers, symbols)
  - [ ] Passwords never stored in code or `.env` files (using bcrypt hashes only)

- [ ] **HTTPS everywhere**
  - [x] Vercel HTTPS enabled by default (automatic)
  - [ ] All HTTP requests redirect to HTTPS
  - [ ] HSTS headers set in response headers

- [ ] **Rate limiting**
  - [x] Login endpoint: 8 failures/email + 20 failures/IP per 15min (see `rate-limit.ts`)
  - [ ] Booking endpoint: Add rate limiting (prevent scraping or abuse)
  - [ ] Cancellation endpoint: Add rate limiting
  - **Revisit when:** Booking volume rises or abuse is detected

- [ ] **Refresh token rotation** (currently NOT implemented)
  - [ ] Sessions expire after fixed time (currently 8 hours for admins)
  - [ ] Tokens cannot be used after password change (not yet enforced)
  - [ ] No old tokens remain valid after logout
  - **Revisit when:** Adding multi-device session management

- [ ] **CORS headers**
  - [ ] Restricted to known origins (NOT implemented — currently wide open)
  - [ ] Credentials handled securely
  - **Revisit when:** Mobile app or third-party integrations added

- [ ] **Image malware scanning** (currently NOT implemented)
  - [ ] File upload validation (type/size check done; no re-encoding)
  - [ ] Virus scanning service for uploaded images
  - **Revisit when:** Opening file uploads to guests

**High Priority**

- [ ] **Admin audit trail**
  - [x] All booking changes logged with timestamp & admin name (audit_log table exists)
  - [ ] Admins can view who did what when (display pending)
  - [ ] Audit retention policy (keep forever or rotate after X years?)

- [ ] **Monitoring & Alerts**
  - [ ] Error tracking: Set up Sentry (free tier) to catch production bugs
  - [ ] Database monitoring: Watch connection pool, slow queries
  - [ ] Uptime monitoring: UptimeRobot (free) pings every 5 min
  - [ ] Email delivery: Verify booking confirmations reach customers (SMTP logs)

**Testing Before Launch**

- [ ] Concurrent bookings: 2 users book same room → conflict handling works
- [ ] Database transaction rollback: Failed booking leaves no partial data
- [ ] Email delivery: Test booking confirmation email end-to-end
- [ ] Mobile responsiveness: Test booking flow on iPhone/Android
- [ ] Error pages: 404/500 are custom (not raw Next.js errors)

---
