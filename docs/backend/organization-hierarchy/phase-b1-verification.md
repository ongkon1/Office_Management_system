# Organization Hierarchy — Phase B1 Verification

Division-owned departments, effective-dated leadership and per-assignment
placement in MySQL, with a reviewable backfill of the legacy employee-level
department string.

| Field | Value |
|---|---|
| Milestone | `organization_hierarchy_milestone.md` Phase B1 |
| Tasks | `OH-BE-0101` – `OH-BE-0115` |
| Forward migration | `drizzle/0013_department_hierarchy.sql` |
| Recovery | `drizzle/recovery/0013_department_hierarchy.sql` |
| Status | 14 of 15 complete; `OH-BE-0115` deliberately not done (see §6) |

---

## 1. What the migration creates

| Object | Purpose | Task |
|---|---|---|
| `departments` | Division-owned catalogue with generated `normalized_name` / `normalized_code`, status, deactivation reason, version and audit actors | `OH-BE-0101` |
| `uq_departments_division_name`, `uq_departments_division_code` | Uniqueness **inside a division**, so two divisions may each own a "Sales" | `OH-BE-0102` |
| `uq_departments_id_division` | Exists for a foreign key, not for lookups — it lets placement reference the pair | `OH-BE-0105` |
| `department_lead_assignments` | One row per appointment, closed by an `effective_to`, with `uq_department_lead_start` and a generated `open_period_marker` carrying `uq_department_single_open_period` | `OH-BE-0103`, `OH-BE-0107` |
| `employee_division_assignments.department_id` | Placement, nullable so an unmappable legacy row keeps working | `OH-BE-0104` |
| `fk_assignments_department (department_id, division_id)` | Same-division placement, made **unrepresentable** rather than merely validated | `OH-BE-0105` |
| `department_migration_review` | One row per decision the backfill refused to make, with the ids needed to fix it | `OH-BE-0110` |
| `department_migration_reconciliation` | Counts whose `CHECK` proves the arithmetic: mapped + unmapped = active | `OH-BE-0110` |
| `employees_legacy_department_read_only`, `assignment_legacy_lead_read_only` | Freeze the legacy columns for the compatibility deployment | `OH-BE-0111` |

Three decisions are worth stating plainly, because each had a plausible wrong
alternative:

- **Normalization is generated, not supplied.** `normalized_name` and
  `normalized_code` are `STORED GENERATED` columns, so no write path can forget
  to normalize and defeat in-division uniqueness with casing or padding. The
  rehearsal proves `'  technical '` joins the existing `Technical` rather than
  creating a second department.
- **Cross-division placement is a schema impossibility.** Because `departments`
  carries a unique `(id, division_id)` and the assignment's foreign key is that
  pair, a placement into another division's department fails with
  `ER_NO_REFERENCED_ROW_2`. Service validation still exists — it turns the
  refusal into a usable answer — but the invariant does not depend on it.
- **Ids in the backfill are derived, never random.** Both backfilled tables
  build their ids from an MD5 of the same key that makes the row unique, so a
  rehearsal and the production run produce identical ids, and re-running the
  backfill during a recovery drill cannot fork the catalogue. The integration
  test recomputes the id independently with Node's `crypto` and compares.

## 2. The backfill, and what it refuses to guess

Legacy state is an employee-level string (`employees.department`, added in
migration 0006) plus a per-assignment `lead_employee_id`. The backfill
(`OH-BE-0108`, `OH-BE-0109`):

1. Creates one department per distinct **(division, normalized legacy name)**
   combination reachable through an active assignment. An employee working in
   two divisions therefore produces the name in both — which is legitimate, and
   is reported for confirmation rather than resolved by guessing which division
   really owns it.
2. Maps every active assignment whose employee's legacy name matches a
   department **in that same division**. No near-matching, no cross-division
   fallback.
3. Creates one open appointment per department **only where the legacy data
   says one thing**: a single distinct legacy lead among active members, who is
   still an active employee with an effective assignment in that division. The
   period starts on the earliest date the legacy data attests that leadership,
   so a historical authorization question still resolves.

Everything else is reported, never inferred:

| Issue type | Meaning |
|---|---|
| `legacy_department_missing` | Active assignment whose employee has no legacy value |
| `unmapped_assignment` | Legacy value present but unusable or matching no department in that division |
| `cross_division_department` | A name exists in two divisions — confirm they are separate departments |
| `conflicting_legacy_lead` | Members name more than one legacy lead, so no appointment was created |
| `ineligible_legacy_lead` | The single legacy lead is inactive or no longer assigned to that division |
| `legacy_lead_disagrees` | A placement's frozen legacy lead differs from the appointment in force (empty after a backfill by construction; it is the drift detector for Phase B3) |
| `generated_code_needs_review` | The code was derived from the name; an administrator replaces it with the division's own |

