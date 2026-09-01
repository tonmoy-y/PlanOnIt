# Final recovery report

## What was fixed

The previous build’s core trust failures were removed: impossible schedules no longer pass, movie/showtime mismatches are rejected, transport belongs to real origin/destination pairs, invalid references are never priced as zero, preferences affect ranking, human edits invalidate dependent choices, and approval is no longer a loose boolean.

The misleading in-app “agent” behavior was replaced with an honestly labeled local **Quick Planner**. Genuine external WebMCP actions are recorded only when registered site tools execute.

The root `index.html` asset-loading failure was also addressed. The production build now writes a single-file root entry with inline CSS and JavaScript, alongside the normal hosted `dist/` output.

## What was rebuilt

- Typed domain entities for plans, providers, routes, showtimes, approval, reservation, evaluation, timeline, costs, and activity.
- Provider adapters backed by coherent two-date Dhaka availability data.
- A solver that enumerates combinations, rejects infeasible candidates, and ranks valid candidates using structured preferences.
- Seven explicit blocking checks with human-readable evidence.
- Strict runtime validation and structured errors for every tool.
- Atomic, version-checked updates and a preserve-choice repair operation.
- Validity-gated, version-bound approval and one-shot simulated reservation.
- Validated local persistence for plan state and activity history.
- A complete human UI with exact slots/showtimes/routes, responsive navigation, focus states, labels, empty/error states, and live announcements.

## WebMCP verification

The supported built-in browser discovered 12 registered site tools from the live page. Real tool calls were used to:

1. create a feasible plan from the canonical prompt;
2. expose full validation and cost evidence in the shared UI;
3. observe a human restaurant edit clearing the old transport dependency;
4. return an honest `NO_FEASIBLE_PLAN` when preserving that restaurant under the old budget was impossible;
5. repair the new human version after a budget change while preserving the restaurant;
6. reject a stale mutation with `STALE_PLAN_VERSION`;
7. preserve the human-approved version and history after reload.

The 375 px layout was exercised through its bottom navigation and mobile drawer. The Vite runtime showed only normal HMR updates during verification and no server/runtime failures.

## Testing and security review

- 43 tests across 6 files pass.
- Lint and TypeScript checks pass with explicit `any` forbidden.
- Production build passes and emits both hosted and standalone outputs.
- A clean isolated `npm ci` install passes lint, typecheck, tests, and build.
- `npm audit --omit=dev` reports zero vulnerabilities.
- Runtime Zod parsing treats tool input as untrusted even if the client skips JSON Schema enforcement.
- Read and mutation boundaries are explicit; mutation tools require current versions.
- The simulated consequential action requires exact-version human approval and an explicit confirmation literal.
- No credentials, payment details, external writes, or real provider calls exist.
- A production provider integration would still require server-side authentication, authorization, inventory revalidation, idempotency, and audited consent.

Direct `file://` navigation could not be automated because the controlled browser blocks local-file URLs. A regression test therefore verifies that the root file contains the bundled app and has no external script or stylesheet asset references.

## Before vs. after

Previous independent evaluation: **19.5/40**.

Final independent-style self-evaluation:

| Category | Score | Rationale |
|---|---:|---|
| WebMCP Leverage | 8.8/10 | Genuine discovery, coherent read/mutation tools, shared versioned state, and a repair workflow that is materially easier for an agent than manual cross-service comparison. Seeded local providers cap the score. |
| Execution | 8.8/10 | Feasibility, integrity, approval, persistence, responsive UI, clean install, adversarial tests, live tool calls, and production output are verified. No hosted deployment or recorded browser suite is included. |
| Potential Impact | 7.5/10 | The coordination pattern generalizes well, but current inventory is one city, two dates, and local-only. |
| Creativity & Ambition | 8.2/10 | The preserve-choice repair loop, visible evidence, and stale-version defense go beyond a normal form or chatbot wrapper. The underlying evening-planning category is familiar. |
| **Total** | **33.3/40** | A credible competitive submission codebase, with launch assets and live integrations still limiting top-tier production impact. |

## Remaining weaknesses

- No live deployment, public repository publication, Devpost submission, or uploaded demo video has been performed.
- Inventory is deterministic demo data, not real-time provider availability.
- Persistence and approval are local to one browser and are not a production security boundary.
- The official ChatGPT WebMCP browser is required for external-agent discovery; unsupported browsers can only use the human UI and local Quick Planner.
- Automated CI cannot reproduce the proprietary browser’s site-tool discovery; this run used live browser verification plus a rendered-app registration test.

## Final verdict

The implementation now clears the requested acceptance bar for a locally verifiable hackathon codebase. It is no longer the 19.5/40 prototype described by the evaluator. The strongest remaining gains require external launch work or real provider infrastructure rather than another round of local planner logic.
