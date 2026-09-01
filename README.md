# PlanOnIt

PlanOnIt is a shared evening-planning workspace for a person and an external WebMCP agent. It coordinates a restaurant slot, an exact movie showtime, venue-to-venue transport, chronology, and a total budget in one versioned plan.

The key interaction is repair, not just generation: an agent can create a feasible plan, a person can change one choice in the UI, and `repair_plan` can preserve that choice while recomputing dependent selections. The person alone approves the current valid version. Reservation is a clearly labeled local simulation.

## Run it

```bash
npm install
npm run dev
```

Open the URL printed by Vite. For a production build:

```bash
npm run build
npm run preview
```

`npm run build` also regenerates the root [`index.html`](index.html) as a single file with inlined CSS and JavaScript. The committed file can be opened directly without a server; it does not fetch `file://` module assets.

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## WebMCP workflow

PlanOnIt uses the imperative `document.modelContext.registerTool` API described in the [official WebMCP documentation](https://learn.chatgpt.com/docs/webmcp). The supported ChatGPT desktop browser discovers the tools from the live page, and tool mutations update the same persisted React state as human edits.

Canonical prompt:

> Plan a 2026-09-04 evening in Dhaka for 3 people under ৳5000. Use create_evening_plan, show feasibility evidence, and never approve for me.

The page reports registration honestly:

- `WebMCP active · 12 tools` only after every registration promise resolves.
- `WebMCP unavailable in this browser` when the API is absent.
- `WebMCP registration failed` when registration rejects.

The local **Quick Planner** runs the same deterministic solver for manual testing, but is never presented as an agent or WebMCP execution.

## Site tools

| Tool | Behavior |
|---|---|
| `search_restaurants` | Filters by date, party size, cuisine, rating, price, and remaining table capacity. |
| `get_restaurant_details` | Returns one restaurant’s location, hours, limits, price, and availability inventory. |
| `check_restaurant_availability` | Checks exact date/party capacity and returns valid slots. |
| `find_showtimes` | Returns atomic movie/showtime pairs with date, cinema, seats, duration, and ticket price. |
| `estimate_transport` | Returns only known venue-to-venue routes with route-specific fares and durations. |
| `create_evening_plan` | Searches and ranks restaurant slot × showtime × route option combinations. |
| `get_current_plan` | Reads the shared version, entities, selections, evidence, approval, and reservation state. |
| `validate_plan` | Recomputes all seven blocking feasibility checks without mutation. |
| `update_plan` | Applies an atomic, version-checked update and clears invalid dependent selections. |
| `repair_plan` | Preserves requested human choices and searches dependent alternatives for a valid version. |
| `calculate_total_cost` | Returns scaled line items and budget evidence; incomplete references remain `null`, never fake zero. |
| `reserve_plan` | Creates one local simulated reservation after exact-version human approval and explicit confirmation. |

Every handler performs Zod validation at runtime. Mutation tools reject stale versions. Movie/showtime and restaurant/slot changes are atomic. Unknown IDs, wrong dates, capacity failures, unsupported routes, impossible chronology, and budget failures return structured errors.

## Feasibility model

The solver evaluates:

1. Complete required selections.
2. Restaurant and cinema city consistency.
3. Exact restaurant date, slot, party limit, and remaining capacity.
4. Movie/showtime ownership, date, and remaining seats.
5. A known route and a transport option belonging to that route.
6. Dinner duration + route duration + arrival buffer before movie start.
7. Dinner + tickets + route-specific transport within the total budget.

Structured cuisine, genre, transport, timing, rating, and cost priorities materially change candidate ranking. Approval is bound to a version; any edit removes approval. A reserved simulated plan is immutable.

## Architecture

- `src/data.ts` — deterministic Dhaka provider fixtures.
- `src/providers.ts` — replaceable restaurant, showtime, location, and route adapters.
- `src/domain.ts` — evaluation, ranking, atomic updates, repair, approval, and reservation gates.
- `src/validation.ts` — strict Zod schemas and structured validation errors.
- `src/tools.ts` — 12 WebMCP definitions and handlers.
- `src/persistence.ts` — validated localStorage state/history adapter.
- `src/App.tsx` — shared human UI and top-level tool registration.
- `scripts/build-standalone.mjs` — generates the directly openable single-file entry.
- `tests/` — domain, adversarial input, tool, persistence, and rendered-app integration tests.

## Scope and limitations

- Provider inventory is seeded demo data for Dhaka on 2026-09-04 and 2026-09-05.
- Persistence is browser-local; there is no account, backend, cross-device sync, or authentication.
- No restaurant, cinema, map, ride, payment, or booking provider is contacted.
- Reservation IDs are simulations and charge no money.
- No deployment URL, public repository, submitted Devpost entry, or uploaded video is claimed here.
- WebMCP availability depends on the current supported ChatGPT browser/model environment; consult the official documentation for current compatibility.

See [`docs/JUDGE_GUIDE.md`](docs/JUDGE_GUIDE.md), [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md), [`docs/DEVPOST.md`](docs/DEVPOST.md), [`docs/ADVERSARIAL_AUDIT.md`](docs/ADVERSARIAL_AUDIT.md), and [`docs/FINAL_REPORT.md`](docs/FINAL_REPORT.md).

## License

MIT. See [`LICENSE`](LICENSE).
