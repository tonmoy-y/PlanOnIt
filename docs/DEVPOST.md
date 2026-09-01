# Devpost draft

## PlanOnIt — tell an agent the goal, keep the final say

Planning dinner and a movie is a small but real coordination problem: capacity changes, a showtime determines the cinema, venues determine the route, travel changes chronology, and every selection changes the total. PlanOnIt gives a person and an external WebMCP agent one versioned workspace for that job.

The agent can discover mutable sandbox availability, build and validate an itinerary, update exact choices, calculate cost, and repair a plan after the person changes something. The person sees the same plan as a timeline, eight blocking checks, provider revision, cost, and activity history. Only the person can approve.

The signature interaction is repair. A human choice can invalidate route, timing, or budget. `repair_plan` preserves that intent where requested and searches dependent alternatives. If constraints cannot be satisfied, it returns structured evidence instead of a plausible-looking fake.

PlanOnIt registers 12 imperative site tools with narrow JSON schemas, strict runtime Zod validation, read-only annotations, and explicit side effects. Every mutation uses optimistic plan versions. Approval binds both plan version and provider revision. The controlled reservation transaction decrements table and seat inventory together, consumes nothing on conflict/failure, and returns an idempotent confirmation on retry. It does not contact real businesses or payments.

The app is built with React, TypeScript, Vite, and Zod. Its provider interface is injected through the solver/domain/tool layers. Browser-origin persistence includes provider state, activity, cross-tab synchronization, and visible resolution of simultaneous same-version edits. The production build emits both Netlify-ready assets and a directly openable single-file root entry.

The redesigned experience is agent-first without hiding the human UI: Goal → Explore → Plan → Activity. The canonical agent request is the primary action; the deterministic local solver is clearly secondary. Invalid plans receive an explicit repair panel, and mobile navigation stays out of the fixed bottom area.

Current honest limits: Dhaka data is deterministic sandbox inventory, shared state is not cross-device or server-authenticated, and no real restaurant/cinema/ride/payment provider is contacted. The final deployment URL, video, and Devpost submission must be verified separately before publication.
