# Backend Architecture and Delivery Foundation

Status: Engineering baseline; external approvals remain explicit  
Tasks: `BE-0015`–`BE-0019`, `BE-0022`, `BE-0025`  
Sources: `project_requirement.md`, `docs/architecture.md`, `src/contracts/*`

## Module boundaries

| Module | Owns | Must not own |
|---|---|---|
| Access | credentials, sessions, 2FA/reset, actors, roles/grants | business-record authorization rules |
| Organization | employees, divisions, teams, assignments, holidays, policy versions | time classification |
| Work | projects, membership, tasks, checklists | labour-cost or timesheet arithmetic |
| Time | entries, timers, daily break, calculation engine, summaries, periods, verification/amendment | daily Team Lead approval (it does not exist) |
| HR | attendance projections, WFH, leave and HR overrides | independent duplication of time arithmetic |
| Evaluation | periods, responses, weights, publication | unrestricted reads of private evaluations |
| Reporting | authorized projections, reconciliation and provenance | a second calculation engine |
| Finance | effective cost rates, budgets, payroll projections | implicit payroll submission or floating-point money |
| Collaboration | remarks, documents, messages and announcements | bypasses around owning-record authorization |
| Notifications | safe notification records and delivery attempts | protected source content copied into payloads |
| Integrations | connections, OAuth state, imports, webhooks and sync cursors | bypasses around application validation/workflows |
| Files | upload lifecycle, integrity/scanning metadata and authorized delivery | public or guessable protected URLs |
| Audit | append-only evidence, redaction and sensitive-read evidence | mutable application-user history |

Cross-module calls go through application ports. A module may reference shared identifiers/value objects, but it does not query another module's tables directly from a handler or UI adapter.

## Layering and dependency direction

1. `domain`: pure value objects, policies and calculations; no Next.js, database, network or React imports.
2. `application`: commands, queries, orchestration, transaction requests and ports for repositories, authorization, audit, clock, IDs, jobs, files and notifications.
3. `infrastructure`: MySQL repositories, session implementation, job runner, storage, email and external adapters.
4. `delivery`: authenticated Server Components for page reads, Server Actions for appropriate first-party mutations, Route Handlers for external HTTP/file/webhook contracts, and job handlers.
5. `composition`: environment-specific wiring that constructs the `ServiceRegistry` and server dependencies.

Dependencies point inward. Delivery code maps transport input to an application command and maps `Result<T>` back to the frontend contract; it contains no domain calculations or authorization decisions.

## Canonical error taxonomy

`src/contracts/results.ts` is the public contract and defines the canonical codes. Backend adapters must map framework and dependency errors to these values rather than leaking transport-specific errors:

| Public status | Canonical code | Meaning |
|---|---|---|
| `validation_failure` | `VALIDATION_FAILED` | Field/domain validation failed; detailed machine reasons live on each safe `FieldError.code` |
| `unauthenticated` | `UNAUTHENTICATED` | Missing, expired, revoked or two-factor-incomplete session |
| `permission_denied` | `FORBIDDEN` | Denied general capability when revealing denial is safe |
| `not_found` | `NOT_FOUND` | Absent and existence-protected resources use the same external result |
| `conflict` | `CONFLICT` | Stale version, running timer, workflow state or idempotency fingerprint conflict |
| `conflict` | `PERIOD_LOCKED` | Verified-period mutation requires the authorized amendment workflow |
| `error` | `RATE_LIMITED` | Retryable rate limit without account enumeration |
| `error` | `DEPENDENCY_FAILED` | Database, storage, queue or provider dependency failed safely |
| `error` | `INTERNAL_ERROR` | Unexpected failure with a safe correlation reference |

HTTP boundaries may use appropriate HTTP statuses while first-party service adapters preserve these result values. Codes and messages never disclose protected identifiers, record existence or dependency secrets.

## Execution context propagation

Every application call receives an immutable context assembled at the trusted boundary:

