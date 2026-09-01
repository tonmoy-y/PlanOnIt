# PlanOnIt

**A shared planning workspace where an external agent assembles a complete evening and a human stays in control.**

PlanOnIt is a polished WebMCP challenge demo for planning dinner, a movie, and transport across Dhaka. A person can browse and edit normally; a WebMCP-compatible external agent can discover the same capabilities, compare services, build a constraint-aware draft, and adapt it after a human edit.

## Why WebMCP

Traditional UI makes a person repeat the same search-and-compare loop across services. PlanOnIt exposes meaningful, typed tools at the capability boundary: an agent can start with “three people in Dhaka, Friday, under ৳5,000,” inspect options, assemble a plan, calculate the budget, and update one selection. The website remains the shared source of truth. Reservation is always a simulated draft and requires explicit human approval.

## WebMCP tools

The app uses the imperative API `document.modelContext.registerTool({ name, description, inputSchema, annotations, execute })`. It registers eight tools when the page loads:

| Tool | Purpose |
|---|---|
| `search_restaurants` | Filter realistic seeded restaurants by city, cuisine, rating, and price. |
| `find_showtimes` | Find date-and-seat-compatible movies and showtimes. |
| `estimate_ride` | Compare deterministic fare and travel-time estimates. |
| `create_evening_plan` | Assemble a coherent draft from goal, date, party size, budget, and preferences. |
| `get_current_plan` | Read the shared plan and budget status. |
| `update_plan` | Change selections by IDs without booking. |
| `calculate_total_cost` | Return line items, total, remaining budget, and status. |
| `reserve_plan` | Prepare a simulated reservation only after UI approval and exact confirmation. |

## Canonical demo

Open the app in a WebMCP-enabled Chrome environment. Ask the external agent: “Plan Friday evening, September 4, in Dhaka for 3 people. Dinner and a movie, under ৳5,000, highly rated.” The agent should call `create_evening_plan`, then `get_current_plan` or `calculate_total_cost`. In the UI, change the restaurant under **Explore**. Ask the agent to use `search_restaurants` and `update_plan` to find a cheaper dinner. Return to **My plan**, review the timeline, and click **Review & approve**. The `reserve_plan` tool will only return a simulated reservation-ready response after that approval.

## Human and agent interaction

The Overview screen is a human-first dashboard. Explore provides manual selection. My plan shows a timeline, cost breakdown, budget meter, approval gate, and shared activity trace. WebMCP actions and manual edits update the same React state, making the hybrid workflow visible without a fake chatbot.

## Architecture and local setup

This is a Vite + React + TypeScript single-page app. `src/data.ts` is deterministic demo data; `src/domain.ts` is the replaceable business/data-access layer; `src/tools.ts` owns WebMCP schemas and execution; `src/main.tsx` and `src/styles.css` are the UI layer. No credentials or external API are required.

```bash
npm install
npm run dev
```

For a normal development session, use the URL printed by Vite. The root `index.html` is also a standalone, double-clickable production entry: run `npm run build` once, then open `/Users/tonmoy/Documents/PlanOnIt/index.html` directly. Its bundled assets use relative paths and do not require a server.

Build and test:

```bash
npm run test
npm run build
npm run preview
```

There are no environment variables and no database migration. The local seeded layer is intentionally stable for judging and can be replaced behind `domain.ts` with a real backend later.

## Judge testing

1. Run the app and open the printed local URL in a browser with WebMCP support enabled.
2. Confirm the green **WebMCP active · 8 tools** indicator.
3. Use the Overview → **Ask your agent** flow, or connect an external WebMCP agent and run the canonical prompt above.
4. Verify the shared plan, cost, activity trace, manual restaurant edit, agent update, and approval gate.
5. Try a small budget to confirm the over-budget state. Try an invalid ID through `update_plan` to confirm a structured error.

## Security and limitations

All records are seeded demo data. Prices, availability, and rides are simulated; no real booking or payment occurs. Inputs have JSON schemas and domain ID checks, state-changing tools explicitly reset approval, and the consequential reservation tool requires both exact confirmation and prior human approval. The app does not claim a live URL, repository, deployment, or uploaded demo video until those external actions are actually performed.

## Demo video plan (under 3 minutes)

**0:00–0:15 Hook:** “Planning a night out means repeating the same search across three services. PlanOnIt gives an external agent one shared workspace.” Show Overview.

**0:15–0:40 Human flow:** Browse Explore, add dinner, movie, and transport. Show the plan timeline and total.

**0:40–1:30 Agent flow:** In a WebMCP-enabled agent, say the canonical prompt. Show tool discovery and the calls to assemble the plan and calculate the budget. Show the plan updating in the UI.

**1:30–2:05 Hybrid handoff:** Manually swap the restaurant. Ask the agent to find a cheaper option and update the shared plan. Show the activity trace and total changing.

**2:05–2:35 Control and close:** Open My plan, show the approval gate, approve the draft, and explain that reservation is still simulated. “WebMCP makes the site legible to agents; PlanOnIt makes the result useful to people.”

Record browser audio narration and the app screen at 1080p. Before export, check that the full tool names are readable, the final approval is visible, no credentials appear, and the runtime stays under three minutes. No video has been uploaded by this repository.

## Devpost copy

**Title:** PlanOnIt — the shared evening planner for people and agents

**Tagline:** Give an agent the goal. Keep the final say.

**Description:** PlanOnIt is a WebMCP-powered planning workspace for a night out. It coordinates dinner, a movie, transport, and a budget in one shared draft. Humans can use the UI directly, while an external agent can discover typed tools to search restaurants, find compatible showtimes, estimate rides, assemble a constraint-aware plan, inspect cost, and update a selection. The differentiator is the handoff: an agent handles cross-service comparison, a human changes the plan, and the agent adapts—without a chatbot embedded in the site or an unreviewed booking. WebMCP is central because it turns the site’s real capabilities into an agent-readable interface with descriptions, JSON schemas, validation, and structured results. The demo uses stable seeded Dhaka data and clearly labels reservations as simulated. That makes the workflow reliable while showing a practical pattern for agent-native services: structured collaboration around a human-owned stateful plan.

## Judge-level evaluation

**WebMCP Leverage: 8/10.** The tools are capability-oriented, schema-described, and share state with the UI; the multi-tool workflow is the product. The remaining limitation is a seeded local data source rather than live providers.

**Execution: 8/10.** The core happy path, hybrid edits, approval gate, responsive UI, structured errors, tests, build, and docs are included. Browser-specific WebMCP availability remains an environment dependency.

**Potential Impact: 7/10.** The repeated cross-service planning problem is clear and the pattern generalizes to travel, errands, and events. Real integrations would be needed for production utility.

**Creativity & Ambition: 8/10.** It demonstrates a believable agent-native collaboration model rather than wrapping a chatbot around a form. Top-10 risk: judges may discount the demo if the external WebMCP client is unavailable or if seeded data feels too narrow.

**Overall: 7.75/10. Recommendation: Submit**, with the explicit caveat that a live deployment, public repository, and recorded video still require external hosting/account actions not available in this workspace.

## License

MIT. See [LICENSE](LICENSE).
