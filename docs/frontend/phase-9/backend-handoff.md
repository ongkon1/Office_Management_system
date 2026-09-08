# Frontend-to-Backend Handoff

This handoff satisfies `FE-0910`–`FE-0917` without choosing a database schema in the frontend milestone. The UI consumes typed services; mock adapters are the current composition and can be replaced inside the same Next.js application.

## Evidence map

| Task | Evidence |
|---|---|
| `FE-0910` | `docs/backend/phase-0/service-contract-inventory.md` — every `ServiceRegistry` query and mutation is inventoried. |
| `FE-0911` | `src/contracts/services.ts`, `src/contracts/results.ts`, and `src/contracts/query.ts` — inputs, view models, failures, pagination, sorting, filters, and search. |
| `FE-0912` | `docs/backend/phase-0/traceability.md` and `project_requirement.md` — domain-to-requirement mapping without schema assumptions. |
| `FE-0913` | `docs/backend/phase-0/backend-foundation.md` — Server Components, Server Actions, Route Handlers, jobs, file storage, and external boundaries. |
| `FE-0914` | `docs/backend/phase-0/quality-gates.md` and `src/server/authorization/` — role, scope, field, government-project, salary/cost, evaluation, and audit boundaries. |
| `FE-0915` | `src/fixtures/index.ts`, `src/lib/calculation/engine.test.ts`, and `docs/frontend/phase-9/calculation-parity-fixtures.md`. |
| `FE-0916` | `src/contracts/services.ts` defines the boundary; `src/services/mock/reset.ts` is the single demo reset seam. A static import audit is recorded in `verification.md`. |
| `FE-0917` | `backend_milestone.md` plus `docs/backend/phase-0/technology-decisions.md` and `docs/backend/phase-1/schema-and-data-foundation.md`. |

## Boundary rules

- Components and pages receive authorized view models and `Result<T>` values, never ORM records or fixture arrays.
- Authorization runs before counts, aggregation, pagination, search, export, and error disclosure.
- The calculation engine remains the one implementation for daily totals, classifications, and division/project/task contributions.
- Server-side work must preserve the existing routes, state variants, status wording, integer-minute durations, fixed-precision money, and audit context.

