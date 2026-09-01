# Judge guide

## Fast path

1. Run `npm install` and `npm run dev`.
2. Open the Vite URL in the supported ChatGPT desktop built-in browser.
3. Confirm the header says `WebMCP active · 12 tools`.
4. Ask: “Plan a 2026-09-04 evening in Dhaka for 3 people under ৳5000. Use create_evening_plan, show feasibility evidence, and never approve for me.”
5. Open **Plan & evidence**. Confirm all seven checks pass, every timeline time is computed, and the total includes three dinners, three tickets, and one route-specific fare.

## Signature human-agent repair

Start from the generated plan.

1. In **Build manually**, select **The Smoke House** at **6:30 PM**. The new version becomes invalid because its old transport selection is cleared instead of being relabeled for another route.
2. Ask the agent to call `get_current_plan`, then `repair_plan` with the displayed `expectedVersion`, `preserveRestaurant: true`, and `preserveMovie: false`.
3. Under the original ৳5,000 constraint, the tool should return `NO_FEASIBLE_PLAN` and explain the failed budget/chronology tradeoff instead of fabricating a result.
4. Change the budget to ৳7,000 in **Overview**. This creates another human-authored version.
5. Ask the agent to retry `repair_plan` with the new version. The repaired plan preserves The Smoke House, chooses compatible downstream services, and returns full evidence.
6. Try `update_plan` with the previous version number. It must return `STALE_PLAN_VERSION`.
7. Approve the valid current version in the UI. Reload the page and confirm the plan, approval, and activity history remain.

`reserve_plan` is optional for judging. It is local and simulated, but still requires the human-approved exact version plus `CONFIRM_SIMULATED_RESERVATION`; repeated calls are rejected.

## Adversarial checks

- Call any tool with an extra property: strict schemas reject it.
- Search for 50 people: `INVALID_INPUT`.
- Use an unknown restaurant, movie, showtime, or location ID: structured unknown-ID error.
- Pair `paper-moons` with a `the-last-signal` showtime: `MOVIE_SHOWTIME_MISMATCH`.
- Use a showtime from the wrong plan date: `SHOWTIME_DATE_MISMATCH`.
- Use a transport option from another route: `INVALID_TRANSPORT_OPTION`.
- Approve an empty, invalid, over-budget, or stale plan: blocked.
- Reserve before approval or reserve twice: blocked.

## Local fallback and standalone entry

**Quick Planner** is intentionally labeled as a local deterministic fallback. It is not WebMCP and does not add an “agent” activity entry.

`npm run build` produces both hosted files in `dist/` and a root `index.html` with inlined production assets. The root file is intended for direct opening when a server is inconvenient.