- `correlationId`: generated or accepted only from a validated ingress header; included in safe logs and audit.
- `actor`: authenticated user/employee identity, active roles and the session reference; never accepted from form input.
- `impersonator`: absent unless the separately approved audited feature exists.
- `timezone`: business default `Asia/Dhaka`, with the policy-selected timezone recorded for time facts.
- `locale`: presentation preference only; it never changes stored arithmetic.
- `policyVersion`: resolved by the service for the effective work date and persisted with calculated facts.
- `idempotencyKey`: required on declared retryable mutations; scoped to actor, operation and normalized request fingerprint.
- `audit`: reason/purpose and safe resource context required by sensitive operations.

Jobs persist the minimum context needed to re-authorize and reproduce work. They do not serialize a trusted authorization decision indefinitely; protected output and downloads are rechecked.

## Transaction boundaries

| Operation | Atomic work |
|---|---|
| Create/update/delete time entry | validate assignment and overlap; write entry; recalculate/persist daily summary; append audit; enqueue deduplicated events |
| Start timer | enforce one-running-timer database invariant; write session and idempotency record |
| Stop timer | lock active session; stop once; produce draft/result; persist idempotency outcome |
| Break override | write the one employee/date break with reason; recalculate summary; audit |
| Correction/remark resolution | update workflow/version; apply authorized correction when applicable; recalculate affected summary; audit/notify |
| WFH/leave decision or HR override | transition request; update derived attendance/requirement inputs; recalculate affected summaries; audit/notify |
| Period verification | lock period scope; ensure exceptions/policy inputs are stable; snapshot included results and policy; mark verified; audit |
| Verified amendment | preserve before/after and reason; mutate allowed fact; recalculate; mark amended/reverified as required; audit/notify Finance |
| Evaluation transition | validate workflow and effective reviewer; store response/scores/version; audit; publish atomically when requested |
| Export request | persist idempotency result and queued job with filters/provenance/authorization strategy |
| Integration import | claim delivery/idempotency key; validate and write drafts/facts; update cursor only with successful batch; audit |

Email, webhook delivery and large export generation are not performed inside database transactions. The transaction writes a durable outbox/job record; workers deliver idempotently afterward.

## Configuration and secret ownership

| Environment | Configuration | Secrets | Owner/control |
|---|---|---|---|
| Development | checked-in `.env.example`; local overrides ignored | developer-local values only; no production data | engineering |
| Test | deterministic test configuration and isolated database name | CI-scoped least-privilege credentials | engineering/CI owners |
| Staging | production-shaped, separate resources | deployment secret store; rotation tested | operations + security |
| Production | immutable release configuration | approved secret store, least privilege, rotation and access audit | operations + security |

The application fails closed on missing required configuration. Secrets are never exposed to client bundles, logged, stored in fixtures, placed in audit payloads, or committed. Variable names and validation will be finalized with the selected adapters (`BE-0007`–`BE-0014`).

## Code-review controls

Changes in the following areas require explicit reviewer attention and evidence:

- Schema/migrations: forward path, representative upgrade, recovery guidance, constraints, indexes, effective dating, history preservation and decimal/time types.
- Authorization: allow and deny matrix, row filtering before aggregation, field masking, not-found equivalence, files/search/jobs/exports, date-effective scope.
- Time calculations: pure-engine tests at 6:59, 7:00+break, above 8:00, exactly 12:00 and above 12:00; one daily break; cross-division overlap; policy version.
- Financial logic: fixed decimal strings plus currency, effective rates, verified-period defaults, reconciliation and restricted-field omission.
- Audit/security: before/after/reason/correlation coverage, append-only behavior, sensitive-read evidence and redaction.
- Integrations/jobs: signature/state/replay protection, idempotency, bounded retries, dead-letter behavior, safe payloads and reauthorization.

No reviewer may approve by weakening a quality threshold, skipping a deny case, or accepting a UI-only security control. Requirement IDs and backend task IDs belong in the relevant test or technical record.

## Decisions and approvals still open

This document deliberately does not select the ORM/query builder, authentication library, validation library, durable job mechanism, storage, email provider, runtime topology or MySQL environment. Those are `BE-0007`–`BE-0014` decisions with operational/security stakeholders and compatibility evidence. Availability/RTO/RPO and target deployment approval also remain external dependencies.
