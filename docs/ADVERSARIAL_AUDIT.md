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

Current result: 81 tests pass, lint/typecheck/build pass, the built-in browser discovers and invokes 12 live imperative tools, and responsive/golden-path checks pass locally. A real two-tab race rejected one stale writer and both tabs converged. The external deployment URL and hosted provider state are not claimed as verified.
