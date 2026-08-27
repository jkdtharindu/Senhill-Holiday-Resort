# Vercel Deployment Status

**Last Updated:** 2026-08-27
**Status:** ✅ Live in production — with one known functional gap (see below)

**Production URL:** https://senhill-holiday-resort.vercel.app

---

## Current state

The app has been live on Vercel since 2026-08-25. This file went stale for two days after that —
it still described the first failed build attempt until this update. See `docs/tasks.md` and
`MEMORY.md` for the actual day-by-day history; this file is a **snapshot of what's configured**,
not a build log.

## ⚠️ Known gap: guest confirmation emails do not reach real guests

Discovered by a real production booking on 2026-08-27. The Resend account has no verified
sending domain, and an unverified account only accepts mail addressed to the account owner
(`jkdtharindu@gmail.com`) — it rejects the entire send if any other recipient is present.

**Current effect:** a real guest's booking confirmation is rejected by the provider and logged
as `failed`. `EMAIL_RESTRICT_TO` (below) narrows admin alerts to one working address so the owner
still learns when a booking arrives; two of the three admins are not notified and must check the
admin panel. Full account in `docs/MAINTENANCE.md` §5.

**Fix (deferred on cost, owner decision 2026-08-27):** verify a domain in Resend (~$12/yr), point
`EMAIL_FROM` at an address on it, then delete `EMAIL_RESTRICT_TO` from Vercel. No code change.

---

## Environment variables — as configured in Vercel today

| Variable | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | ✅ Set |
| `ADMIN_JWT_SECRET` | Signs admin session tokens | ✅ Set |
| `NEXTAUTH_SECRET` | Signs guest (Auth.js) session tokens | ✅ Set |
| `GOOGLE_CLIENT_ID` | Google OAuth, guest sign-in | ✅ Set |
| `GOOGLE_CLIENT_SECRET` | Google OAuth, guest sign-in | ✅ Set |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, room/villa photo uploads | ✅ Set |
| `RESEND_API_KEY` | Outgoing email (Slice 15, 2026-08-27) | ✅ Set |
| `EMAIL_FROM` | Sender address for outgoing email | ✅ Set — `onboarding@resend.dev` (Resend's shared test sender; not a verified domain) |
| `EMAIL_RESTRICT_TO` | **Temporary workaround** — narrows admin alerts to one deliverable address until a domain is verified | ✅ Set — `jkdtharindu@gmail.com`. **Delete this once a domain is verified**, not just leave it; its continued presence is what keeps admin alerts narrowed to one person. |

⚠️ **Never commit actual secrets to this file.** Real values live in `.env.local` (git-ignored)
and Vercel's environment settings. This table records *what exists*, not the values themselves.

## Database

Schema is current as of migration `0003_email_log.sql` (2026-08-27), applied to the live Neon
database with explicit owner approval per `HITL.md`. Migrations are NOT run automatically on
deploy — after adding a migration, run `npm run db:migrate` locally against the production
`DATABASE_URL` before the code that depends on it goes live. This has occasionally meant a brief
window where deployed code expects a column/table that doesn't exist yet if the two are
sequenced wrong; check `drizzle/` against what's actually applied if something 500s right after
a deploy that included a schema change.

## What's live

All 14 original frontend screens, DayMode set/switch/clear, two-admin booking approval, booking
cancellation (guest self-withdrawal + admin cancel), the approval-queue block, the admin
color-coded availability calendar, the public `/contact` page, and email notifications for
booking confirmation / admin alert / approved / declined / cancelled (subject to the domain gap
above). See `docs/tasks.md` for the full slice-by-slice build order and verification log.

## Google OAuth redirect URI

The production URL's callback (`https://senhill-holiday-resort.vercel.app/api/auth/callback/google`)
must be registered in Google Cloud Console → Credentials → OAuth 2.0 Client ID → Authorized
Redirect URIs, alongside the `localhost:3000` one used for local dev. Confirmed working — guest
Google sign-in succeeds in production (see `docs/tasks.md`, Slice 3, and the production booking
test on 2026-08-27, which required a real sign-in to reach the booking form).

---

## Troubleshooting reference

**If a deploy fails on a missing env var:** check the table above against Vercel's Settings →
Environment Variables — the exact key name matters (`DATABASE_URL`, not a variant), and it must
be enabled for the Production environment, not only Preview/Development.

**If email silently doesn't send:** check `RESEND_API_KEY` is set for Production, then check the
admin dashboard's "Recent email activity" panel or query `email_log` directly — every attempt is
recorded there with its outcome, including `skipped_no_api_key` (key missing) and `failed`
(provider rejected it, with the reason in `error_message`).

**If a new migration's table/column seems missing in production:** migrations don't run on
deploy automatically — confirm `npm run db:migrate` was actually run against the production
`DATABASE_URL` after the migration file was generated.

**If sign-in doesn't work:** check the Google OAuth redirect URI above is registered for the
production domain, and that `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in Vercel match the same
Google Cloud project.
