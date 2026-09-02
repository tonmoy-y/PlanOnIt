# FINAL IMPLEMENTATION REPORT

> **Revision 3 (final hardening pass).** Closes the reserved-plan replacement defect, makes `reservation_pending` observable, aligns advertised schemas with runtime cross-field rules, adds real multi-viewport browser verification, and adds an opt-in server-authoritative reservation boundary. Sections 8 and 9 are restated at the end of this file; where the older text below disagrees with those sections, the later sections are current.

## 1. What Was Fixed

The independent 32.8/40 audit was reproduced before implementation. Its P0 exact-capacity failure was captured in a failing regression: a successful reservation reduced remaining capacity to zero and then invalidated the owning plan. Reservation evaluation is now ownership-aware, selected restaurant/showtime snapshots come from current provider state, and the owning reserved plan remains valid. Unsupported and past dates, excessive idle gaps, stale approval, malformed atomic selections, and unchanged updates are also handled explicitly.

## 2. What Was Rebuilt

Plan status now follows explicit draft, valid, approved, reservation-pending, reserved, and reservation-failed semantics. Reservations carry plan/version identity, provider revision, idempotency key, and inventory records. Failed attempts release attempted inventory and consume nothing. The provider supports a declared 2026-09-03 through 2026-09-16 inventory window rather than pretending a two-day fixture exists on arbitrary dates.

## 3. UX Overhaul

The existing visual system was retained and improved surgically. A restored plan opens at the plan workspace, normal users see human-readable state instead of persistent version noise, technical version/provider details remain available on demand, and each state presents a clearer next action. Invalid plans show the leading failure, automatic/manual repair choices, an external-agent prompt, and a post-repair change summary. Numeric errors are associated with their controls through `aria-invalid`, `aria-describedby`, and alert semantics.

## 4. WebMCP Improvements

All 12 imperative tools use strict runtime validation and aligned JSON Schema bounds. Every success and error includes current plan/provider context. `get_current_plan` returns current ownership-aware provider snapshots; `update_plan` treats unchanged input as a no-op; `repair_plan` records its dependency recalculation; and `reserve_plan` reports explicit transitions and cannot bypass human approval. The built-in browser discovered and directly invoked the live tools: it rejected an unsupported date, created a valid preference-sensitive plan, updated the visible UI, and returned the same current snapshot afterward.

## 5. Provider / Persistence Architecture

One domain layer evaluates UI and WebMCP mutations. The mutable demo provider owns capacities, seats, revision, reservations, failure injection, and idempotency. Persistence validates the complete plan/provider envelope. Same-origin writes use a Web Locks-backed compare-and-swap against the complete prior plan snapshot; storage events synchronize the committed result. This is the strongest browser-origin boundary implemented here, but it is not a trusted hosted service.

## 6. Reservation & Concurrency Model

Approval is bound to the exact positive plan version and provider revision. Reservation checks both again, validates current feasibility, enters an explicit pending representation, then commits both inventories or records a failed/released attempt. Repeated confirmation is idempotent. A real two-tab browser race started from version 7: one mutation committed version 8, the other returned `STALE_PLAN_VERSION`, and both tabs converged on the same version 8 state. No timestamp-based last-write-wins remains.

## 7. Testing

- 81 tests across 6 files passed **at that revision** (see Revision 4 for current counts).
- Lint and TypeScript checks pass.
- Tests cover exact-capacity ownership, post-reservation validity, stale/repeated/failed/successful reservation, provider conflict and revision, no-op updates, date and timing boundaries, schema alignment, simultaneous compare-and-swap, repair, approval, keyboard navigation, and error association.
- Real browser verification covered live WebMCP discovery/invocation, tool-to-UI mutation, human approval, successful reservation, post-reservation validity, two-tab conflict recovery, and zero console errors.
- 375×812, 390×844, and 412×915 viewport checks showed no horizontal overflow and retained navigation and critical actions.
- The production build and standalone root `index.html` pass regression checks.

## 8. Deployment Status

Deployment is **prepared but unverified**. `netlify.toml` builds with `npm run build` and publishes `dist`, with baseline security and cache headers. No Netlify CLI, site association, deployment token, or public URL exists in this checkout, so no deployment success is claimed. After authenticating/linking the intended site, run:

```bash
npm ci
npm run build
npx netlify deploy --prod --dir=dist
```

Then repeat the live WebMCP and mobile checks against the returned HTTPS URL.

## 9. Final Independent Score

