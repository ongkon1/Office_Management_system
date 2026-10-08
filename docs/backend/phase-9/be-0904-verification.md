# BE-0904 Verification — Frontend States Against Backend Responses

## Outcome

`BE-0904` is complete for the production service boundaries delivered by the
backend. The browser transport preserves canonical `Result<T>` values, and the
frontend renders and operates the required loading, error, permission, locked,
retry, job-progress, and success states without inferring authorization or job
state locally.

At the time this verification was recorded, it did not claim that `BE-0902`
was complete. `BE-0902` was subsequently completed on 8 October 2026; see
`docs/backend/phase-9/be-0902-progress.md`. Surfaces whose
database adapters are still pending continue to return the explicit unavailable
result established by `BE-0903`; they do not use fixtures as production data.

## State traceability

| Required state | Backend evidence | Frontend evidence |
|---|---|---|
| Loading | Browser request remains pending until the server adapter resolves | Export history announces `Loading export history` with `aria-busy` |
| Error | HTTP `503` carries a safe retryable `DEPENDENCY_FAILED` result | Export history renders an unavailable state with retry guidance |
| Permission | HTTP `403` preserves `permission_denied`, message, and safe guidance | Export history renders `Not available to your role` without protected data |
| Locked | Time HTTP boundary returns `409 PERIOD_LOCKED` with amendment guidance; MySQL integration verifies locked-period behavior | Browser transport preserves the locked conflict; existing day-view coverage removes mutation controls and explains amendment handling |
| Retry | Export application permits retry only from Failed and requeues durably | Failed jobs expose `Request again`, show a busy state, call the server retry operation, and reload from the server result |
| Job progress | MySQL export jobs exercise queued, processing, ready, failed, retry, cancellation, and expiry | Export history renders durable state labels and refreshes queued/processing jobs instead of advancing fake client state |
| Success | API responses preserve ordinary `success` payloads; ready artifacts use the protected download endpoint | Ready jobs expose the server-provided download URL and successful refresh/retry feedback |

## Production correction

`src/features/reports/export-history.tsx` previously contained frontend-demo
language and a client-side **Advance state** control. It now:

- treats queued and processing as backend worker states;
- provides **Refresh status** without mutating the job locally;
- retries only when the server marks a job retryable;
- displays action failures returned by the backend;
- links ready jobs to the permission-checked `/api/reporting?view=download&id=…`
  endpoint; and
- exposes busy states while refresh or retry is in flight.

The existing `advanceExport` contract method remains for compatibility, but its
documented and production behavior is now “read the latest durable state,” not
“advance a mock job.”

## Automated evidence

Executed on 2026-10-04:

| Command | Result |
|---|---|
| Focused frontend/backend-state suites | Passed: 2 files, 18 tests |
| `npm run test:backend:api` | Passed: 4 files, 25 tests |
| `npm run test:backend:integration` | Passed against MySQL: 8 files, 141 tests |
| `npm run test` | Passed: 51 files, 918 tests |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with zero errors; one existing `session-provider.tsx` exhaustive-deps warning remains |
| `npm run build` | Passed: optimized Next.js 16.3.4 build; 68/68 static pages generated |

The local helper runtime reported Node 22.22.1 while `package.json` requires Node
24. Deployment must use the declared Node 24 runtime.
