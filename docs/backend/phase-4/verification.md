# Backend Phase 4 — Timesheet calculation and correction

Status: Complete — 33/33 numbered tasks.
Recorded: 2026-09-10.
Scope: All 33 numbered Phase 4 tasks. The old summary's denominator of 32 omitted one task; no task was removed.

## Implementation

`src/server/time/application.ts` orchestrates time entry, timer, break override, remark, correction, verification, amendment and unlock operations. It receives identity from a trusted resolver and returns the existing `Result<T>` union. `ports.ts` separates application logic from MySQL. `mysql-repository.ts` binds all writes, summaries, audit events, idempotency records, notifications and outbox events to one transaction. A failure result rolls the transaction back as well as a thrown dependency failure.

`adapters.ts` implements `TimesheetService`, `RemarkService` and `PeriodService`; `team-adapter.ts` implements `TeamTimesheetService`. `composition.ts` connects these to database sessions and effective authorization. `/api/time` exposes reads and validated mutations with no-store responses, same-origin mutation checks, a server cookie identity, and field-level corrective guidance. It does not accept an acting user or a permission set from the payload.

The frontend remains on its demo service registry until Phase 9 cutover. Phase 4 supplies the replacement services and HTTP boundary; it does not silently move the demo to a production database or invent production credentials.

## Calculation and history

- The existing `src/lib/calculation/engine.ts` is the only daily calculation implementation. Its output now also carries task contributions. Employee, division, project, task and client figures originate from the same integer minutes.
- Validation now calculates the projected day through that engine, including the half-day break. Overlap checks use the work timezone rather than the Node process timezone.
- `instants.ts` converts local clocks to UTC, rejects nonexistent/ambiguous DST wall times and measures timers in elapsed integer minutes. The existing seeded `attribute_to_start_date` policy is retained for overnight timers. Manual clock ranges still reject an end before/equal to the start; direct duration entry remains available. Unsupported cross-midnight modes fail closed.
- Employee-specific effective policies take precedence over the primary division's policy and then the company policy. Missing policies prevent verification rather than silently excluding employees.
- Verified daily records retain both the calculation result and its input context: policy values/version, timezone, leave, holiday, WFH and break override. Amendments reuse this context even if a policy row subsequently changes. Every verification/amendment appends a separate verification snapshot and audit evidence; an unlock preserves that evidence.
- Part-time policies and approved half-day leave adjust requirements without changing the standard 420 active + 60 break = 480 total baseline. Exactly 720 total minutes remains Overtime.

## Transactions and authorization

Time writes acquire the database write guard before the employee lock. Period verification uses the same guard and a deterministic employee lock order. This deliberately conservative lock serializes verification against edits, timer starts and break changes. The migration explicitly uses InnoDB for the guard: a concurrency regression exposed that the local WAMP default is MyISAM, which does not retain this row lock through the transaction. The regression checks both the engine and concurrent verification/amendment behavior. Row versions protect stale updates; the timer table's existing unique running-employee key remains the final timer invariant.

Create/start/stop/verify/amend retries use actor + operation + key plus a normalized request fingerprint. A different payload with a reused key conflicts. A stopped timer is a persisted draft, absent from counted time; saving its `draftEntryId` and `draftVersion` consumes it once. Clock overlap is also checked across stored UTC intervals, including a timer attributed to the previous date.

Authorization runs before aggregation, search matching, pagination and counts. Hidden government entries never enter the viewer's totals. A write that would need to validate hidden contributions returns not-found rather than leaking a total through an overtime error. Attachment identifiers and counts use an explicit `restricted` variant without their values. The existing Team Lead badge displays `Restricted` using the shared component.

`time.break.override`, `time.period.amend`, and `time.period.unlock` are distinct capabilities. Migration 0008 defines the grantable permissions and grants none of them. Effective unscoped personal grants are loaded by the authorization resolver. Role and permission validity is checked today, independently of the historical work date used for assignment scope; a revoked permission cannot be revived by choosing an old date.

Critical-day notifications are inserted transactionally for the Team Lead and HR, with a deduplication key and generic text. Remarks and amendments also produce safe in-app notifications. Legacy Finance reviewers receive amendment notifications until the separate role-consolidation migration. The durable time outbox records downstream projection/delivery work; external delivery workers and the later HR/reporting projections remain owned by their planned phases.

## Contract additions for cutover

- Time entries expose a version. Updates/deletes must supply the version that was read, rather than fetching the latest version just before writing.
- A stopped timer's input carries optional `draftEntryId` and `draftVersion`; preserve both when saving the reviewed draft.
- `TimeEntry.attachmentIds` and `TimeEntryView.attachmentCount` can be `restricted`. Do not turn that value into an empty list or zero.
- Amendments pass `expectedVersion` within the existing `changes` envelope. Employee, local date and applied policy cannot be rewritten through that envelope.
- The database service factory requires a server-issued session token. Demo browser authentication is not a backend session.

