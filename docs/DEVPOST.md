# Devpost submission text (ready to paste)

## Project name

PlanOnIt

## Tagline

Tell an agent the evening you want. Keep the final say.

## The problem

Planning a night out — a film, then dinner after — is a small but real coordination problem. The showtime fixes the cinema, the cinema fixes the route, the route changes how much time is actually left before the table, and every choice changes the total cost. Get any one piece wrong and the rest silently breaks. That's exactly the kind of multi-step, multi-constraint task an agent is good at *doing* and a person is good at *approving* — but today there's no safe, structured way for a web app to hand that work to an agent without either faking a natural-language chat layer over the same UI, or giving the agent free rein with no way for the person to see or gate what it's about to do.

## Why this is a strong fit for WebMCP

WebMCP lets a page expose its *own* real actions — the same solver, the same validation, the same versioned state the human UI uses — directly to an agent running in the browser, with no separate backend API to design, secure, or keep in sync. That's the fit: PlanOnIt's planning logic (search, build, validate, repair, cost, reserve) is genuinely useful to hand to an agent, genuinely risky to hand over ungated (it can commit real-feeling inventory), and genuinely awkward to expose any other way — a bespoke chat interface would just be a worse version of the UI already on the page, and a normal REST API would need its own auth, versioning, and validation layer duplicated from the app. WebMCP tools call directly into the site's existing, tested domain logic, so the agent and the person are always looking at *the same plan*, not two systems that can drift apart.

## How it creates a better user experience

Without WebMCP, this planning task is either "the person clicks through every screen themselves" (slow, and easy to miss that the dinner reservation only works after checking travel time) or "an agent free-forms it through a chat box" (fast, but the person can't see intermediate state, can't intervene mid-plan, and has to trust a wall of text). PlanOnIt's WebMCP integration gives the best of both: the agent does the tedious cross-referencing (does this restaurant have a table in the actual gap between the credits and last call, given today's traffic-adjusted route time?), while the person watches the same versioned plan update live on screen — a timeline, nine feasibility checks, the scaled cost, and a plain-English explanation of anything that doesn't fit — and only the person can approve or reserve. Nothing is ever booked by a tool call. If a manual edit later breaks the plan the agent built (a different restaurant, say), the person can ask the agent to `repair_plan`, which re-solves only the dependent pieces while preserving what the person cares about, and returns honest structured evidence rather than a plausible-looking guess when nothing satisfies the constraints.

## What people and agents can do together that was difficult or impossible before

Before this pattern, a person either had to trust an agent's account of what it did (screenshots, a chat transcript, "I found you a table") with no independently verifiable state, or do the coordination themselves. WebMCP tools operating on the same versioned workspace the human UI reads means the person can watch an agent work in real time, on the actual page, and step in at any point — change a choice mid-plan, ask for a repair, or simply refuse to approve. Optimistic versioning (`expectedVersion` on every mutation) means a stale agent call fails loudly instead of silently overwriting a human edit, and vice versa. That's a genuinely new capability: co-editing one piece of real, gated state between a human and an agent, in the browser, with neither side able to bypass the other's turn.

## How it was implemented

- `src/tools.ts` registers 13 imperative WebMCP tools via `document.modelContext.registerTool({ name, description, inputSchema, execute })` — discovery (`search_restaurants`, `get_restaurant_details`, `check_restaurant_availability`, `find_showtimes`, `estimate_transport`), planning (`create_evening_plan`, `get_current_plan`, `validate_plan`, `calculate_total_cost`), collaboration (`update_plan`, `repair_plan`), confirmation (`reserve_plan`), and lifecycle (`start_new_plan`).
- Every tool input is parsed with a strict Zod schema at runtime (not just typed at compile time) — malformed input from an agent gets a structured `INVALID_INPUT` error, never a silent coercion.
- Every mutation carries `expectedVersion`; a stale write is rejected with `STALE_PLAN_VERSION` rather than clobbering newer state, whether the newer edit came from the person or another agent call.
- Approval is deliberately **not** a WebMCP tool. Only a real click in the UI can approve or reserve a plan — an agent can build and repair, but never approve its own work.
- The reservation transaction is a real (sandboxed) compare-and-swap against a mutable inventory ledger: it decrements table/seat capacity atomically, is idempotent on retry, and fails closed on conflict — not just a static success response.
- Feasibility is nine real checks re-evaluated on every read (availability, chronology, budget, route, operating hours, ownership of committed inventory, and more), so the human UI and the agent's `validate_plan` result are always the same evaluation of the same state, never two separate opinions.
- Stack: React 19 + TypeScript + Vite on the frontend, Zod for schema validation, deployed to Vercel as a fully static build (no server component ships in this build). 198 automated tests cover the tools, the domain solver, the reservation lifecycle, concurrency/versioning, and adversarial input.

## Try it

- **Live app:** https://plan-on-it.vercel.app (open in ChatGPT's in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled)
- **Repository:** https://github.com/tonmoy-y/PlanOnIt (MIT licensed)
- No login or account is required to use or judge the app.
- Once on the Goal tab, copy the on-page suggested request and hand it to the agent as-is — it already names a date inside the app's rolling two-week supported window, so it works regardless of when you're testing.
