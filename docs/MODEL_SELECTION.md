# Claude Model Selection Guide

**IMPORTANT:** Before Claude starts work on any slice or subtask, Claude MUST verify with you that the correct model is selected. This is a mandatory check to ensure code quality and efficiency.

---

## Model Overview

| Model | Best For | Speed | Reasoning | Cost |
|-------|----------|-------|-----------|------|
| **Opus 5** | High-complexity tasks, complex validation, large UI systems | Slower | Excellent | Higher |
| **Sonnet 5** | Most tasks, APIs, business logic, tests | Fast | Very Good | Medium |
| **Haiku 4.5** | Simple CRUD, docs, straightforward work | Very Fast | Good | Low |

---

## Slice Assignments & Model Requirements

### ✅ COMPLETED (Slices 1–12) — all slices shipped
No model checks needed — already shipped.

- **Slice 7** used **Sonnet 5**, as planned. Pure module + service split held up well at this
  complexity; no need to escalate to Opus 5.
- **Slice 8** used **Sonnet 5** (Opus 5 recommended). Under-spec exception — verification
  scaled up: 23 unit tests + exhaustive live-DB coverage of every FR5a conflict-reason
  combination. Outcome: zero defects.
- **Slice 9** used **Opus 4.7** (Sonnet 5 recommended). Over-spec exception — no verification
  adjustment needed. Outcome: zero defects.
- **Slice 10** used **Sonnet 5**, as planned. No exception. Outcome: zero defects.
- **Slice 11** used **Haiku 4.5**, as planned. No exception. Outcome: zero defects.
- **Slice 12** used **Opus 5**, as planned. No exception. Largest slice (14 screens);
  outcome: zero defects in the new screens, plus four pre-existing issues found and fixed
  (font override, open redirect, `<a>` internal links, duplicated a11y labels).
- **Slice 13** (booking cancellation) used **Opus 5**, as planned. No exception. Outcome:
  20/20 live checks passed, plus two latent defects found and fixed — a status filter built
  from a hand-kept array that type-checked while silently omitting the new enum value, and an
  approval panel that would have reported a cancelled booking as "declined". A migration
  ordering hazard was also caught before it reached the database (enum value referenced by a
  check constraint in the same transaction; see `tasks.md`).
- **Slice 14** (dashboard "Upcoming stays" table) used **Sonnet 5**, as planned. No exception.
  A reported production filter error did not reproduce against the live database and was not
  pursued further as a code fix; a separate question about payment-gating the approval status
  was resolved by confirming the rule stays as built. Outcome: query verified live against the
  real dataset, production build succeeds.
- **Slice 15** (DayMode clearing + email notifications + contact page, 2026-08-27) used
  **Sonnet 5**, as assessed at the start of the work (established integration patterns —
  Resend's documented SDK, existing fetch-write-service architecture to extend, routine UI —
  not the kind of open-ended multi-constraint reasoning that would call for Opus 5). No
  exception. Outcome: production build succeeds, lint clean, all 211 unit tests pass, the
  `/contact` page browser-verified against a live dev server with no console errors. Also fixed
  along the way: two lint errors (unescaped quotes, an unused parameter) left over from the
  DayMode-clearing half of this session's work.

  > **⚠️ EXCEPTION LOGGED — 2026-08-27 (over-spec).** The owner switched to **Opus 5** partway
  > through, during the follow-up fix to Slice 15's email bug (see below). Heavier than this file
  > would recommend for a single-cause bugfix, and — as with Slice 9's over-spec exception — no
  > verification adjustment was needed; an over-spec model is not a risk the way an under-spec one
  > is. Standing recommendation for work on this module stays Sonnet 5.

  **Follow-up fix, same day (Opus 5):** the email feature shipped in this slice sent **zero**
  emails in production despite passing every local check. Cause was a serverless lifecycle bug,
  not a logic error — fire-and-forget promises being killed when Vercel freezes the function on
  response. Fixed with `after()` from `next/server`. Verified this time by an actual live send
  through the real Resend API (two emails confirmed received by the owner), not just by a green
  build — the original mistake was treating "build + tests pass" as evidence about a runtime
  behaviour neither one exercises. See `MEMORY.md` (2026-08-27) for the post-mortem.
