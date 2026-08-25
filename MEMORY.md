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
