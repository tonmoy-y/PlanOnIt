# PlanOnIt

PlanOnIt is a human-controlled planning workspace where an external AI agent can coordinate dinner, a movie, and transport through WebMCP, repair conflicts, and leave final approval to the person using the page.

[Public repository](https://github.com/tonmoy-y/PlanOnIt)

The evaluator reported a Netlify deployment, but its URL is not stored in this checkout and could not be independently resolved. `netlify.toml` now contains the verified build and publish settings; confirm the existing site URL after pushing this revision.

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
2. Confirm the header shows `Agent-ready · 12 tools`.
3. Copy the on-page request: “Plan a 2026-09-04 evening in Dhaka for 3 people under ৳5000. Use PlanOnIt's site tools, show me feasibility evidence, and leave approval to me.”
4. Review the resulting timeline, eight checks, provider revision, and scaled total.
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

All 12 handlers parse untrusted input with strict Zod schemas. Mutations require `expectedVersion`; restaurant/slot and movie/showtime pairs are atomic; invalid references and incomplete prices never become fake zero-cost successes.

## Feasibility and safety

Every plan exposes eight blocking checks:

1. required selections;
2. city consistency;
3. exact table/date/party availability;
4. movie/showtime/date/seat integrity;
5. reservation ownership for the exact plan version;
6. a route-specific transport option;
7. dinner, travel, buffer, movie chronology, and maximum idle-time policy;
8. the party-scaled total budget.

Approval records the exact plan version and mutable provider revision. Any meaningful human or agent edit clears approval; unchanged input is a no-op. If inventory changes after approval, reservation returns `PROVIDER_STATE_CHANGED`. The sandbox provider models pending, confirmed, and failed outcomes, commits table and seat inventory atomically, keeps committed capacity valid for its owning plan, consumes nothing on conflict/failure, and returns the same confirmation on an idempotent retry. It does not contact a real business or payment service.

## Architecture

- `src/providers.ts` — `InventoryProvider` interface and mutable date-window sandbox, including ownership, conflict, failure, and idempotency behavior.
- `src/domain.ts` — solver, evaluation, versioned mutations, repair, approval, and transactional reservation gates.
- `src/validation.ts` — strict shared schemas, including non-normalizing calendar-date validation.
- `src/tools.ts` — 12 imperative WebMCP definitions and handlers.
- `src/persistence.ts` — validated plan, provider, and activity persistence plus Web Locks-backed compare-and-swap and cross-tab synchronization.
- `src/App.tsx` — agent-first human flow, manual builder, evidence center, approval, and activity guide.
- `tests/` — 81 unit and integration tests covering each tool, UI validation, reservation transitions, provider mutations, concurrency, and the standalone entry.

## Honest scope

- Restaurant, cinema, route, and inventory data are controlled Dhaka sandbox data, not live commercial APIs.
- The mutable provider and shared workspace persist per browser origin. Same-origin tabs use a Web Locks-backed compare-and-swap boundary; stale writes fail with `CONCURRENT_WRITE_CONFLICT` or `STALE_PLAN_VERSION` and tabs converge through storage events. There is no account or cross-device server state.
- A real deployment would move provider state, authentication, authorization, audit records, and idempotency keys to a trusted server while retaining the same interfaces.
- WebMCP availability depends on the currently supported ChatGPT built-in browser and model environment.
- No Devpost submission or uploaded demo video is claimed.

See [the judge guide](docs/JUDGE_GUIDE.md), [demo script](docs/DEMO_SCRIPT.md), [adversarial audit](docs/ADVERSARIAL_AUDIT.md), and [final report](docs/FINAL_REPORT.md).

## License

See [LICENSE](LICENSE).
