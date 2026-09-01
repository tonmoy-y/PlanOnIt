# Adversarial recovery audit

This file records verifiable implementation evidence. It is not a self-awarded hackathon score.

| Prior failure mode | Recovery evidence |
|---|---|
| Root `index.html` failed when opened directly | `npm run build` now inlines production CSS and JavaScript into the root entry via `scripts/build-standalone.mjs`; no external `file://` module fetch remains. |
| A local modal was presented as WebMCP | The local action is named **Quick Planner** and its activity source says `Local solver — not an external agent or WebMCP call`. The badge reflects actual registration state. |
| Tool handlers trusted JSON Schema alone | Every handler calls a strict Zod parser and returns a structured `INVALID_INPUT` error with field details. |
| Movie title and showtime could disagree | Movie/showtime updates are atomic and validate ownership, date, and seats. Invalid references are not priced as zero. |
| Transport was relabeled across unrelated venues | Routes are keyed by origin/destination; options belong to one route; venue changes clear incompatible transport. Unknown routes fail. |
| Timeline was cosmetic | Dinner end, departure, arrival, buffer, movie start, movie end, and slack are calculated from provider entities. Impossible chronology blocks validity. |
| Budget ignored party scaling or invalid references | Dinner and tickets scale by people; transport uses a route fare; incomplete components and total are `null`; approval is blocked. |
| Preferences did not matter | Cuisine, genre, transport, timing, minimum rating, and priority influence filtering or candidate scoring; ranking behavior has tests. |
| Approval was a loose boolean | Approval records an exact version; any edit removes it; invalid/stale approval is rejected. Reservation requires that exact approved version and is one-shot. |
| Human and agent edits could overwrite each other | Every mutation requires `expectedVersion`; stale changes return `STALE_PLAN_VERSION`. |
| Refresh lost the demo | Validated plan state and up to 20 activity entries persist in localStorage; malformed storage falls back safely. |
| Desktop-only navigation | The UI has a mobile drawer, bottom navigation, responsive grids, labeled controls, visible keyboard focus, and live status announcements. |
| Tests covered only the happy path | The suite covers solver constraints, provider integrity, malformed calls, stale versions, dependency clearing, approval/reservation gates, persistence, and rendered WebMCP-to-UI integration. |

## Verified recovery commands

Run these from the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Live browser verification should additionally cover site-tool discovery, a real `create_evening_plan` call, the human-edit/agent-repair loop, stale-version rejection, approval persistence, and the 375 px responsive navigation.
