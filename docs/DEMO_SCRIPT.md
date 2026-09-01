# Three-minute demo script

## 0:00–0:20 — The problem

“A simple night out hides a constraint problem: table availability, movie times, travel between actual venues, and one total budget. PlanOnIt gives a person and an external agent the same stateful workspace.”

Show the empty overview, the seven feasibility checks, and the `WebMCP active · 12 tools` badge.

## 0:20–1:05 — External-agent creation

Use the canonical prompt from the overview. Let the agent call `create_evening_plan`, then `get_current_plan` or `validate_plan`.

Open **Plan & evidence**. Point out:

- the exact restaurant slot and remaining capacity;
- the movie/showtime/cinema relationship and seats;
- the venue-specific route, fare, and duration;
- dinner end, travel, arrival buffer, movie start, movie end, and slack;
- the scaled total and remaining budget.

## 1:05–2:05 — Human edit and honest failure

Open **Build manually** and select The Smoke House at 6:30 PM. Show that the plan is a new invalid version and the old route choice disappeared.

Ask the agent to preserve dinner and repair. At ৳5,000, show the structured `NO_FEASIBLE_PLAN` result. Say: “Failure is part of the product—the agent explains an impossible constraint instead of inventing a route or silently breaking budget.”

Increase the budget to ৳7,000. Ask the agent to repair the new version. Show the preserved dinner, recomputed movie/route, valid timeline, and agent/human activity entries.

## 2:05–2:35 — Concurrency and control

Call one mutation with the prior version and show `STALE_PLAN_VERSION`. In the UI, approve the valid current version. Explain that approval is version-bound and any edit invalidates it.

Optionally show the simulated reservation confirmation, making clear that no provider or payment system is contacted.

## 2:35–3:00 — Close

“WebMCP is not a chatbot bolted onto this site. It exposes the site’s real planning capabilities to an external agent, while the human keeps an editable interface, evidence, history, and the final say.”

Finish on the feasibility report and reliable cost card. Do not claim a live deployment, real booking, or uploaded video unless those actions have actually happened.
