# Modify Phase B1 — Backend Schema and Data Migration

Recorded: 19 September 2026.

Technical implementation and rehearsal are complete for `MBE-0101`–`MBE-0109`. `MBE-0110` remains in progress only because the required HR approval of rehearsal totals is an external sign-off and cannot be self-certified by engineering.

## Delivery evidence

| Tasks | Deliverables and evidence |
|---|---|
| `MBE-0101`, `MBE-0104` | `drizzle/0011_task_work_log_cutover.sql` adds required `source` and unique `idempotency_key` fields to `time_entries`. Existing range-based rows are classified as `migrated_clock_entry`; no operational row is copied. A check constraint rejects ranges on every non-historical source, and an insert guard prevents callers from forging new post-cutover historical rows. |
| `MBE-0102` | The migration creates append-only `task_status_transitions` with task, from/to statuses, actor, UTC change instant, note, task version, and actor-scoped unique idempotency. Database triggers reject update/delete. `scripts/db-harden-task-work-grants.mjs` gives runtime principals insert-only access to this table. |
| `MBE-0103` | Existing `timer_sessions` rows remain available for audit. The grant hardener gives runtime principals no table-level DML on `timer_sessions`, so new timer sessions and runtime mutation are retired without deleting history. |
| `MBE-0108` | New `(employee_id, work_date, id)` and `(task_id, work_date, id)` indexes replace reliance on clock-range ordering in the employee-day path. |
| `MBE-0105` | A running timer is stopped at the recorded UTC cutover instant and linked to one uncounted historical draft. Its payload is marked for employee review and an audit event records the conversion. Existing stopped drafts remain unchanged. |
| `MBE-0106` | The migration snapshots a SHA-256 fingerprint of every pre-cutover time-entry fact, including original ranges and audit timestamps. It restores `updated_at` after adding metadata, reconciles every counted employee-day and verified/amended period before/after, and deliberately fails if any fingerprint, total, or count differs. Daily and period snapshots are not rewritten. |
| `MBE-0107` | `drizzle/recovery/0011_task_work_log_cutover.sql` is guarded: recovery is refused after a post-cutover transition or ordinary duration log. Within the safe window it removes cutover drafts, restores affected timers, restores the old indexes/schema, and removes the new tables. The cutover and every automatically stopped timer are audited. |
| `MBE-0109` | `scripts/seed-development.sql` now seeds In Progress tasks, append-only transition history, three duration-only work logs totalling 420 minutes across three divisions, and a separate immutable historical clock example. Reapplying the seed remains idempotent. |
| `MBE-0110` | The migration was rehearsed from the schema at version `0010` against mixed legacy clock/duration data, a verified period, and a running timer. Automated reconciliation passed with zero drift. HR sign-off is still required before production application. |

## Cutover controls

The migration records one UTC cutover instant in `time_capture_cutovers`. Classification is based on record creation/cutover state, not the reported work date. Existing clock rows keep their original `entry_method`, UTC range, integer minutes, work attribution, policy reference, status, audit fields, and version.

Runtime grants are intentionally a separate deployment operation because migrations run as a privileged migrator while the application uses one or more restricted accounts. After migration `0011`, operations must set `RUNTIME_DATABASE_ACCOUNTS` to a comma-separated list of `user@host` principals and run:

```text
npm run db:harden-task-work
```

The command revokes broad runtime grants, restores database-wide read access, grants ordinary DML only where needed, grants transition insert only, and grants no DML on timer sessions, migration evidence, cutover metadata, or schema-migration history. The integration test creates a temporary runtime principal and verifies the resulting information-schema privileges.

## Recovery boundary

The checked-in recovery script is for an immediate failed deployment only. It is safe while no ordinary post-cutover work log and no task transition exists. Once employees create task-based records, recovery is a restore-to-isolated-database plus audited forward-repair operation; deleting those records to force a rollback is forbidden.

Production sequence:

1. Take and verify a database backup.
2. Apply migration `0011` with the migrator account.
3. Run `npm run db:harden-task-work` for every runtime principal.
4. Confirm the reconciliation table contains no before/after difference and retain its evidence.
5. Have HR compare the rehearsal totals and record approval.
6. Continue with B2 application-contract retirement before browser cutover.

## Verification run

- Migration validator: passed, **11** ordered forward migrations and matching recovery scripts.
- B1 migration/foundation integration: **7/7 passed**. This includes forward migration, fact preservation, reconciliation, in-flight conversion, database constraints, append-only transitions, runtime grants, guarded recovery, full-chain migration, and seed idempotency.
- Affected organization/HR compatibility run: **26 passed**; the three remaining HR failures are older Friday/Saturday weekly-holiday expectations and are not caused by B1.
- Existing Phase 4 time integration: **17/26 passed**. The nine failing cases assert the retired clock/timer behavior and remain explicitly assigned to B2 contract removal (`MBE-0202`) rather than weakening the B1 database boundary.
- Route type generation and TypeScript: passed.
- ESLint: passed with zero reported warnings.

## HR sign-off record

| Field | Status |
|---|---|
| Technical rehearsal | Complete — automated reconciliation found zero drift |
| Evidence reviewed by | Pending HR representative |
| Approval date | Pending |
| Approval/reference | Pending |

Phase B1 must remain **In progress (9/10)** until those final three fields are supplied. No production cutover is claimed by this document.
