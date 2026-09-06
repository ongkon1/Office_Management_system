# Backend Phase 1 — Schema and Data Foundation

Status: complete on 6 September 2026. This document is the evidence index for `BE-0101`–`BE-0145`.

## Tooling and operating model

- `src/server/config/database.ts`, `src/server/database/client.ts`, `health.ts`, and `transaction.ts` provide validated MySQL configuration, a bounded `mysql2` pool, UTC sessions, a health probe, explicit transactions, timeouts, and graceful pool closure (`BE-0101`, `BE-0102`).
- Runtime, migration, and test-administration credentials are separate. `scripts/provision-local-mysql.sql` grants the application users CRUD only; `DATABASE_MIGRATION_URL` is used exclusively by migration commands (`BE-0101`).
- `scripts/db-{migrate,status,rollback}.mjs` enforce ordered migrations, checksums, an advisory lock, and explicitly confirmed recovery. `scripts/validate-migrations.mjs` requires a matching recovery script, a continuous version sequence, and rejects destructive forward SQL and floating-point types. CI runs validation and isolated integration migrations (`BE-0103`, `BE-0145`).
- Detailed naming, key, constraint, timestamp, deactivation, UTC/local-date, duration, decimal, currency, and JSON rules are in `database-conventions.md` (`BE-0104`–`BE-0106`).

## Schema catalogue

The four immutable forward migrations in `drizzle/` create and align these families:

| Family | Main records | Tasks |
|---|---|---|
| Identity and access | users, auth identities, sessions, login history, roles, permissions, user roles, scoped grants | BE-0110 |
| Organization | employees, divisions, teams, effective assignments, work policies/versions, holiday calendars | BE-0111–BE-0113 |
| Work and time | projects/members, tasks/members/checklists, attachments, entries, timers, one daily break, summaries, periods, verification/unlocks/amendments | BE-0120–BE-0124 |
| HR and evaluation | WFH, leave types/balances/requests, attendance, evaluations/responses/scores, one general remark model | BE-0130 |
| Finance and reporting | workload allocations, effective cost rates, budgets, payroll periods, reports, export jobs/artifacts | BE-0131 |
| Collaboration | notifications/delivery, documents/versions, messages, comments, announcements, files, search metadata | BE-0132 |
| Integrations and jobs | connections, encrypted credential references, cursors, webhooks/deliveries, idempotency records, jobs | BE-0133 |
| Audit | append-only actor/impersonator/action/resource/scope/time/reason/correlation/before/after events, protected by update/delete triggers | BE-0134 |

Foreign keys use restrictive deletion for historical business records. Effective dates and active flags preserve history. Generated nullable keys plus unique indexes enforce one running timer and one current active primary assignment per employee under concurrency. Time records retain local work date, UTC instants, timezone, integer minutes, method/location, and the applied policy version. Reporting indexes cover employee/date, scope contribution, exception, timer, and period access paths.

## Seeds and repository boundary

`scripts/seed-development.sql` is a transaction-safe, idempotent development seed. It contains all five divisions, all six contract role keys, representative assignments/projects/tasks, and deterministic Complete, Under-time, Overtime (including 12:00), Critical, Missing, leave, WFH, correction, locked-period, cost/report, and restricted Government Projects scenarios (`BE-0140`–`BE-0142`). It is illustrative only; authoritative business data remains an owner-supplied production input.

Repository ports and MySQL adapters live in `src/server/repositories/`. They select explicit safe projections and apply allowed employee/division and government-data predicates before querying; an out-of-scope employee causes no database query. `src/server/test/database-builder.ts` creates a random isolated schema, applies every migration in order, and safely drops only its validated generated database (`BE-0143`, `BE-0144`).

## Verification evidence

`database-foundation.integration.test.ts` verifies clean sequential migration, required table families, absence of floating-point columns, repeatable seed cardinality, primary-assignment/daily-break/running-timer uniqueness, foreign-key history protection, append-only audit triggers, and the representative employee/date query plan. `mysql.authorization.test.ts` proves scope rejection occurs before database access. The recovery workflow is intentionally guarded by `ALLOW_DESTRUCTIVE_RECOVERY=confirmed-empty-schema`; matching reviewed scripts exist for every migration.

Validated locally against MySQL 8.4.7:

- development and test databases report migrations `0001`–`0004` applied with matching checksums;
- deterministic seeds can be rerun without cardinality drift;
- backend unit, integration, and authorization projects pass;
- the complete backend verification command is the release gate for this phase.
