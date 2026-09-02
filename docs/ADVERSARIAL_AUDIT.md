# Final adversarial audit

| Attack or prior failure | Final behavior and evidence |
|---|---|
| Open committed `index.html` directly | Production CSS/JS are inlined; the regression forbids external script and stylesheet assets. |
| `2026-02-30` date rollover | Exact UTC component comparison rejects impossible dates; leap and month-end boundaries are tested. |
| Enter `-10` in the human budget field | Text stays staged in the field, an inline error appears, and canonical plan/version/storage remain unchanged. |
| Bypass the UI and call the domain directly | `applyPlanUpdate` itself parses `updatePlanSchema`; callers cannot skip runtime validation. |
| Mismatch movie and showtime | Atomic pair validation rejects it and movie cost remains null rather than zero. |
| Reuse transport after venue change | Options belong to one origin/destination route; incompatible transport is cleared. |
| Approve stale/invalid plan | Exact version, eight checks, and provider revision gate approval/reservation. |
| Inventory disappears after approval | `PROVIDER_STATE_CHANGED` forces revalidation and renewed human approval. |
| Provider conflict or failure | No inventory or reservation state is committed. |
| Retry a successful reservation | The idempotency key returns the same confirmation with no second decrement. |
| Human and agent race | Optimistic versions reject stale writes; Web Locks serialize compare-and-swap; cross-tab updates converge without timestamp-based last-write-wins. |
| Netlify badge intercepts mobile Plan button | Fixed bottom navigation was removed. Header step navigation remains in document flow at 375/390/412 px. |
| Local automation presented as AI | **Create plan preview** and local repair are labeled fallbacks; only registered tool execution is agent activity. |
| Replace a reserved plan via `create_evening_plan` | `WORKSPACE_HAS_ACTIVE_RESERVATION`; the version does not move, inventory is untouched, and the reservation stays in the ledger. `start_new_plan` is the only way forward and preserves it. |
| Hide a commitment by starting over | The provider reservation ledger is the archive; `get_current_plan.reservationLedger` and the Plan screen both show superseded commitments. |
| Forge an approval or provider revision | `HUMAN_APPROVAL_REQUIRED` / `PROVIDER_STATE_CHANGED`. |
| Fabricate a reservation object on a plan | The reservation-ownership check finds no matching provider commitment and the plan is invalid. |
| Smuggle `status` or `approval` through `update_plan` | Strict schema rejects unknown keys with `INVALID_INPUT`. |
| Leave the demo open until its date passes | The plan stops being currently valid with a plain-language `date_window` failure, and a confirmed reservation is verified against the ledger instead of being reported as forged. |
| Start a new plan after the window rolls | The fresh plan opens on a currently supported date, not the stale one. |
| Tool client skips JSON Schema | Every handler parses a strict Zod schema; every tool has malformed and success-path tests. |
| Provider state is malformed in storage | The entire provider envelope has a strict schema and invalid provider state is discarded. |

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Current result (revision 5): **197 unit/integration tests pass (14 files)** and **21 real-browser Playwright tests pass** (7 scenarios x 3 mobile viewports, executed against the production build in Chromium 151). Lint, typecheck, production build and `npm audit` are clean, and the browser discovers and invokes **13** live imperative tools. A real two-tab race rejected one stale writer and both tabs converged. The external deployment URL and hosted provider state are still **not** claimed as verified.