`npm run db:department-report` prints the migration's own frozen record, the
live counts beside it, the issue totals and the rows, read-only, from the tables
the migration wrote — so the report cannot disagree with what was applied
(`OH-BE-0110`).

## 3. Invariants that need a transaction

`src/server/organization/departments.ts` (`MysqlDepartmentRepository`) owns the
two rules the schema cannot express, and `src/server/organization/department-rules.ts`
holds the decisions themselves so they exist once and are testable without
MySQL (`OH-BE-0106`, `OH-BE-0107`, `OH-BE-0113`):

- **One effective placement per employee, division and date.** The assignment
  row is locked, every other assignment of that employee in that division is
  read under the lock, and `conflictingPlacement` judges them. Two concurrent
  placements therefore produce one `placed` and one `conflicting_placement`
  instead of two overlapping truths.
- **Non-overlapping lead periods.** The department row and its whole history are
  locked; an appointment already starting on or after the new date is refused
  rather than resolved; the open period is closed the day before the new one
  begins; a period that has already ended is never touched.

The repository returns outcome values rather than `Result<T>`. Authorization,
audit, "an appointment may not start in the past" and the wording a person sees
belong to the application service in Phase B2 — this layer deliberately owns no
policy.

## 4. Legacy compatibility (`OH-BE-0111`)

Nothing legacy is dropped. `employees.department` and
`employee_division_assignments.lead_employee_id` stay readable, because routing
in HR requests, evaluations, notifications and task review still reads the
latter until Phase B3 switches those readers to department leadership.

Writes are frozen in two layers:

- **Triggers coerce rather than signal**, the pattern migration 0011 already
  uses for historical time entries. A legacy writer keeps working and its value
  for a legacy column is ignored, so a compatibility deployment cannot crash on
  a write it was always going to make.
- **The application services ignore a submitted lead on update**
  (`src/server/organization-work/service.ts`, `src/server/organization/application.ts`),
  so the normal path never reaches the trigger and no employee save can supply
  an authoritative Team Lead. An insert may still carry one, which is what keeps
  current routing working; every disagreement between the two is listed as
  `legacy_lead_disagrees`.

## 5. Evidence

| Check | Result |
|---|---|
| `npm run db:validate` | 13 forward migrations and matching recovery scripts; the new rules assert 0013's keys, the composite foreign key, the reconciliation `CHECK`, the freeze triggers, that the legacy column is **not** dropped, and that no id is random |
| `department-rules.unit.test.ts` | 11 passed |
| `legacy-lead-freeze.unit.test.ts` | 2 passed |
| `department-hierarchy-migration.integration.test.ts` | 2 passed — empty-database migration, and the representative upgrade with 11 employees covering every legacy shape, the constraint refusals (`ER_DUP_ENTRY`, `ER_NO_REFERENCED_ROW_2`, `ER_CHECK_CONSTRAINT_VIOLATED`, `ER_ROW_IS_REFERENCED_2`), the frozen columns, and recovery |
| `department-repository.integration.test.ts` | 24 passed, including both locking races |
| Backend suites | unit 109/109, integration 167/167, api + authorization 78/78 |
| Frontend suite | 918/918 |
| `npm run typecheck`, `eslint`, `next build` | clean (one pre-existing `session-provider.tsx` warning, untouched) |
| Development database | `db:migrate` applied 0013, `db:seed` produced 8 departments across all five divisions, `db:rollback -- --to 0013` removed the hierarchy leaving 11 employees and `lead_employee_id` intact, and re-applying produced identical ids |

The representative upgrade is the rehearsal the exit criteria ask for: 11
active assignments, 7 legacy combinations, 6 departments created, 9 placed, 2
awaiting placement with a reason each, 2 appointments created and 2 departments
left without one because their legacy data did not settle the question.

## 6. What Phase B1 deliberately does not do

`OH-BE-0115` ("remove legacy columns only in the later cutover migration after
reconciliation approval") stays `[~]`. The removal is not this migration's job
and cannot be substantiated yet: it needs Phase B3 to move every reader onto
department leadership, and HR to sign the reconciliation report. The validator
now fails the build if 0013 ever starts dropping `employees.department`, so the
sequencing cannot be undone by accident.

Also out of scope, and tracked where they belong: the application service,
authorization and audit for these tables (Phase B2), workflow and reporting
readers (Phase B3), and the `teams` table, which predates this milestone and is
a separate concept the hierarchy model does not claim.