- **Slice 16** (`email_log` table + volume circuit breaker, 2026-08-27) used **Opus 5**.

  > **⚠️ EXCEPTION LOGGED — over-spec.** This is a one-table, one-pure-module, one-service-module
  > slice with a dashboard panel — Sonnet 5 by this file's own criteria (compare Slice 10 and
  > Slice 11). The owner was already on Opus 5 from the preceding bugfix and chose to continue.
  > Flagged before starting rather than silently complied with, per the protocol below. As with
  > Slices 9 and 15's follow-up, no verification adjustment was needed — an over-spec model is not
  > a risk the way an under-spec one is.

  Outcome: 12 new unit tests (223 total, up from 211), production build succeeds, lint clean, and
  — following the lesson from Slice 15 — verified against the live database rather than by build
  alone: schema shape confirmed column-by-column, existing data confirmed untouched, and a real
  send driven end-to-end to watch the counter and log row update. Migration applied to production
  with the owner's explicit approval per `HITL.md`.
- **Slice 17** ("Reserve Request" — the roadmap's own next slice, 2026-08-27) used **Sonnet 5**,
  as assessed once the actual scope became clear (one business rule, one pure-function change,
  one new query — well within Sonnet 5's established band, not the kind of open-ended
  multi-constraint reasoning Opus 5 is reserved for). No exception.

  Investigated the existing code before writing anything and found most of the originally-scoped
  feature already worked — see `MEMORY.md` (2026-08-27) for the full account. What actually
  shipped was smaller than the roadmap entry implied: a customer-wide cap of 6 simultaneous
  `reserved` bookings, no new endpoint, no schema change, no new UI.

  Outcome: 7 new unit tests (237 total), covering the exact boundary, that the cap is checked
  before per-night date work (so its error message is never masked by an unrelated
  date-conflict error), and that a capacity violation still takes priority. The count query was
  also cross-checked against real production data, customer by customer, rather than trusting
  the unit tests alone for a query that had never run before.

- **Slice 18** (WhatsApp integration + advance-amount-required-to-approve, 2026-08-28, branch
  `feature/whatsapp-integration`) used **Opus 5**, owner-confirmed before starting. No exception.
  Justified by the same reasoning as Slice 9's `Opus 4.7` choice for this module: the change
  touches `vote.ts`, the core trust mechanism, tightening a business rule rather than just adding
  UI. Outcome: 12 new unit tests (255 total), zero defects found live — see `docs/tasks.md` for
  the full verification log.

See `docs/tasks.md` for the full verification log for each.

---

### Slice details — all shipped, kept for reference

#### **Slice 7: Day-detail endpoint** → **SONNET 5** ⭐ (done)
- **What:** `GET /calendar/:date` — customer view (RoomStatus, no guest identity) vs admin view (full detail)
- **Why Sonnet 5:**
  - Medium complexity, straightforward data derivation
  - Follows established pattern from Slices 5–6
  - No multi-constraint validation needed
  - Good speed for API design
- **Claude MUST check:** "Have you verified Sonnet 5 is selected?"
- **Subtasks & their models:**
  - Pure module (date-to-status logic): Sonnet 5
  - Route implementation: Sonnet 5
  - Unit tests: Sonnet 5
  - Integration tests vs live DB: Sonnet 5
  - API docs update: Haiku 4.5

---

#### **Slice 8: Booking creation** → **OPUS 5** ⭐⭐ *CRITICAL* (built with Sonnet 5 — exception, see below)
- **What:** `POST /bookings` — validate BookingWindow, every date in range (DayMode match, not unavailable, no conflict), reject with specific conflicting dates named, validate guest count vs capacity
- **Complexity Factors:**
  - FR5a: If any date in a 5-night range conflicts, reject the whole request but name which specific dates conflict
  - Multi-constraint validation: DayMode, unavailable flag, booking conflicts, capacity
  - Edge cases: ranges spanning mode boundaries, checkout day semantics, partial overlaps
- **Why Opus 5 was recommended:**
  - Highest reasoning needed — edge case handling is non-trivial
  - Multi-constraint reasoning: does a single conflict block the whole booking?
  - Need careful error messaging per FR5a
  - Similar to Slice 8's complexity from earlier versions

> **⚠️ EXCEPTION LOGGED — 2026-08-24:** The owner explicitly requested this slice be built with
> **Sonnet 5** instead, as a one-off. Per the exception-handling rule below, Claude did NOT
> silently comply — it flagged the deviation from this file's recommendation, then compensated by
> scaling up verification: 23 unit tests (vs. the ~11 typical for a Sonnet-level slice) covering
> every FR5a conflict-reason combination individually and in mixed-reason combination, plus a
> live-database pass exercising each rejection path (multi-reason rejection, half-open boundary on
> both the BookingWindow and existing-booking-conflict checks, capacity, wrong item kind) rather
> than a lighter spot-check. Outcome: all tests passed, live verification found no defects. This
> does not change the standing recommendation above for any future work on this module — a
> revision or extension to booking-creation validation should still default to Opus 5 unless the
> owner exceptions it again.

- **Subtasks & their models (as actually built):**
  - Pure module (booking validation logic): Sonnet 5
  - Route implementation: Sonnet 5
  - Edge case tests (mode boundaries, conflicts, capacity): Sonnet 5 — expanded scope, see above
  - Integration tests vs live DB: Sonnet 5 — expanded scope, see above
  - API docs: Sonnet 5 (folded into the same pass rather than handed to Haiku, since the
    conflict-reason shape needed to match the validation logic exactly)

---

#### **Slice 9: ApprovalVote** → **SONNET 5** (built with Opus 4.7 — over-spec exception, see below)
- **What:** `POST /bookings/:id/vote` — 2-approve/1-decline logic, booking_audit_log entries

> **⚠️ EXCEPTION LOGGED — 2026-08-24:** The owner selected **Opus 4.7** for this slice
> (over-spec — heavier than needed). Per the exception protocol below, Claude flagged the
> deviation before starting and offered to switch. Owner chose to proceed with Opus 4.7.
> Outcome: slice built and verified against live database with all 13 unit tests passing and no
> defects found. No verification-scope adjustment was needed for an over-spec exception (unlike
> the under-spec case in Slice 8, which required scaling verification up); the model choice
> here was simply heavier than the task required, not lighter. Standing recommendation
> (Sonnet 5) unchanged for any future work on this module.
- **Complexity:** Medium (well-defined state machine, no surprises)
- **Why Sonnet 5:**
  - Clear business logic: 2 approves → booked, 1 decline → declined
  - State transitions are straightforward
  - Audit logging is routine
  - Good speed for business logic
- **Claude MUST check:** "Have you verified Sonnet 5 is selected?"
- **Subtasks & their models:**
  - State logic module: Sonnet 5
  - Route + audit logging: Sonnet 5
  - Tests: Sonnet 5
  - API docs: Haiku 4.5

---

#### **Slice 10: Admin booking update** → **SONNET 5** (done)
- **What:** Comprehensive booking update (phone, payment stage, advance payment, internal notes)
- **Complexity:** Medium (routine CRUD, pattern precedent from earlier hotel project)
- **Why Sonnet 5:**
  - Straightforward update logic
  - Similar to patterns already proven
  - No complex validation
  - Good balance of speed and capability
- **Claude MUST check:** "Have you verified Sonnet 5 is selected?"
- **Subtasks & their models:**
  - Update route: Sonnet 5
  - Field validation: Sonnet 5
  - Tests: Sonnet 5
  - API docs: Haiku 4.5

---

#### **Slice 11: DefaultNotes + CustomNotes** → **HAIKU 4.5** (done)
- **What:** Admin edit endpoint, shown in booking flow (placeholder text until admin fills in real content)
- **Complexity:** Low (straightforward CRUD, no business logic)
- **Why Haiku 4.5:**
  - Simple CRUD operations
  - No complex validation or state logic
  - Efficient for routine endpoints
  - Low cost for simple work
- **Claude MUST check:** "Have you verified Haiku 4.5 is selected?"
- **Subtasks & their models:**
  - Update route: Haiku 4.5
  - Tests: Haiku 4.5
  - API docs: Haiku 4.5

---

#### **Slice 12: Frontend screens (~14)** → **OPUS 5** ⭐⭐ *CRITICAL* (done)
- **What:** Guest & admin pages — guest: home, rooms/villa listing + detail, colour-coded calendar, day-detail, booking form, my-bookings; admin: login, bookings list, booking detail (vote/payment/history), calendar + DayMode controls, items manager w/ upload, notes editor, admin accounts
- **Complexity Factors:**
  - 14 separate screens across 2 user types
  - Multiple patterns: listing (bookings, rooms), detail (booking, room), forms (booking, notes), calendar (interactive)
  - State management: booking state, user auth, form state, calendar filters
  - Mobile-first responsive design
  - Component architecture needed (buttons, modals, cards, tables, forms)
- **Why Opus 5:**
  - Largest scope remaining (~50% of work, per tasks.md)
  - Needs component hierarchy design, routing strategy, state patterns
  - Responsive design decisions (mobile first) require thoughtful architecture
  - Multiple screen types mean careful pattern consistency
  - Opus handles multi-screen UI projects far better than smaller models
- **Claude MUST check:** "Have you verified Opus 5 is selected? This is the largest remaining slice."
- **Subtasks & their models:**
  - Component system design: Opus 5
  - Page layouts (listing, detail, forms): Opus 5
  - State management (forms, booking flow): Opus 5
  - Calendar/date picker interactions: Sonnet 5 (after Opus sets architecture)
  - Styling/responsive: Sonnet 5 or Haiku 4.5
  - Tests: Sonnet 5
  - Docs: Haiku 4.5

---

## How Claude Should Behave

### ✅ BEFORE starting any slice or subtask:

1. **Identify the slice/subtask** — which one is it?
2. **Look up the model** — check this file for the assigned model
3. **Ask the user:**
   > "I'm about to work on [Slice X: Description]. This should use **[MODEL NAME]**. Have you verified [MODEL NAME] is selected in your Claude settings?"
4. **Wait for confirmation** — do not proceed until user confirms
5. **Proceed** — once confirmed, start the work

### ✅ WHEN suggesting a subtask:

1. **Analyze the subtask** — what does it need?
2. **Determine the model** — should be the same as parent slice, but if different, flag it
3. **Tell the user explicitly:**
   > "This subtask (`name`) needs **[MODEL NAME]**. Is [MODEL NAME] currently selected?"

### ✅ IF a subtask needs a different model:

- **Example:** Slice 12 (Opus 5) needs calendar styling → "This styling work is routine; we could use Sonnet 5 for speed. Should I switch, or stay with Opus 5?"
- **Let user decide** — don't switch without asking

### ❌ NEVER:
- Start work without asking about model selection
- Assume the model from the last task is still selected
- Proceed if user doesn't confirm

### ⚠️ IF the user overrides the recommended model (exception handling):

This has happened in both directions so far:
- **Slice 8:** Opus 5 recommended, Sonnet 5 used (under-spec — required scaling verification up).
- **Slice 9:** Sonnet 5 recommended, Opus 4.7 used (over-spec — no verification adjustment needed).

When it happens again:

1. **Don't silently comply.** Name the gap out loud — e.g. "Noted — this deviates from
   MODEL_SELECTION.md's Opus 5 recommendation for this slice. Proceeding on Sonnet 5 as an
   exception."
2. **Compensate in verification, not in scope.** Do not cut corners to fit the lighter model —
   instead widen the test/verification pass to cover the specific risk the stronger model would
   have mitigated (e.g. for a validation-heavy slice, write more edge-case tests than usual and
   verify each one against the live database individually, not just spot-check).
3. **Log the exception where the slice's own record lives** — in `docs/tasks.md`'s entry for that
   slice, and in this file's entry for that slice (as a `>` note, not by silently editing the
   original recommendation away). The recommendation itself stays as the default for next time;
   the exception is a one-off, not a policy change.
4. **Do not treat this as license to skip the check next time.** The next slice still gets the
   full "have you verified the model?" question — one exception does not relax the pattern.

---

## Summary Table (Quick Reference)

| Slice | Task | Model | Complexity | Priority |
|-------|------|-------|-----------|----------|
| 7 | Day-detail endpoint | Sonnet 5 | Medium | High (next) |
| 8 | Booking creation | **Opus 5** | **High** | High |
| 9 | ApprovalVote | Sonnet 5 | Medium | Medium |
| 10 | Admin booking update | Sonnet 5 | Medium | Medium |
| 11 | Notes CRUD | Haiku 4.5 | Low | Low |
| 12 | Frontend screens | **Opus 5** | **Very High** | High |

---

## Historical Context

- Slices 1–6 used mixed models based on task complexity
- This document standardizes selections going forward
- Model selection is now a **mandatory checkpoint** before work starts
- Subtasks inherit parent slice model unless explicitly different

---

## For Claude: Activation Checklist

Before you output any code or take any action on a slice:

```
[ ] Slice identified: _______________
[ ] Model assigned: _______________
[ ] User asked & confirmed: _______________
[ ] Proceed with work: _______________
```

**This is not optional.** The user wants this reminder every time.
