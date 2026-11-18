# BE-0905 Verification — Cross-Surface Total Reconciliation

## Outcome

`BE-0905` is complete. A MySQL-backed integration scenario now proves that the
employee dashboard, daily timesheet, report query, evaluation facts, and
Finance hours view all consume the same authoritative seeded time facts. No
surface recomputes time or adds the recognized break per work log.

## Reconciled scenario

The test uses Nadia Rahman's deterministic development seed for 2 September
2026. To compare every protected surface under one authorization scope, the
isolated test database temporarily gives that seeded user Super Administrator
access. It does not change the seeded employee, assignments, work logs, policy,
payroll period, or effective cost rate.

| Fact | Expected result | Reconciled surfaces |
|---|---:|---|
| Active work | 420 minutes (`7:00`) | Dashboard, timesheet, report, evaluation, Finance |
| Recognized break | 60 minutes (`1:00`) | Dashboard, timesheet, report, evaluation, Finance |
| Scheduled total | 480 minutes (`8:00`) | Dashboard, timesheet, report, Finance |
| Day classification | Complete | Dashboard and timesheet |
| Applied policy version | 1 | Report metadata and timesheet requirements |
| Division/grouped active sum | 420 minutes | Timesheet contributions, report rows, Finance rows |
| Internal labour cost | BDT 8,400.00 | Finance, using the effective rate and exact money path |

The evaluation period is created over the same single local date, so its
captured `actualActiveMinutes`, `breakMinutes`, and `requiredActiveMinutes`
must match the daily calculation rather than a separately derived value.

## Automated evidence

Executed on 2 November 2026 with Node 24 and the local isolated MySQL test
database:

| Command | Result |
|---|---|
| `npm run test:backend -- src/server/reconciliation/production-surfaces.integration.test.ts` | Passed: 1 file, 1 reconciliation scenario |
| Reconciliation plus time, reporting, and HR integration suites | Passed: 4 files, 72 tests |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |

The broader `npm run test:backend` run completed with 43 passing files and 371
passing tests, but it is not recorded as a clean BE-0905 gate. Four unrelated
existing suites failed on the local MySQL 9.1 runtime: ISO timestamp insertion
in organization audit tests, a task-work fixture missing
`allocation_percent_basis_points`, and a department concurrency deadlock. The
new reconciliation test and its directly dependent time, HR, and reporting
suites remain green. The approved deployment database is MySQL 8.4 LTS.

## Implementation evidence

- `src/server/reconciliation/production-surfaces.integration.test.ts`
- `src/server/time/composition.ts`
- `src/server/reporting/composition.ts`
- `src/server/hr/composition.ts`
- `src/server/operations/composition.ts`

The production compositions are used directly; no mock adapter or fixture-only
calculation path participates in the assertions.
