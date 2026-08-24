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
