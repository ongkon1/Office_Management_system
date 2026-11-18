# Phase 8 Quality Traceability

## Gates

The backend gate is `npm run verify:backend`. It runs generated Next.js types,
TypeScript, ESLint, production-data boundary checks, migration validation, the
four isolated backend Vitest projects, the cache/security reviews, dependency
audit, and a production build. Test data is created per suite; integration
suites run serially and clean up their own records.

| Requirement area | Primary automated evidence |
|---|---|
| Classification, duration, policy, work-log rules | `src/server/time/calculation.unit.test.ts`, `src/server/hr/calculation.unit.test.ts`, `src/server/work/application.unit.test.ts` |
| Money, reporting, formats, redaction | `src/server/reporting/formats.unit.test.ts`, `src/server/reporting/reporting.integration.test.ts`, authorization project |
| Schema, constraints, migrations, locks, transactions | `src/server/database/*.integration.test.ts`, organization and task-work integration suites, `npm run db:validate` |
| Authentication, sessions, request boundary, rate limiting | `src/server/authentication/*.unit.test.ts`, `src/server/security/*.test.ts` |
| Route/HTTP contracts | `src/server/**/*.api.test.ts` |
| Record/field/department authorization | `src/server/authorization/*.authorization.test.ts`, repository authorization tests |
| Employee, Team Lead, HR, reporting, administration | time, task-work, HR, reporting, operations and organization integration suites |
| Notifications, documents, search, integrations | Phase 7 unit/integration suites and `docs/backend/phase-7/verification.md` |
| Production import and reconciliation | import and reconciliation integration suites |

Browser role journeys remain in the established `audit:flows*`,
`audit:journeys`, accessibility, responsive and stress gates. They require a
running application and are not replaced by backend HTTP tests.

## Justified exclusions

- Provider availability, production traffic shape, production backup stores,
  and restore infrastructure cannot be made deterministic in a unit suite.
  They use controlled target-environment drills and the runbooks in this phase.
- Stakeholder approval of volumes, RTO, RPO and retention is operational
  evidence, not a code assertion.
- AI Meeting Minutes, Requisition and Conveyance remain later backend phases;
  their pending requirements are not falsely counted as Phase 8 coverage.

