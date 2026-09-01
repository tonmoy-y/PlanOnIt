# Devpost draft

## Title

PlanOnIt — evidence-backed evenings for people and agents

## Tagline

Give an agent the goal. Edit the plan. Keep the final say.

## Inspiration

Planning dinner and a movie looks simple until the choices interact. A table slot changes when dinner ends; the cinema determines the route; travel and an arrival buffer constrain the showtime; every choice changes the total. People usually repeat this comparison across several services and still have to verify the final plan themselves.

## What it does

PlanOnIt is one shared workspace used by a person and an external WebMCP agent. The agent can search availability, inspect showtimes, estimate only supported venue routes, generate a feasible evening, validate it, and repair it after a human edit. The UI shows the exact entities, computed chronology, seven blocking checks, cost breakdown, version history, and approval state.

The signature workflow is constraint repair. A person can choose a different restaurant; PlanOnIt clears the now-invalid transport dependency; the agent can preserve that restaurant and search compatible showtimes and routes. If the constraints are impossible, the tool returns an actionable failure rather than a plausible-looking fake plan.

## How WebMCP is used

The page registers 12 imperative site tools with descriptions, strict JSON schemas, side-effect annotations, and runtime Zod validation. Tool calls and human edits mutate the same persisted, versioned plan. Read tools expose enough IDs and verification context for the agent to use mutation tools safely. Every mutation requires the current version, so stale agent actions cannot overwrite newer human work.

Approval is deliberately outside plan generation. Only a person can approve a fully valid current version in the UI. `reserve_plan` then performs one clearly labeled local simulation and rejects invalid, stale, unapproved, or repeated attempts.

## How it was built

The app uses React, TypeScript, Vite, Zod, and the imperative WebMCP API. Replaceable provider adapters serve deterministic Dhaka restaurant, cinema, showtime, and route fixtures. A constraint solver enumerates combinations, rejects infeasible candidates, and ranks valid candidates using structured preferences. localStorage preserves the shared plan and activity history after reload.

The recovery work focused on trust: movie/showtime integrity, route-specific transport, computed timing, reliable totals, atomic dependent updates, version-bound approval, and adversarial tests. The production build also emits a single-file root entry so the project can be opened directly without an asset-loading failure.

## Challenges and lessons

The hardest part was making “agent-ready” mean more than publishing many functions. The tools need a coherent data model, narrow inputs, verifiable outputs, explicit failure modes, and shared state that remains safe when a human edits concurrently. WebMCP is most compelling here because it lets the external agent act through the site’s real capability boundary while the site remains useful on its own.

## Current limits

The provider inventory is seeded, covers Dhaka on two demo dates, and persists only in one browser. No real restaurant, cinema, ride, payment, or booking service is contacted. A production version would add authenticated server persistence and live provider adapters without changing the tool or domain boundaries.