## Migration repair

The checkout contained **two different migration files numbered 0006**. Applying both failed with duplicate columns. The original `0006_organization_work.sql` is preserved byte-for-byte. The competing `0006_organization_work_services.sql` and its recovery script are archived under this directory. Migration 0007 adds the non-duplicated profile-photo, division-lead and actual-minute-view additions; migration 0008 supplies Phase 4 persistence.

Existing databases that applied the original 0006 can apply 0007 then 0008 normally. If a database recorded the competing 0006 checksum, the migration runner must continue to refuse the mismatch: inspect that schema against the archived script and rehearse reconciliation in a copy before deployment. Do not replace the recorded checksum or bypass the check. No user database was migrated during this work; integration tests create and dispose isolated `office_test_*` databases.

Recovery scripts favor a verified backup restore or a forward repair after business writes. They do not erase timer drafts, audit records or verification snapshots to make rollback appear successful.

## Task evidence

| Tasks | Deliverables / evidence |
|---|---|
| BE-0401, BE-0403, BE-0406, BE-0407 | Shared calculation engine, integer division/project/task contributions, day/week/month/team adapters |
| BE-0402, BE-0409, BE-0411 | Effective policy selection; frozen policy/leave/holiday/break context; part-time and half-day tests |
| BE-0404, BE-0405, BE-0408 | One daily break, separate override permission/reason/audit; overtime and critical field guidance |
| BE-0410 | UTC conversion, DST rejection, elapsed timer minutes, tested overnight attribution and next-day overlap |
| BE-0420, BE-0424, BE-0425, BE-0426, BE-0428, BE-0429 | Validated entry CRUD, versions, effective assignments, task review, project state, leave/holiday rejection, typed Result errors; saved state has no approval |
| BE-0421 | Copy returns an unsaved target-date input; save revalidates all rules |
| BE-0422, BE-0423 | Atomic timer start, recovery, persisted stop draft, idempotent stop/save, cancellation |
| BE-0427 | Transactional daily summary; source-derived project/task views; durable projection invalidation outbox |
| BE-0440, BE-0441, BE-0442 | Single remark model, append-only response/audit history, authorized clarification/resolution, before/after correction evidence |
| BE-0443, BE-0444, BE-0445, BE-0446 | Completeness/correction inventory; verified snapshots; separately authorized amendment/unlock; locked-period conflicts |
| BE-0450, BE-0451, BE-0452 | Boundary, cross-division, half-day, part-time, leave/holiday, project/task, timezone/DST and overnight tests |
| BE-0453 | Real MySQL concurrent start/stop/edit/verification tests and injected audit-failure rollback |
| BE-0454 | Backend adapter-to-engine checks plus the existing 14-test cross-screen reconciliation suite covering dashboards, reports and Finance |

## Verification results

- `verify:backend`: passed type generation/typecheck, lint, validation of all 8 migrations and recovery scripts, backend tests, the high-severity dependency audit gate, and the production build (58 generated pages, including the dynamic `/api/time` route).
- Final backend suite after the service-boundary additions: **168/168 tests, 21 files**. Phase 4 contributes 47 tests across calculation, HTTP, service failures and real-MySQL integration. Concurrent timer starts, duplicate stops, competing edits, verification versus editing, and competing amendments pass.
- Final standalone TypeScript check and ESLint check of `src/server/time`: passed after the last adapter edits.
- Frontend regression suite: **409/409 tests, 21 files**, including the shared cross-screen reconciliation cases. Contrast audit: **48/48**. No new browser layout/accessibility audit is claimed for this backend phase.
- Live `/api/time` smoke check without a session: **HTTP 401**, with the typed unauthenticated response.
- Dependency audit: no high/critical findings; **4 moderate findings** remain in the existing Drizzle development-tool dependency chain. The suggested forced fix changes Drizzle versions and was not applied.

The public service factory also converts adapter dependency failures into safe `Result` errors. Period lists derive included employees and exceptions from the authorized inventory rather than publishing placeholder zero counts.

The checks run on Node.js 24.20.0. The available local WAMP server is MySQL 9.1.0; a MySQL 8.4 LTS runtime is not installed here. The approved production target remains MySQL 8.4 LTS; staging must exercise that target before release. No production performance, external provider, backup recovery or stakeholder acceptance claim is made by this phase.

Business-supplied policies, schedules, assignments and payroll period rules are still owed. The deterministic demo data and its five-day week are engineering examples, not new stakeholder decisions. The write guard's throughput should be measured during Phase 8 before considering narrower locks.
