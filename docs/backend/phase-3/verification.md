# Backend Phase 3 Verification

Status: Complete  
Date: 2026-09-08  
Tasks: `BE-0301`–`BE-0337`

## Delivered

- Migration `0006_organization_work_services.sql` aligns organization/work persistence with the frontend contracts: division leads/descriptions, employee profile metadata, effective and temporary assignments, project membership state, task review state, and append-only task decisions.
- Recovery guidance is explicit and warns against destructive rollback after production data exists.
- `OrganizationWorkService` owns authorization, validation, effective ranges, primary-assignment conflicts, non-blocking allocation warnings, optimistic version conflicts, project/task scope, derived actual minutes, overdue state, employee-raised-task narrowing, current-Team-Lead decisions, notifications, and audit effects.
- `MysqlOrganizationWorkRepository` implements transaction-bound persistence and reads actual project/task minutes from views derived only from valid stored time entries.
- `ProfilePhotoService` authorizes clean attachment delivery, returns a 60-second S3 URL without exposing the storage key, and audits access.
- Task decisions are idempotent per reviewer/key, unique per task, append-only, and transactionally coupled to task state.
- `validateTaskForTime` rejects pending/rejected/inactive tasks and inactive projects at the server boundary; dropdown filtering is not treated as the control.

## Key invariants

| Invariant | Enforcement |
|---|---|
| Historical organization/work records survive lifecycle changes | Foreign keys use `RESTRICT`; services toggle status/active state rather than deleting. |
| One current primary assignment | Existing generated unique key plus service overlap checks. |
| Temporary assignment has an end date | MySQL check constraint plus service field guidance. |
| Allocation not equal to 100% is a warning | Successful `Result<T>` carries `ALLOCATION_NOT_100`; submitted data is not silently changed. |
| Project and task actual time cannot be edited | SQL views aggregate active saved/locked time entries. |
| Employee-raised task cannot bypass review | Database constraint narrows self-raised records; service overwrites assignee/reviewer/state from authenticated context. |
| Only the current effective Team Lead decides | Lead is resolved at decision time inside the transaction; wrong/self reviewer receives indistinguishable not-found. |
| A task accepts time only after endorsement | Shared `taskAcceptsTime` predicate is used by server validation. |

## Verification results

| Gate | Result |
|---|---|
| TypeScript (`npm run typecheck`) | Pass |
| Migration validation (`npm run db:validate`) | Pass: 6 forward migrations and matching recovery scripts |
| Backend suites (`npm run test:backend`) | Pass: 11 files, 102 tests |
| Phase 3 focused suite | Pass: 11 tests |
| Full backend gate (`npm run verify:backend`) | Pass: typecheck, lint, migrations, tests, high-severity security threshold, and production build |

The integration suite uses the repository's isolated-database builder when a MySQL test URL is available; unit, API, authorization, and migration checks remain deterministic without production credentials.

`npm audit` reports five moderate findings in the development dependency chain through `drizzle-kit`/`esbuild`; there is currently no non-breaking automatic fix. The configured high-severity security gate passes.


Phase 4 migration reconciliation: the duplicate `0006_organization_work_services.sql` is now archived in `docs/backend/phase-4/archived-duplicate-migration/`; the original `0006_organization_work.sql` remains in the executable chain, with additive compatibility migration 0007. See `docs/backend/phase-4/verification.md` for checksum and existing-database handling.