| Category | Score | Evidence |
|---|---:|---|
| WebMCP Leverage | 9.7/10 | Twelve coherent live tools, strict schemas, contextual outputs, shared mutations, repair, and gated action. |
| Execution | 9.4/10 | P0 fixed, 81 tests, production/standalone builds, real browser/mobile/two-tab verification; hosted state and deployment remain absent. |
| Potential Impact | 9.0/10 | The transparent human-agent coordination pattern generalizes well, but the sandbox remains one city and one browser origin. |
| Creativity & Ambition | 9.3/10 | Ownership-aware commitments, repair under change, explicit feasibility receipts, and safe human approval create a credible agent-native workflow. |
| **Total** | **37.4/40** *(historical — revision 2)* | Strong local submission; the missing trusted hosted boundary and verified live deployment prevent an honest 39+. |

## 10. Remaining Weaknesses

- Inventory and workspace state are browser-origin scoped, not authenticated server-authoritative state.
- No current public deployment could be verified.
- Data is controlled Dhaka sandbox inventory rather than commercial provider APIs.
- A polished submission video and Devpost publication are external work not present in this checkout.

## 11. Final Verdict

**IMPROVE BEFORE SUBMISSION** if the standard is truly 39+/40. The code is now correct, demonstrable, and substantially more competitive, but reaching 39+ requires a trusted hosted provider/workspace transaction boundary and verification of the actual HTTPS deployment. If the deadline prevents those two infrastructure tasks, this build is still a defensible submission, but it should not be scored as 39 merely because that was the target.


---

## 12. Revision 3 — what changed after the 37.2/40 audit

### 12.1 Reserved-plan lifecycle (P0)

The audit was reproduced exactly: with version 11 reserved, `create_evening_plan` created version 12, the workspace stopped exposing the reservation, and the provider still held `current-plan:v11` committed — a hidden historical commitment, and an inconsistency with `update_plan`'s `PLAN_IMMUTABLE`.

Fixed on every path. `create_evening_plan` now returns `WORKSPACE_HAS_ACTIVE_RESERVATION` naming the reservation and the required next call, and the human paths (`Create plan preview`, date change, local repair) are gated by the same predicate. Planning again requires the explicit `start_new_plan` tool or the **Start a new plan** button, which raises the version, clears the draft, preserves the constraints and preferences, and leaves the reservation committed. Nothing is cancelled or detached; the provider's reservation ledger is the archive, surfaced through `get_current_plan.reservationLedger` (with `belongsToCurrentPlan` and `supersededByNewerPlan`) and rendered as **Reservation history**. Repeating the lifecycle call is safe and archives nothing twice.

### 12.2 Observable pending state

`reservePlan` is now asynchronous and commits the `reservation_pending` plan *before* the inventory transaction, through the same compare-and-swap persistence as every other mutation. The transitions are `approved → reservation_pending → reserved | reservation_failed`, all persisted and all in the audit trail. No artificial latency was introduced: the pending commit is a real write that must succeed before inventory can move.

### 12.3 Advertised schema alignment

`update_plan` now advertises `minProperties: 2` (expected version plus at least one real change) and `dependentRequired` for both atomic pairs, so a compliant client can reject `movieId` without `showtimeId` before calling. All 13 tools were audited: every schema is a strict object with `additionalProperties: false`, every required key exists in `properties`, and side effects are stated in each description. Runtime validation was not weakened anywhere; JSON Schema still cannot express "the showtime must belong to the movie", so that rule stays in Zod and is stated in the tool description.

### 12.4 Verified mobile and accessibility behavior

`tests/browser/mobile.spec.ts` runs the real production build in Chromium at 375×812, 390×844 and 412×915 (`npm run test:browser`). Each viewport asserts: all 13 tools register through a real `document.modelContext`, no element extends past the viewport, no console errors, ≥44px navigation tap targets, ≥12px secondary text, `role="alert"` / `aria-invalid` / `aria-describedby` on field errors, keyboard focus and activation, and the complete plan → repair → approve → reserve → start-new-plan workflow. 12/12 passed at that revision.

### 12.5 Readability

Every 8–11px label was raised to a 12px floor (22 declarations), navigation and slot buttons were raised to 44px minimum height, and the reservation-history component was added to the existing visual system. No redesign.

### 12.6 Authority boundary

