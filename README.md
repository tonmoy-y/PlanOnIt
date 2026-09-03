# PlanOnIt

PlanOnIt is a human-controlled planning workspace where an external AI agent can plan a real evening out — **a film, the journey across the city, and dinner afterwards** — through WebMCP, repair conflicts, and leave final approval to the person using the page.

[Public repository](https://github.com/tonmoy-y/PlanOnIt)

**Live deployment:** <https://planonit.netlify.app/> — served over HTTPS from Netlify, built from this repository on push. `netlify.toml` holds the build, publish, function and security-header settings.

> ℹ️ **Cache note.** Netlify served `/assets/*` with a one-year immutable `Cache-Control`,
> but earlier builds gave the JS/CSS bundle the same filename on every deploy
> (`assets/index.js`). A returning browser therefore kept the previous deploy's bundle
> indefinitely and never saw new work land, even though `main` was up to date. As of the
> 2026-09-03 fix, `vite.config.ts` content-hashes the built filenames, so each deploy gets a
> new URL and this cannot happen again. If you visited the site before this fix, hard-refresh
> once (Cmd/Ctrl+Shift+R) to drop the stale cached bundle.

## Run and verify

```bash
npm install
npm run dev
```

Open the Vite URL. Production and quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npm run preview
```

`npm run build` creates the normal Netlify-ready `dist/` output and regenerates the committed root `index.html` as a single file with inlined CSS and JavaScript. The root file can therefore be opened directly without the previous `file://` asset failure.

## Judge fast path

1. Open the app in the supported ChatGPT built-in browser.
2. Confirm the Goal tab's agent card now reads "Your agent can use this page" (tools are registered). The header itself carries no status pill at all - registration state shows only where it's relevant, on the Goal tab and the Activity page - and the WebMCP contract is unchanged, still exposing 13 tools to the agent.
3. Copy the on-page request shown in the Goal tab's agent card (e.g. “Plan a [date] evening in Dhaka for 3 people under ৳5000. Use PlanOnIt's site tools, show me feasibility evidence, and leave approval to me.”) — the date is filled in automatically from the app's rolling two-week supported window, so it's always current; don't type an older date from memory.
4. Review the resulting timeline (film → travel → dinner), nine checks, provider revision, and scaled total.
5. Make a manual choice that breaks the plan, then ask the agent to use `repair_plan` while preserving that choice.
6. Approve the repaired version in the UI. Approval is never available as a WebMCP tool.

The **Create plan preview** button is an honest local fallback. It uses the same domain solver but is not presented as an external agent call.

## WebMCP design

PlanOnIt follows the [official WebMCP guidance](https://learn.chatgpt.com/docs/webmcp): imperative top-level registration, narrow schemas, explicit side effects, runtime validation, useful verification context, and a fully usable human interface.

| Job | Tools |
|---|---|
| Discover | `search_restaurants`, `get_restaurant_details`, `check_restaurant_availability`, `find_showtimes`, `estimate_transport` |
| Plan and verify | `create_evening_plan`, `get_current_plan`, `validate_plan`, `calculate_total_cost` |
| Collaborate | `update_plan`, `repair_plan` |
| Confirm | `reserve_plan` |
| Lifecycle | `start_new_plan` |

All 13 handlers parse untrusted input with strict Zod schemas. Mutations require `expectedVersion`; restaurant/slot and movie/showtime pairs are atomic; invalid references and incomplete prices never become fake zero-cost successes.

## Feasibility and safety

Every plan exposes nine blocking checks:

1. required selections;
2. city consistency;
3. exact table/date/party availability;
4. movie/showtime/date/seat integrity;
5. reservation ownership — the provider's committed inventory must match this plan's current selections;
6. a route-specific transport option;
7. chronology: film start + running time + travel + arrival buffer must land before the table, within the idle-time policy;
8. the restaurant's operating window — dinner must start after opening and finish before closing;
9. the party-scaled total budget.

### The evening runs movie → travel → dinner

The film is the anchor. Dinner is booked *after* the credits: the solver takes the showtime, adds the running
time, the route-specific travel time and the arrival buffer, and only then looks for a table. Restaurant cards
show an operating window and a typical per-person price band rather than raw provider capacity; the exact table
time is a derived, dependent choice, which is also why `repair_plan` may move the booking while keeping the
restaurant you asked for.

### Reserved-plan lifecycle

A confirmed reservation makes its plan immutable, and that is now enforced on *every* path. `update_plan` returns `PLAN_IMMUTABLE`, `repair_plan` returns `PLAN_ALREADY_RESERVED`, and `create_evening_plan` returns `WORKSPACE_HAS_ACTIVE_RESERVATION` instead of silently replacing the reserved plan and hiding its still-committed inventory. To plan again the caller must take an explicit step — the `start_new_plan` tool, or **Start a new plan** in the UI — which raises the version, clears the draft, and leaves the previous reservation committed and listed. Reservations are never cancelled or detached: the provider's reservation ledger is the archive, `get_current_plan` returns it as `reservationLedger` with `belongsToCurrentPlan` / `supersededByNewerPlan` flags, and the Plan screen renders it as **Reservation history**.

Reservation is also observably staged. The plan is committed as `reservation_pending` *before* any inventory moves, then transitions to `reserved` or `reservation_failed`, so a crash or provider failure can never leave an ambiguous state and both outcomes appear in the audit trail.

Approval records the exact plan version and mutable provider revision. Any meaningful human or agent edit clears approval; unchanged input is a no-op. If inventory changes after approval, reservation returns `PROVIDER_STATE_CHANGED`. The sandbox provider models pending, confirmed, and failed outcomes, commits table and seat inventory atomically, keeps committed capacity valid for its owning plan, consumes nothing on conflict/failure, and returns the same confirmation on an idempotent retry. It does not contact a real business or payment service.

## Architecture

- `src/providers.ts` — `InventoryProvider` interface and mutable date-window sandbox, including ownership, conflict, failure, and idempotency behavior.
- `src/domain.ts` — solver, evaluation, versioned mutations, repair, approval, and transactional reservation gates.
- `src/validation.ts` — strict shared schemas, including non-normalizing calendar-date validation.
- `src/tools.ts` — 13 imperative WebMCP definitions and handlers.
- `src/authority.ts` — the reservation transaction boundary: the local sandbox authority (default) and a token-authenticated, server-to-server remote authority.
- `netlify/functions/reserve.mjs` — optional server-authoritative reservation transaction.
- `src/persistence.ts` — validated plan, provider, and activity persistence plus Web Locks-backed compare-and-swap and cross-tab synchronization.
- `src/App.tsx` — agent-first human flow, manual builder, evidence center, approval, and activity guide.
- `src/intent.ts` — canonical reservation intent, the content-bound fingerprint, and the provider ledger key.
- `tests/` — 197 unit and integration tests covering each tool, UI validation, reservation transitions, the reserved-plan lifecycle, provider mutations, concurrency, the authority boundary, adversarial state attacks, the in-flight reservation race, recovery of an abandoned in-flight reservation, content-bound idempotency, reservation ownership forgeries, PlanOnIt-only reset, and the standalone entry.
- `tests/browser/` — 21 Playwright tests (7 scenarios × 3 mobile viewports) that run the real production build in a real browser. All 21 pass in Chromium 151.

### Reset

**Reset plan** in the Plan sidebar clears PlanOnIt's own saved state and nothing else: it removes only this app's
`planonit.state.*` keys, never cookies or another site's data. It asks for a deliberate confirmation first and
states plainly what it does *not* do — a reset never cancels a sandbox reservation that was already committed.
Confirmed reservations stay in the provider ledger, and the new plan's version continues forward so it can never
collide with a previous commitment.

## Interface

The plan screen is written for the person, not the system. An untouched workspace shows a calm empty state rather than a list of blocking failures; feasibility checks appear under everyday names ("Table available", "Timing works") with the stable technical IDs kept in the WebMCP payloads; the itinerary shows Film → Travel → Dinner with the waiting time explained rather than implied; and the header itself carries no agent/tool status pill at all — WebMCP registration state shows only where it's relevant (the Goal tab's agent card, the Activity page), never as jargon in chrome every screen shares. `src/labels.ts` is the single place that translates system vocabulary into a diner's.

