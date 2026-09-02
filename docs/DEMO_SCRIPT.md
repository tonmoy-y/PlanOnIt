# Three-minute demo script

## 0:00–0:35 — One clear promise

Show the Goal screen: “Tell an agent what you want. Keep the final say.” Point to the shared version strip and the `Agent-ready · 13 tools` state. Copy the canonical request.

## 0:35–1:15 — Agent creates evidence

Let the external agent call `create_evening_plan`, then `validate_plan`. Open **Plan** and show the film and showtime, the route-specific journey to dinner, the table booked after the credits, computed chronology, nine checks, scaled total, plan version, and provider revision.

## 1:15–2:10 — Human breaks, agent repairs

In **Explore**, make a choice that clears or invalidates a dependency. Return to Plan and show the prominent failed-check callout. Ask the agent to repair the current version while preserving dinner. Highlight that it either returns a fully evidenced plan or an honest structured failure; it never invents availability.

Send one mutation with the old version and show `STALE_PLAN_VERSION`.

## 2:10–2:40 — Human control and changing state

Approve the repaired version in the UI. Explain that WebMCP has no approval tool. Change the budget and show that approval disappears. Reapprove and optionally confirm the sandbox reservation: table and seat inventory decrement once, while an identical retry is idempotent.

## 2:40–3:00 — Close

“PlanOnIt is a human-controlled workspace where an external agent coordinates multiple services, detects conflicts, repairs plans under constraints, and safely acts on changing information through WebMCP.”

Do not claim real bookings, payment, hosted provider state, a deployment URL, video, or Devpost status unless each is verified live.