`src/authority.ts` introduces `ReservationAuthority` at the one consequential write. `LocalReservationAuthority` (default, unchanged behavior) and `RemoteReservationAuthority` (token-authenticated, fail-closed, imports the server's canonical provider state) implement it; `netlify/functions/reserve.mjs` is the server side, owning the ledger, capacity re-check, idempotency key and revision. Remote is opt-in via `VITE_PLANONIT_AUTHORITY_ENDPOINT` and is **not enabled or verified in production**. Reads stay local and synchronous, so the solver, tools, UI and tests were not disturbed. *(Revision 5 corrected two defects in this layer — see section 14.)*

## 13. Current verification (revision 3)

| Check | Result |
|---|---|
| Unit/integration tests | **112 passed**, 9 files *(revision 3 figure — see revision 5)* |
| Browser tests | **12 passed** at 375×812, 390×844, 412×915 *(revision 3 figure)* |
| Lint | pass (`--max-warnings 0`) |
| TypeScript | pass |
| Production build | pass, standalone root entry regenerated |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Adversarial suite | forged approvals, forged revisions, fabricated reservations, smuggled fields, reserved-plan mutation on all three tool paths, and repair-with-no-inventory all rejected |

## 14. Deployment (revision 3)

Deployed and reachable over HTTPS at <https://planonit.netlify.app/>, built from this repository on push. Netlify serves `dist` with the security headers in `netlify.toml`. **The live site reflects the last pushed commit; this revision must be pushed before the deployment matches the code described here.**

## 15. Remaining limitations (revision 3)

- Production runs the browser-local authority. The server-authoritative path exists, is tested against a mocked transport, and is not enabled or verified in production.
- There is no per-user authentication; a browser client cannot hold a secret. Workspace state remains browser-origin scoped.
- Inventory is deterministic Dhaka sandbox data generated from a single day's fixtures, not a commercial provider API.
- The supported window is the fixed range 2026-09-03 – 2026-09-16. After that date the app has no plannable inventory.
- Reservations can be superseded but not cancelled; released inventory is not returned to the ledger.
- `repair_plan` re-solves rather than computing a minimal diff, and the UI's repair summary is descriptive rather than a computed change list.


---

## 13. Revision 4 — hardening after the 34.5/40 audit

Every score above this line is **historical**. This section is the current state of the repository.

### Defects fixed

**BUG-1 — `reservation_pending` was not fully protected, and an in-flight reservation could
overwrite a newer plan.** There is now a single authoritative lifecycle predicate,
`isPlanImmutable(plan)` in `src/domain.ts`, and every mutation path asks it instead of
re-deriving the rule: `applyPlanUpdate`, `repairPlan`, `approvePlan`, `startNewPlan`,
`reservePlan`, the five mutating WebMCP tools, and the human UI (which also disables the
controls rather than offering edits that must fail). The async race is closed by capturing
the complete reservation intent *before* the awaited authority call and re-reading the live
workspace after it: `reservePlan` accepts a `readCurrentPlan` callback and refuses to write
its result if the plan identity, version, status, date, party size, or selections moved,
returning `RESERVATION_STATE_CHANGED` instead. No older result can overwrite a newer plan and
no version can regress.

**BUG-2 — idempotency was content-blind.** `planId:version` is no longer the idempotency key.
`src/intent.ts` canonicalises the full reservation intent (plan id, version, date, people,
restaurant, slot, restaurant inventory key, movie, showtime, showtime inventory key, showtime
start time, transport option), hashes it, and that fingerprint is the idempotency key on the
plan, in the provider ledger, and in the request body sent to the remote authority. An
identical intent replays; a different restaurant, slot, movie, showtime, date, party size,
transport option, or inventory key is rejected with `RESERVATION_INTENT_MISMATCH`.

**Ownership/integrity.** `reservationOwnership()` compares the reservation on the plan, the
reservation in the provider ledger, and the actually committed inventory keys and quantities
against the plan's current selections. "Reserved · confirmed" can no longer be shown for
inventory that does not belong to the current plan.

**BUG-3 / BUG-4 — stale documentation and duplicated toast text.** Counts and claims in this
repository now match the code; the human toast prints one sentence and only appends a detail
line when it differs from the message.

### Product changes

- The evening now runs **movie → travel → dinner**, which is how the outing actually happens.
  Chronology, the solver, the demo showtimes and table windows, and the itinerary were all
  rebuilt around it, and a new `restaurant_hours` check keeps dinner inside the operating window.
- Restaurant cards show an operating window (`Open 17:00–23:00`) and a typical spend band
  (`৳700–৳1,000 / person`, always bracketing the price used for costing) instead of raw
  capacity counts and slot buttons. The table time is derived from the film.
- **Reset plan** clears only PlanOnIt's own storage keys, behind an explicit confirmation that
  states what it does and does not cancel. Confirmed reservations stay in the ledger.
- Reserved and pending plans disable their inputs and drop dead-end actions.
- Accessibility: no meaningful text below 11px, 44px targets on every added control.

### Verification actually run (Linux sandbox, revision 5)

| Check | Command | Result |
| --- | --- | --- |
| Unit + integration | `npx vitest run` | **168 passed / 168**, 11 files |
| Real-browser mobile | `npx playwright test` | **21 passed / 21** — 7 scenarios x 375x812, 390x844, 412x915, Chromium 151.0.7922.34 against the production preview build |
| TypeScript | `tsc -b` | clean |
| Lint | `eslint src tests --max-warnings 0` | clean |
| Production build | `npm run build` | ok — `dist/` + inlined standalone `index.html` |
| Dependency audit | `npm audit` (dev + prod) | 0 vulnerabilities |

Earlier revisions could not execute Playwright in this sandbox. In revision 5 the missing
Chromium shared libraries were extracted into a user-local prefix, so the browser suite was
**actually executed** rather than merely written; the results above are observed, not claimed.

**Deployment, verified live on 2026-09-02:** <https://planonit.netlify.app/> responds over
HTTPS and the app boots and plans correctly there — but it is serving an **older build**. The
live golden path renders the pre-revision-4 dinner → travel → movie itinerary, shows raw seat
inventory ("29 seats available now"), and lacks the reservation-integrity check. Netlify builds
from the last pushed commit; the working tree contains ~900 lines of unpushed work. **This is
the single largest submission risk and it is not a code defect — it is a release step.** Commit
and push `main`, then re-check the live URL, before submitting. Hosted provider state remains
out of scope: the deployment has no server authority enabled (see §12).

## 14. Revision 5 — abandoned in-flight reservation recovery

### The defect (P1, correctness + dead-end UX)

`reservation_pending` is deliberately immutable, and every mutation path enforces that through
the single `isPlanImmutable` predicate. That is correct while an attempt is genuinely in
flight. It is a dead end once the attempt is *not* in flight: a tab that wrote the pending
state and was then closed, reloaded, or crashed leaves a persisted plan that `update_plan`,
`repair_plan`, `approve`, `reserve_plan`, and `start_new_plan` all refuse — with the ledger
holding nothing, so no inventory was ever consumed. The only escape was the destructive
Reset, which throws away the draft. This was reproduced as a failing scenario before the fix
(`tests/lifecycle.test.ts` → "reproduces the dead end: every path refuses a persisted pending
plan"), which remains in the suite as the guard.

### The fix

`reconcileAbandonedReservation(plan, provider)` runs once at load, when nothing can be in
flight in this process, and only for `reservation_pending`:

- If the authoritative ledger holds a **confirmed** commitment whose content fingerprint
  matches the plan's exact intent, the plan is promoted to `reserved` using the ledger's own
  record. A commitment that really happened is never lost, hidden, or duplicated.
- Otherwise nothing was committed, so the attempt is recorded as `reservation_failed` with its
  holds released, `failureCode: RESERVATION_ABANDONED`, and approval cleared — the human must
  approve again.

The version never moves, no inventory is consumed, no ledger entry is written, and a ledger
entry belonging to a *different* intent is refused rather than adopted. The recovered state is
written back with the stored plan as the CAS token so the workspace converges instead of
recovering on every reload, and the recovery is recorded in the activity trail.

### Also fixed in revision 5

- **Reversed evening order in the plan summary.** The current-plan header read
  "<restaurant> followed by <movie>", implying dinner precedes the film. It now reads
  "<movie>, then dinner at <restaurant>", matching the movie → travel → dinner model used
  everywhere else and by the feasibility engine.
- **Duplicated screen-reader announcement.** Every toast was announced twice: once by the
  persistent `.sr-live` region and once by the toast's own `role="alert"`/`role="status"`.
  The visible toast is now `aria-hidden`, and the single live region escalates to
  `role="alert"`/`aria-live="assertive"` for errors.
- **Stale documentation.** `docs/ADVERSARIAL_AUDIT.md` still claimed 112 tests and 12 tools;
  a source comment cited a `tests/data.test.ts` that does not exist. Both corrected.

### Regression coverage added

Six domain-level tests in `tests/lifecycle.test.ts` (dead-end reproduction, release without
consuming inventory, promotion from a matching ledger entry, refusal of a mismatched ledger
entry, no effect on any other status, idempotence on repeat), one jsdom reload test in
`tests/app.test.tsx`, and one real-browser reload test in `tests/browser/mobile.spec.ts`
running at all three mobile viewports.


---

## 14. Revision 5 — authority security and transaction correctness

Two defects introduced by the revision-3 authority layer were found and fixed. The rest of the revision-4 audit findings (pending-state immutability, the in-flight reservation race, content-blind idempotency, duplicated toast text) were re-verified as already fixed before any change was made, and were not touched.

**Public bearer secret removed.** The client resolved its authority with `token: import.meta.env.VITE_PLANONIT_AUTHORITY_TOKEN`. Every `VITE_`-prefixed value is inlined into the public bundle, so that would have shipped a shared workspace secret to every visitor while describing the endpoint as authenticated. The client now passes an endpoint only; `token` remains on `RemoteAuthorityOptions` for trusted server-side callers. The consequence is stated rather than hidden: because the function requires a bearer token and a browser cannot hold one, the remote authority is **not** usable from the deployed app, which is exactly why it ships disabled.

**Read-then-write replaced with a real compare-and-swap.** The function read the ledger, re-read it, compared revisions and wrote — a TOCTOU window that could lose a concurrent commitment while being described as transactional. It now reads with `getWithMetadata` and writes with `setJSON(..., { onlyIfMatch: etag })` (`onlyIfNew` when the ledger is absent); a rejected conditional write returns `AUTHORITY_REVISION_CONFLICT`.

### Revision 5 verification

| Check | Command | Result |
|---|---|---|
| Unit + integration | `npx vitest run` | **168 passed / 168**, 11 files |
| Real-browser mobile | `npx playwright test` | **21 passed / 21** — 7 scenarios x 375x812, 390x844, 412x915, Chromium 151 against the production build |
| Lint | `npx eslint src tests --max-warnings 0` | pass |
| TypeScript | `npx tsc -b` | pass |
| Production build | `npm run build` | pass, standalone entry regenerated |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Adversarial probe | ad-hoc | 13 tools; fingerprint differs on restaurant/slot/showtime/date/party/version and matches only on identical intent; swapped selections under a real reservation fail integrity; a stolen reservation record fails; `update`/`repair`/`create` all blocked in both `reserved` and `reservation_pending`; `start_new_plan` never inherits the old reservation; no approval tool exists |


---

## 15. Revision 6 — the demo can no longer expire

The inventory window was two hard-coded dates (`2026-09-03` .. `2026-09-16`). Every earlier report listed this as a limitation; it was in fact a scheduled outage — the day after the range passed, no date would validate and the app had nothing to plan.

**Rolling window.** `planningWindow()` now derives the range from the current date (`today + 2`, fourteen days). It is evaluated at validation time, advertised in the WebMCP `date` enums at registration time, and enforced by the provider through the same function, so schema and provider can never disagree. The fixtures remain one template day (`TEMPLATE_DATE`) that the provider projects onto whichever dates are supported. `setPlanningWindowOrigin` pins the origin under test, which reproduces the historical window exactly — all 168 pre-existing tests passed unchanged.

**Two defects found by adversarial probing of the new behavior, both fixed:**

- A confirmed reservation whose evening had passed reported *"Reservation integrity failure: reservation intent does not match…"* — a genuine commitment accused of forgery, because live inventory could no longer be projected for that date. Ownership now compares the immutable ledger record when the date is outside the window, so a real reservation reads as *"This evening has passed. Reservation … stays committed in the ledger"*, while a forged one still fails. A new leading `date_window` check states the real reason the plan is no longer current.
- `start_new_plan` carried the stale date into the fresh plan, so the new plan opened outside the window and could not be solved. It now opens on a currently supported date.

### Revision 6 verification

| Check | Command | Result |
|---|---|---|
| Unit + integration | `npx vitest run` | **187 passed / 187**, 13 files |
| Real-browser mobile | `npx playwright test` | **21 passed / 21** — 7 scenarios x 375x812, 390x844, 412x915, Chromium 151, production build |
| Lint | `npx eslint src tests --max-warnings 0` | pass |
| TypeScript | `npx tsc -b` | pass |
| Production build | `npm run build` | pass |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