## Inventory window

The supported planning window is **rolling**: it opens two days after the current date and runs for fourteen days, so the demo cannot expire. The window is computed at validation time, advertised in the WebMCP `date` enums, and enforced identically by the provider, so a date the schema accepts is always a date the provider can serve. Tests pin the window origin (`setPlanningWindowOrigin`) so date-sensitive assertions stay deterministic; production follows the real clock.

When an evening's date falls behind the window, the plan stops being currently valid — the leading check says *"This evening has passed"* — but a confirmed reservation is **not** reported as an integrity failure: it is compared against the immutable ledger record and stays committed and visible. Starting a new plan from a passed evening opens on a currently supported date.

## Honest scope

- Restaurant, cinema, route, and inventory data are controlled Dhaka sandbox data, not live commercial APIs.
- **Reservation authority.** By default the browser-local sandbox provider is its own authority, and that is what the live deployment runs. `src/authority.ts` also ships `RemoteReservationAuthority` and `netlify/functions/reserve.mjs`, which move capacity, idempotency and provider revisions to a server that re-checks every commitment and writes the ledger with a conditional `onlyIfMatch` compare-and-swap (a losing concurrent commit gets `AUTHORITY_REVISION_CONFLICT`, not a silent overwrite).
- **The remote authority is deliberately not reachable from the browser.** It requires a bearer token, and no credential is ever read into the client bundle — anything prefixed `VITE_` is public, so shipping a shared secret there would be authentication theatre. The endpoint is therefore usable only by trusted server-side callers, is opt-in via `VITE_PLANONIT_AUTHORITY_ENDPOINT`, and is **not enabled or verified in production**. With no endpoint configured the verified local behavior runs unchanged.
- Reads (browsing inventory) are deliberately local and synchronous; only the consequential write crosses the authority boundary.
- The mutable provider and shared workspace persist per browser origin. Same-origin tabs use a Web Locks-backed compare-and-swap boundary; stale writes fail with `CONCURRENT_WRITE_CONFLICT` or `STALE_PLAN_VERSION` and tabs converge through storage events. There is no account or cross-device server state — deliberately: this build does not ask for a login at all, so there is nothing to authenticate.
- A real deployment would move provider state, authentication, authorization, audit records, and idempotency keys to a trusted server while retaining the same interfaces.
- WebMCP availability depends on the currently supported ChatGPT built-in browser and model environment.
- No Devpost submission or uploaded demo video is claimed.

See [the judge guide](docs/JUDGE_GUIDE.md), [demo script](docs/DEMO_SCRIPT.md), [adversarial audit](docs/ADVERSARIAL_AUDIT.md), and [final report](docs/FINAL_REPORT.md).

## License

See [LICENSE](LICENSE).
