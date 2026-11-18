# BE-0912 Verification — Production Data Import Commands

## Outcome

`BE-0912` is complete. Production data now enters through guarded, idempotent
commands rather than direct edits. The implementation supports all nine
`BE-0910` dataset families and enforces the `BE-0911` mapping, validation,
duplicate, rejection, dry-run, approval, reconciliation, commit, and rollback
contract.

No business-owner data was imported while completing this task. The commands
operate only when an owner manifest and checksum-matching canonical CSV are
provided.

## Delivered interfaces

| Operation | Command |
|---|---|
| Validate without business-table writes | `npm run db:import -- dry-run --manifest <manifest.json> --source <data.csv>` |
| Record a checksum-bound approval | `npm run db:import -- approve --batch <id> --scope <scope> --actor <user-id> --reason <text>` |
| Commit the approved batch | `npm run db:import -- commit --manifest <manifest.json> --source <data.csv> --actor <user-id>` |
| Read safe batch status | `npm run db:import -- status --batch <id> --actor <user-id>` |
| Read/export safe rejection evidence | `npm run db:import -- rejections --batch <id> --actor <user-id> [--output <new-file.csv>]` |
| Guarded rollback | `npm run db:import -- rollback --batch <id> --actor <user-id> --reason <text> --confirm <batch-id>` |

The command uses `DATABASE_MIGRATION_URL`, never the runtime application
identity. A manifest example is in `import-manifest.example.json`. The example
checksum and actor are placeholders and deliberately fail validation until
replaced.

## Durable evidence

Migration `0015_production_data_imports.sql` adds:

- `import_batches` for immutable source/checksum, state, schema/snapshot,
  reconciliation counts and operator evidence;
- `import_rows` for safe row outcomes and corrective rejection guidance;
- `import_approvals` for active owner/HR/financial/division/technical approvals
  bound to the source, evidence, mapping and target snapshot;
- `import_crosswalks` for source-key idempotency and target traceability; and
- `import_mutations` for exact post-commit fingerprints and guarded rollback.

Every dry run, approval, commit and rollback also writes an append-only
`audit_events` record. Runtime database accounts receive no mutation grants on
`import_*`; the migration/import identity owns the controlled workflow.

## Implemented controls

- SHA-256, declared row count, source cut-off, mapping version, owner/steward,
  sensitivity, safe CSV and exact header validation.
- Canonical ISO dates/instants, integer minutes, exact basis points, fixed
  decimal money and explicit enum parsing without guessing.
- All nine mappings: employees, divisions, assignments/departments/leads,
  calendars/holidays, leave balances/types, projects/memberships,
  tasks/memberships, cost rates and opening periods.
- Employee/division/project eligibility, allocation, effective-date, role,
  task-state, financial-scope, policy and period-overlap checks.
- Identical reruns return the original committed batch; conflicting natural
  keys and changed prior imports are rejected rather than overwritten.
- Duplicate rows are deterministic; safe reports contain hashes and guidance,
  not raw PII or cost values.
- Commit rechecks the source checksum, schema, evidence, target snapshot and
  every required current approval under a global import lock.
- Each dataset commits atomically and records a source crosswalk plus exact
  inserted-row fingerprints.
- Rollback requires Super Administrator authority, a reason and exact batch-id
  confirmation. It runs in reverse mutation order and refuses to delete any
  row changed or referenced after import.
- Rolled-back crosswalk and audit evidence remains available; a later release
  can re-import the same authoritative source through a new batch.

## Automated evidence

Executed on 2 November 2026 with Node 24 and isolated local MySQL databases:

| Gate | Result |
|---|---|
| Import integration suite | Passed: all nine families, approvals, commit, idempotent rerun, reverse rollback, conflicting duplicates, safe rejections, stale snapshot, changed-row rollback refusal and checksum mismatch |
| Import plus migration regression suites | Passed: 4 files, 12 tests |
| `npm run db:validate` | Passed: 15 forward migrations with matching recovery scripts |
| CLI help smoke test | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed: Next.js 16.3.4 production build, 69/69 static pages |

The approved deployment target remains MySQL 8.4 LTS. Local verification used
the configured WAMP MySQL test service and isolated schemas.

## Operational boundary

`BE-0910` remains in progress because no authoritative owner extracts have
been supplied. `BE-0913` owns the production-like rehearsal and business-owner
sign-off. `BE-0914` owns maintenance mode, release sequencing and disaster
rollback decisions. Real source files must remain in the approved secure intake
location and must never be committed to this repository.
