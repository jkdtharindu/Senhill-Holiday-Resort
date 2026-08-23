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

## 5. No notifications of any kind

**What it does.** Nothing is emailed or texted. Not to guests, not to admins.

**Why.** Explicitly out of scope — `PRD.md` §4.

**The trade-off — this is the largest operational risk in the system.** A guest submits a
booking request and hears nothing back. Two admins must then approve it without anything telling
them it arrived. The whole approval mechanism depends on somebody opening the admin panel and
looking.

**Revisit when:** a booking sits unapproved long enough to lose it, or guests start phoning to
ask whether their request went through. That is the signal. Adding guest confirmation email
alone would remove most of the pain.

---

## 6. Two admins are required, and only one exists

**What it does.** Two *different* admins must approve before a booking becomes `booked`. A single
decline kills it immediately.

**The trade-off.** Until a second active admin account exists, **no booking can ever be
confirmed.** The admin dashboard shows a warning while this is true.

**Revisit:** not a design question — a second admin simply needs creating before launch. Note
that the approval rule itself is HITL-gated (`HITL.md`); reducing it to one approval, or adding
a bypass, is not a routine change.

---

## 7. Admin sessions last 8 hours, with no self-service password reset

**What it does.** A signed-in admin stays signed in for 8 hours. There is no "forgot password"
flow — a super admin resets it.

**Why no reset flow.** A password reset by email means anyone who reaches an admin's inbox can
take over an admin account. With a two-person team, asking the other person is safer and takes
seconds.

**The trade-off.** If the **only** super admin forgets their password, recovery needs direct
database access — re-running the seed script with a new `SEED_SUPER_ADMIN_PASSWORD` will not
help, because the seed skips accounts that already exist.

**Revisit when:** the admin team grows past about five people, or a lockout actually happens.

---

## 8. bcrypt cost factor is 12

Roughly 250ms per check on current hardware. Raising it later is safe: bcrypt stores the cost
inside each hash, so existing passwords keep verifying and only get upgraded when next changed.

**Revisit when:** sign-in feels slow (lower it), or in a few years as hardware improves (raise it).

---

## 9. Security work deliberately deferred

From `ARCHITECTURE.md`, still not implemented:

- **CORS is not restricted** to known origins.
- **Image upload validation** — file type and size limits — lands with Slice 4. Do not ship the
  upload UI without it.
- **No refresh-token rotation.** Sessions simply expire.

**Revisit:** before public launch, and specifically before the first real guest booking.

---

## 10. Data and account housekeeping

- **Placeholder rooms.** `Room 1/2/3 (placeholder)` and `Whole Villa (placeholder)` are seeded
  with guessed capacities. Replace with real inventory through the admin panel before launch.
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

## 11. Verified by the owner, still outstanding

- [ ] Complete a real Google sign-in as a guest, confirm the `customers` row is created, and
      confirm a guest session gets 401 on admin routes. Cannot be done without the account
      owner's password.
