# Judge guide

## Five-minute path

1. Run `npm install && npm run dev` and open the URL in the supported ChatGPT built-in browser.
2. Confirm the Goal tab's agent card reads "Your agent can use this page" (WebMCP tools registered - 13 of them; the header carries no status pill by design) and copy the on-page agent request.
3. Have the external agent create a plan. Open **Plan** and inspect the exact table slot, movie/showtime, route, chronology, scaled cost, nine checks, plan version, and provider revision.
4. Open **Explore**, change the film or the restaurant, and return to Plan. If the route or chronology breaks, the repair callout must name each failed check.
5. Ask the agent: “Repair PlanOnIt plan vN. Preserve the restaurant if possible, explain every changed dependency, and validate the result.”
6. Try a mutation with the previous version; expect `STALE_PLAN_VERSION`.
7. Approve the valid current version in the UI. Edit the budget and confirm the approval disappears on the new version.

## Provider-state path

Reservation is a controlled sandbox side effect. After human approval, `reserve_plan` with `CONFIRM_SIMULATED_RESERVATION` decrements the selected table capacity and showtime seats together. A retry returns the same confirmation without another decrement. If provider inventory changes after approval, expect `PROVIDER_STATE_CHANGED`; conflict/failure consumes nothing. No real provider or payment is contacted.

## Adversarial checks

- `2026-02-30`, non-integer people, negative budget, values above limits, extra keys, strings where numbers are required: `INVALID_INPUT`.
- Unknown entities and unsupported routes: structured errors.
- Mismatched movie/showtime, wrong date, or route option: rejected atomically.
- Incomplete, over-budget, stale, or provider-stale plans: approval/reservation blocked.
- Open two same-origin tabs. A newer plan/provider revision synchronizes; a concurrent same-version state is resolved visibly in Activity.

## Reserved-plan lifecycle

Approve and confirm a reservation, then ask the agent to call `create_evening_plan` again. It must return `WORKSPACE_HAS_ACTIVE_RESERVATION`, the plan version must not move, and `get_current_plan` must still report the reservation in `reservationLedger`. Call `start_new_plan`, then plan again: the new draft is independent and the previous reservation is still listed under **Reservation history** as *Still committed · superseded by a newer plan*.

## Manual and mobile checks

The local solver is labeled **Create plan preview** and never masquerades as an agent. The root `index.html` is an inlined standalone entry. At 375, 390, and 412 px the header navigation is in normal document flow—there is no fixed bottom bar for a deployment badge to cover.

Run `npm run lint && npm run typecheck && npm test && npm run build` before judging. `npm run test:browser` runs the 21-test Playwright suite at 375×812, 390×844 and 412×915 against the production build (needs a local Chromium with system deps).
