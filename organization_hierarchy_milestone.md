# Organization Hierarchy Milestone Plan

## Division → Department → Team Lead → Employees

| Field | Decision |
|---|---|
| Application model | One Next.js full-stack application with MySQL |
| Requirements source | `project_requirement.md` v1.4 |
| Architecture source | `docs/architecture.md` §8.8 |
| Hierarchy | Division → Department → effective Team Lead assignment → employee division assignments |
| Placement model | Department is selected separately for every employee–division assignment |
| Lead eligibility | Any active employee with an active assignment in the same division |
| Lead authority | The effective appointment grants Team Lead capabilities only for that department |
| Multiplicity | One current lead per department; one employee may lead multiple departments |
| Delivery order | Contracts and frontend behavior → schema/migration → services/authorization → downstream cutover |
| Current status | Phases F1, F2, F3, B1, B2 and B3 complete; Phase V1 is next |

## 1. Task Status Convention

Use exactly one status marker on every tracked task:

- `[ ]` Pending — work has not started.
- `[~]` In progress — work is actively being implemented or reviewed.
- `[x]` Done — work is implemented, verified, and satisfies its acceptance criteria.

Rules:

- A task must have exactly one marker.
- Change `[ ]` to `[~]` when work starts and `[~]` to `[x]` only after its evidence exists.
- If a completed task needs material rework, return it to `[~]`.
- Update both the task and §11 progress table whenever status changes.
- Documentation approval does not mark implementation tasks complete.

## 2. Approved Organization Model

```text
Division
└── Department
    ├── One effective Team Lead at a time
    └── Many employee–division assignments
```

- A department belongs to exactly one division.
- Department name and code are unique inside the division, not company-wide.
- Every new active employee–division assignment has exactly one department in the same division.
- An employee working in several divisions may have a different department in each division.
- Any active employee assigned to the department's division may be appointed as its lead.
- A lead appointment grants department-scoped Team Lead capabilities; it does not grant company-wide authority or silently add a permanent global role.
- One person may lead multiple departments, including departments in different divisions where they have active assignments.
- Lead appointments and employee placement are effective-dated. Past authority and responsibility are never rewritten.
- Project manager and project-member authority remains separate from department leadership.
- Only Super Administrators manage departments and lead appointments.

## 3. Milestone Overview

| Phase | Name | Demonstrable outcome |
|---:|---|---|
| 0 | Product rules and architecture | Requirements, decisions, data ownership, authorization, and rollout boundaries are unambiguous. |
| F1 | Frontend contracts and mock model | Typed contracts and mock adapters represent per-assignment departments and effective lead scopes. |
| F2 | Department administration | Super Administrators manage division-owned departments and effective lead appointments. |
| F3 | Employee placement and lead experience | Each division assignment selects a department, and appointed leads receive department-scoped experiences. |
| B1 | MySQL schema and migration | Persistent hierarchy, history, constraints, backfill, and recovery paths are operational. |
| B2 | Services, authorization, and audit | Server-side mutations, derived authority, effective-date resolution, and audit are authoritative. |
| B3 | Workflow and reporting integration | Requests, timesheets, workload, evaluation, search, reports, and exports use department scope safely. |
| V1 | Cutover and quality gates | Mock hierarchy is removed and the feature passes security, migration, responsive, and regression gates. |

## 4. Phase 0 — Product Rules and Architecture

- [x] `OH-0001` Confirm Division → Department → Team Lead → Employees as the organization hierarchy.
- [x] `OH-0002` Confirm department placement belongs to each employee–division assignment rather than the employee globally.
- [x] `OH-0003` Confirm one effective lead per department and allow one employee to lead multiple departments.
- [x] `OH-0004` Confirm any eligible active employee may be appointed and that the appointment grants scoped lead capabilities.
- [x] `OH-0005` Confirm only Super Administrators may mutate departments or lead appointments.
- [x] `OH-0006` Confirm effective-dated employee placement and leadership history.
- [x] `OH-0007` Define same-division integrity, uniqueness, deactivation, and non-destructive history rules.
- [x] `OH-0008` Amend `project_requirement.md` with testable requirements and acceptance scenarios.
- [x] `OH-0009` Amend `docs/architecture.md`, `MEMORY.md`, and `AGENTS.md` with the authoritative model.
- [x] `OH-0010` Record the implementation phases, dependencies, evidence rules, and progress baseline in this milestone.

### Phase 0 Exit Criteria

- [x] No authoritative requirement or architecture rule treats department as one global employee field.
- [x] Lead appointment and global role assignment are explicitly separate concepts.
- [x] Multi-division placement, historical resolution, and scoped authorization have one agreed interpretation.

## 5. Frontend Phases

## Phase F1 — Frontend Contracts and Mock Model

- [x] `OH-FE-0101` Add typed Department and effective DepartmentLeadAssignment domain contracts.
- [x] `OH-FE-0102` Add `departmentId` to EmployeeDivisionAssignment input, detail, list, and history contracts.
- [x] `OH-FE-0103` Remove authoritative department and Team Lead fields from Employee form input and view contracts.
- [x] `OH-FE-0104` Define division-filtered department option and eligible-lead option contracts.
- [x] `OH-FE-0105` Define department list/detail, membership, lead-history, validation, conflict, and audit view models.
- [x] `OH-FE-0106` Extend session/access contracts with effective department-lead scopes without fabricating a global role.
- [x] `OH-FE-0107` Refactor the mock department store to own division, status, and effective lead history.
- [x] `OH-FE-0108` Refactor mock employee placement so every division assignment references a department.
- [x] `OH-FE-0109` Derive lead authority and department membership from the same effective-dated mock state.
- [x] `OH-FE-0110` Seed departments for all five divisions, including duplicate names across divisions.
- [x] `OH-FE-0111` Add contract and service tests for cross-division rejection, multiple departments per lead, and date-effective resolution.
- [x] `OH-FE-0112` Remove or quarantine the preliminary primary-department prototype after the replacement contracts pass.

### Phase F1 Exit Criteria

- [x] Components consume hierarchy data only through typed services.
- [x] No employee save can supply an authoritative Team Lead.
- [x] The mock model supports one employee in different departments across different divisions.
- [x] Type-check, lint, and targeted unit tests pass.

### Phase F1 Evidence

| Tasks | Evidence |
|---|---|
| `OH-FE-0101`–`OH-FE-0102` | `src/contracts/domain.ts`, `src/contracts/hr.ts` |
| `OH-FE-0103` | `src/contracts/hr.ts`, `src/features/hr/employees.tsx`, `src/services/mock/hr.ts` |
| `OH-FE-0104`–`OH-FE-0105` | `src/contracts/organization-hierarchy.ts` |
| `OH-FE-0106`, `OH-FE-0109` | `src/services/mock/auth.ts`, `src/services/mock/organization-hierarchy.ts`, `src/services/mock/team-lead.ts` |
| `OH-FE-0107`, `OH-FE-0110` | `src/services/mock/department-store.ts` |
| `OH-FE-0108` | `src/fixtures/index.ts`, `src/services/mock/hr.ts` |
| `OH-FE-0111` | `src/services/mock/organization-hierarchy.test.ts`, updated HR, Team Lead, and administration regression tests |
| `OH-FE-0112` | Legacy employee department/lead fields are deprecated migration snapshots; current employee forms and saves cannot set them, and department creation no longer bundles a lead appointment. |

Verification completed 16 Sep 2026: `npm.cmd run typecheck` passed; `npm.cmd run lint` passed; focused hierarchy/HR/Team Lead/administration suite passed 95/95; full Vitest regression suite passed 572/572 across 35 files.

## Phase F2 — Department Administration

- [x] `OH-FE-0201` Build the Super Administrator department catalogue grouped and filterable by division.
- [x] `OH-FE-0202` Show department code, status, current lead, effective date, and active employee count.
- [x] `OH-FE-0203` Build create/edit forms with division-dependent validation and in-division uniqueness guidance.
- [x] `OH-FE-0204` Build an eligible-lead picker limited to active employees assigned to the department's division.
- [x] `OH-FE-0205` Build effective-now and scheduled-future lead appointment flows.
- [x] `OH-FE-0206` Show leadership history without allowing historical rows to be overwritten.
- [x] `OH-FE-0207` Support department deactivation and block new placements into inactive departments.
- [x] `OH-FE-0208` Block destructive deletion or division movement for referenced departments with corrective guidance.
- [x] `OH-FE-0209` Cover loading, empty, validation, conflict, denied, error, and success states.
- [x] `OH-FE-0210` Verify dialogs, forms, tables/cards, and destructive actions with keyboard and screen readers.
- [x] `OH-FE-0211` Add `/admin/departments` to responsive, accessibility, stress, and role-access audits.

### Phase F2 Exit Criteria

- [x] Only Super Administrators see and can use mutation controls.
- [x] The same department name may exist in two divisions without ambiguity.
- [x] Lead changes show their effective date and retained history.
- [x] The screen works at 375, 768, 1024, and 1440 px without page-level overflow.

### Phase F2 Evidence

| Tasks | Evidence |
|---|---|
| `OH-FE-0201`–`OH-FE-0202` | `src/features/admin/departments.tsx`, `src/features/admin/department-shared.tsx` |
| `OH-FE-0203` | `src/features/admin/department-form.tsx` |
| `OH-FE-0204`–`OH-FE-0205` | `src/features/admin/department-lead-dialog.tsx` |
| `OH-FE-0206` | `src/features/admin/department-detail-drawer.tsx` |
| `OH-FE-0207`–`OH-FE-0208` | `src/features/admin/department-status-dialogs.tsx`, `src/services/mock/department-admin.ts` |
| Service and contracts | `src/contracts/organization-hierarchy.ts` (`DepartmentAdministrationService`), `src/services/mock/department-admin.ts` |
| `OH-FE-0209`–`OH-FE-0210` | `src/services/mock/department-admin.test.ts` (29 tests), `src/features/admin/departments.test.tsx` (12 tests), `scripts/_ohfe02-probe.mjs` (77 checks) |
| `OH-FE-0211` | `scripts/responsive-audit.mjs`, `scripts/a11y-audit.mjs`, `scripts/stress-audit.mjs`, `scripts/phase2-flows.mjs` |

**F1 delivered the view models but no service**, so F2 added one rather than
extending the preliminary prototype, which AGENTS.md forbids. The new
`DepartmentAdministrationService` (`catalogue`, `get`, `create`, `update`,
`setStatus`, `remove`, `listEligibleLeads`, `appointLead`) returns `Result<T>`
over the F1 `DepartmentListView`, `DepartmentDetailView`,
`DepartmentValidationView` and `DepartmentConflictView`; the F1 validation field
union gained `name`, `code`, `description` and `reason`, which a catalogue form
needs. `AdminService.listDepartments`, `saveDepartment` and `deleteDepartment`,
and the `DepartmentAdminView`/`DepartmentFormInput` types, are **removed**, with a
note in `src/contracts/admin.ts` recording where department administration lives
now; their tests left `workspace.test.ts` with them.

Decisions this phase had to make, each enforced in the service rather than the
screen:

- **"Referenced" means any placement or appointment that ever named the
  department**, not only current members. Every seeded department has an
  appointment, so none of them can be deleted or moved to another division —
  which is the intended outcome: deletion exists only for a department created by
  mistake.
- **An appointment may not start in the past, and one that already starts on or
  after the chosen date is a `lead_period_overlap` conflict.** Appointing closes
  the open period the day before the new one and appends a row; a closed period is
  never touched. A future date leaves the current lead effective and reports who
  takes over when.
- **Deactivation requires a reason and keeps every placement**, reporting how many
  employees remain. New placements are refused by the same
  `validateAssignmentDepartment` the assignment forms use, so the two cannot
  drift.
- **Below the `md` breakpoint the shared table is hidden and its cards carry no
  action menu**, so a card opens the detail panel and every action lives in that
  panel's footer. The probe checks that at all four widths.

Verification: typecheck, eslint, contrast 48/48, the unit suite 899/899, the
production build, a 77/77 browser probe, `/admin/departments` added to and passing
the responsive audit (4/4), the accessibility audit (11/11) and the content-stress
audit (13/13), and Phase 2 role-access flows 17/17 with the new denial. Browser
checks ran against this project's dev server on port 3000.

## Phase F3 — Employee Placement and Department Lead Experience

- [x] `OH-FE-0301` Replace the employee-level department control with a department control on every division assignment form.
- [x] `OH-FE-0302` Load only active departments belonging to the selected assignment division.
- [x] `OH-FE-0303` Clear an incompatible department when the division changes.
- [x] `OH-FE-0304` Show the effective department lead as read-only context rather than an editable employee field.
- [x] `OH-FE-0305` Support an employee holding different departments in multiple active division assignments.
- [x] `OH-FE-0306` Present placement history and department transfers with effective dates.
- [x] `OH-FE-0307` Give appointed department leads Team Lead navigation while an appointment is effective.
- [x] `OH-FE-0308` Scope lead employee lists and dashboard counts to effective department membership.
- [x] `OH-FE-0309` Explain when a user leads multiple departments and provide a department/division scope selector.
- [x] `OH-FE-0310` Preserve separate project manager and project-member experiences.
- [x] `OH-FE-0311` Prevent department scope from revealing unauthorized government-project or protected employee data.
- [x] `OH-FE-0312` Add normal, no-member, future-appointment, expired-appointment, and permission-loss states.
- [x] `OH-FE-0313` Add frontend tests for dependent controls, stale selections, and scoped navigation.
- [~] `OH-FE-0314` Add browser journeys for multi-division placement and department-lead access.

### Phase F3 Exit Criteria

- [x] A single employee can be placed in Technical/PowerInAI and Operations/WesternCF independently.
- [x] Appointing an eligible employee grants only the intended department scope.
- [x] Ending the appointment removes future lead access without changing historical records.
- [~] Frontend quality gates pass. (Typecheck, lint, contrast 48/48, 945/945 frontend tests and the production build pass. The responsive, accessibility and stress gates cannot say anything about these screens yet: the runtime adapters route them to the server, where the HR placement and Team Lead operations are unimplemented, so a browser run would measure the "not available" state — see `docs/frontend/organization-hierarchy/phase-f3-verification.md` §6.)

### Phase F3 Evidence

Full detail is in `docs/frontend/organization-hierarchy/phase-f3-verification.md`.

| Tasks | Evidence |
|---|---|
| `OH-FE-0301`–`OH-FE-0304` | `src/features/hr/employees.tsx` (verified, not assumed, by `placement-form.test.tsx`) |
| `OH-FE-0305`, `OH-FE-0306` | `src/features/hr/placement-history.ts` + `placement-history.test.ts` (5); the employee detail now states every current placement, labels a scheduled one as scheduled rather than ended, and names a transfer with its effective date |
| `OH-FE-0307`, `OH-FE-0312` | `src/features/access/capabilities.ts`, `route-access.ts`, `app-shell-host.tsx`; `department-capabilities.test.ts` (8) |
| `OH-FE-0308`, `OH-FE-0309` | `TeamMemberView.departments` and `TeamLeadScopeView` in the contracts, filled in `src/services/mock/team-lead.ts`; the scope panel and department selector in `src/features/team-lead/team-overview.tsx`; `department-scope.test.tsx` (8) |
| `OH-FE-0310` | `canManageProject` in `src/services/mock/team-lead.ts` |
| `OH-FE-0311` | `src/services/mock/auth.ts` (the session no longer widens a lead's divisions) plus the government case in `department-scope.test.tsx` |
| `OH-FE-0313` | the four test files above |
| `OH-FE-0314` | `scripts/_ohfe03-probe.mjs` — written, exits 2 with a stated precondition |

Defects this phase found, each fixed:

- **A future placement read "Ended."** The detail split assignments by
  "effective today", so a placement starting in December was filed as history.
- **A transfer looked like two unrelated rows.** Moving department inside one
  division is now named, with the date it took effect.
- **The mock session widened a lead's divisions**, while the server deliberately
  does not. A demo that grants more than the database proves the wrong thing.
- **Project mutation was authorized by division alone**, so an appointment-only
  lead could edit projects. Project authority now needs the project's manager or
  a role that carries project management.

`OH-FE-0314` stays `[~]`: both browser journeys are written, but `/employees`
and `/team` answer "not available from the server yet" because the runtime
adapters route them to a server that has no HR placement or Team Lead
operations (Backend Phase 9 `BE-0902`). The probe starts passing the day those
adapters land; until then the same behaviour is covered by the four test files,
which drive the same screens through the mock.

Verification: frontend 945/945, backend 416/416 unchanged, typecheck, eslint,
contrast 48/48 and the production build clean.

## 6. Backend Phases

## Phase B1 — MySQL Schema and Migration

- [x] `OH-BE-0101` Create `departments` with division ownership, normalized name/code, active status, version, and audit metadata.
- [x] `OH-BE-0102` Add unique keys for `(division_id, normalized_name)` and `(division_id, normalized_code)`.
- [x] `OH-BE-0103` Create effective-dated `department_lead_assignments` with lead employee and audit metadata.
- [x] `OH-BE-0104` Add `department_id` to `employee_division_assignments`.
- [x] `OH-BE-0105` Add foreign keys using restrictive deletion behavior.
- [x] `OH-BE-0106` Enforce one effective department placement per employee/division/date through service validation and transaction locking.
- [x] `OH-BE-0107` Enforce non-overlapping lead periods per department through locked transactional validation.
- [x] `OH-BE-0108` Backfill departments from distinct legacy division-and-department combinations.
- [x] `OH-BE-0109` Backfill assignment departments and initial lead periods from legacy records.
- [x] `OH-BE-0110` Produce a migration-review report for null, unmatched, cross-division, and conflicting rows.
- [x] `OH-BE-0111` Keep legacy employee department/lead columns read-only during compatibility deployment.
- [x] `OH-BE-0112` Add representative seed data for all five divisions and multi-division employees.
- [x] `OH-BE-0113` Add repository methods and transaction tests for departments, members, and lead history.
- [x] `OH-BE-0114` Add forward migration, recovery procedure, validation rules, and dry-run evidence.
- [~] `OH-BE-0115` Remove legacy columns only in the later cutover migration after reconciliation approval.

### Phase B1 Exit Criteria

- [x] Empty-database and representative-upgrade migrations pass.
- [x] Every active assignment is either mapped to a valid same-division department or listed for review.
- [x] Migration recovery restores the pre-change schema without silent data loss.

### Phase B1 Evidence

Full detail, including the rehearsal numbers and the decisions behind them, is
in `docs/backend/organization-hierarchy/phase-b1-verification.md`.

| Tasks | Evidence |
|---|---|
| `OH-BE-0101`–`OH-BE-0105` | `drizzle/0013_department_hierarchy.sql` — `departments`, `department_lead_assignments`, `employee_division_assignments.department_id`, restrictive foreign keys |
| `OH-BE-0106`–`OH-BE-0107` | `src/server/organization/departments.ts`, `src/server/organization/department-rules.ts` |
| `OH-BE-0108`–`OH-BE-0110` | the backfill, review and reconciliation sections of 0013; `scripts/db-department-migration-report.mjs` (`npm run db:department-report`) |
| `OH-BE-0111` | the freeze triggers in 0013 plus the legacy-lead preservation in `src/server/organization-work/service.ts` and `src/server/organization/application.ts` |
| `OH-BE-0112` | `scripts/seed-development.sql` — 8 departments across all five divisions, a duplicate name, an inactive department, a multi-division employee, and closed, current and scheduled appointments |
| `OH-BE-0113` | `src/server/organization/department-repository.integration.test.ts` (24), `department-rules.unit.test.ts` (11) |
| `OH-BE-0114` | `drizzle/recovery/0013_department_hierarchy.sql`, the new 0013 rules in `scripts/validate-migrations.mjs`, `src/server/database/department-hierarchy-migration.integration.test.ts` (2) |
| `OH-BE-0115` | **Not done, deliberately.** See below. |

Decisions this phase had to make:

- **Uniqueness is enforced on generated normalized columns**, so no write path
  can defeat in-division uniqueness with casing or padding.
- **Cross-division placement is unrepresentable**, not merely validated: the
  assignment's foreign key references `departments (id, division_id)`.
- **Backfill ids are derived from MD5 of the key that makes the row unique**, so
  a rehearsal and the real run produce identical ids and a recovery drill cannot
  fork the catalogue.
- **The backfill creates the (division, legacy name) combination**, which means
  a multi-division employee's one legacy string produces the name in each of
  their divisions. That is reported as `cross_division_department` for
  confirmation rather than resolved by guessing.
- **An appointment is created only where the legacy data settles the question**:
  one distinct, still-eligible legacy lead. Conflicts and ineligible leads are
  reported and left for a Super Administrator.
- **The legacy columns are frozen by coercing triggers plus services that ignore
  a submitted lead**, because routing still reads `lead_employee_id` until Phase
  B3; a hard refusal would break a compatibility deployment.

`OH-BE-0115` stays `[~]`: removing the legacy columns needs Phase B3 to move
every reader onto department leadership and HR to sign the reconciliation
report. `scripts/validate-migrations.mjs` now fails the build if 0013 starts
dropping `employees.department`, so the sequencing cannot be undone by accident.

Verification: `npm run db:validate` (13 migrations), backend unit 109/109,
integration 167/167 (including the empty-database migration, the representative
upgrade and the two locking races), api and authorization 78/78, frontend
918/918, typecheck, eslint and the production build clean. On the development
database: `db:migrate` applied 0013, `db:seed` produced the eight-department
hierarchy, `db:rollback -- --to 0013` restored the pre-change schema with every
legacy fact intact, and re-applying reproduced identical ids.

## Phase B2 — Services, Authorization, and Audit

- [x] `OH-BE-0201` Implement department repositories and application services behind the approved contracts.
- [x] `OH-BE-0202` Enforce Super Administrator-only department and lead mutations.
- [x] `OH-BE-0203` Validate department/assignment same-division integrity server-side in one transaction.
- [x] `OH-BE-0204` Validate that a lead candidate is active and assigned to the department's division.
- [x] `OH-BE-0205` Resolve current and historical department leads by effective date.
- [x] `OH-BE-0206` Derive department membership from effective employee–division assignments.
- [x] `OH-BE-0207` Grant scoped Team Lead capabilities from effective lead appointments without creating a global role grant.
- [x] `OH-BE-0208` Permit one employee to hold several simultaneous department-lead scopes.
- [x] `OH-BE-0209` Revoke expired lead scope at authorization time and invalidate affected session/permission caches.
- [x] `OH-BE-0210` Apply authorization before hierarchy counts, search, dashboards, reports, and exports.
- [x] `OH-BE-0211` Return not-found-equivalent responses for unauthorized department/member records.
- [x] `OH-BE-0212` Audit department, placement, deactivation, and lead-period mutations with before/after values and reasons.
- [x] `OH-BE-0213` Prevent mutation of history covered by verified payroll/reporting periods where applicable.
- [x] `OH-BE-0214` Add optimistic concurrency and conflict guidance for simultaneous administration changes.
- [x] `OH-BE-0215` Add unit, integration, authorization, audit, and concurrency tests.
- [x] `OH-BE-0216` Expose the implementation through the existing Next.js server boundary without creating a parallel API model.

### Phase B2 Exit Criteria

- [x] Direct requests cannot bypass Super Administrator or department scope rules.
- [x] An appointment grants no access before its start or after its end.
- [x] Authorization decisions are reproducible for a historical date.
- [x] Audit evidence identifies who changed what, when, why, and from/to which values.

### Phase B2 Evidence

Full detail is in `docs/backend/organization-hierarchy/phase-b2-verification.md`.

| Tasks | Evidence |
|---|---|
| `OH-BE-0201`, `OH-BE-0203` | `src/server/organization/department-administration.ts` implementing `DepartmentAdministrationService` over `MysqlDepartmentRepository` |
| `OH-BE-0202`, `OH-BE-0210`, `OH-BE-0211` | `actor`/`administrator`/`gate`/`visibleRow` in the same file; `department-administration.integration.test.ts` |
| `OH-BE-0204`, `OH-BE-0205`, `OH-BE-0206` | `listEligibleLeads`, `detail`, and the repository's effective-date resolution |
| `OH-BE-0207`–`OH-BE-0209` | `src/server/authorization/mysql-context.ts`, `src/server/authorization/policy.ts`, `src/server/authentication/session-user.ts`, `src/services/runtime/department-admin.ts`; `department-scope.authorization.test.ts` |
| `OH-BE-0212` | `AuditWriter` calls for created / updated / activated / deactivated / deleted / lead.appointed, asserted with before and after values |
| `OH-BE-0213` | `verifiedPeriodCovering` and the `PERIOD_LOCKED` conflict |
| `OH-BE-0214` | repository version checks surfaced as a conflict with guidance; the no-lost-update and stale-version tests |
| `OH-BE-0215` | 13 shared-rule unit tests, 6 authorization tests, 6 api tests, 20 integration tests |
| `OH-BE-0216` | `src/app/api/admin/route.ts`, `src/server/admin/http.ts`, `src/services/server/department-admin.ts`, `src/services/runtime/department-admin.ts`, `scripts/_ohbe02-probe.mjs` |

Decisions this phase had to make:

- **The rules a person reads moved to `src/lib/department-hierarchy.ts`**, which
  the mock and the MySQL service both import. Sharing the wording is what makes
  the mock a faithful stand-in instead of a second opinion.
- **A capability refusal stays `permission_denied`; a record answer collapses to
  not-found.** A capability denial is identical for every id so it confirms
  nothing, while a record-level denial would reveal that an id exists.
- **An appointment grants the Team Lead capability set, bounded by department.**
  The policy's employee self-only rule needed a narrow exception, or the
  appointment granted a capability with nothing to use it on.
- **Nothing derived is cached server-side**, so an expired appointment needs no
  revocation step; the client's session snapshot is refreshed through the shared
  invalidation signal after every successful mutation.
- **Only a lead appointment is period-gated**, because it is the one operation
  here that writes dated history.
- **Department administration reuses the `/api/admin` envelope** with namespaced
  methods rather than a second API model.

Verification: backend 397/397 (unit, integration, api, authorization), frontend
918/918 unchanged, a 24/24 browser probe against the seeded database,
`db:validate`, typecheck, eslint and the production build clean. The probe found
two real defects, both fixed: `EXPECTED_DATABASE_MIGRATION` was stale at `0011`
so `/api/health` called a correctly migrated database unhealthy, and a
"no console errors" check was itself wrong because a refused save answers
HTTP 400 by design.

## Phase B3 — Workflow and Reporting Integration

- [x] `OH-BE-0301` Route Team Lead WFH and leave review using the request date and employee's effective department placement.
- [x] `OH-BE-0302` Scope timesheet exception review and correction requests by effective department membership.
- [x] `OH-BE-0303` Scope workload and employee views by department while preserving explicit project authority.
- [x] `OH-BE-0304` Resolve evaluation reviewer defaults from effective department leadership without overwriting explicit authorized reviewers.
- [~] `OH-BE-0305` Update requisition and conveyance routing to use effective department leadership where their shared chain requires a Team Lead.
- [x] `OH-BE-0306` Add department filters to authorized employee, attendance, workload, time, and evaluation reports.
- [x] `OH-BE-0307` Ensure report/export totals and empty groups reveal no unauthorized departments or members.
- [x] `OH-BE-0308` Update notifications and deep links to preserve department scope without disclosing protected records.
- [x] `OH-BE-0309` Update global search indexing and result authorization for departments.
- [~] `OH-BE-0310` Feed current authorized department data into meeting-minute matching without trusting AI-proposed identities.
- [x] `OH-BE-0311` Reconcile dashboard, report, export, and workflow results for the same date and scope.
- [x] `OH-BE-0312` Add effective-date boundary tests for transfers and lead changes.
- [x] `OH-BE-0313` Add multi-department lead tests across two divisions, including restricted Government Projects scope.
- [x] `OH-BE-0314` Document any workflow that intentionally retains explicit reviewer/manager authority instead of department authority.

### Phase B3 Exit Criteria

- [~] Every affected workflow resolves the correct lead for the relevant business date. (Every workflow that exists does; requisition, conveyance and meeting-minute matching have no backend yet — Backend Phases 10, 11 and 13.)
- [x] Project authority and department authority remain distinct and testable.
- [x] Reports and exports reconcile without leaking hidden departments or employees.

### Phase B3 Evidence

Full detail, including the retained-authority record for `OH-BE-0314`, is in
`docs/backend/organization-hierarchy/phase-b3-verification.md`.

| Tasks | Evidence |
|---|---|
| Shared resolver | `src/server/organization/department-authority.ts`, `department-authority.unit.test.ts` (8) |
| `OH-BE-0301`, `OH-BE-0304` | `src/server/hr/repository.ts`, `requests.ts`, `evaluations.ts`, `jobs.ts`; `hr.integration.test.ts` (21, including the appointment-moves-the-decision case) |
| `OH-BE-0302` | `src/server/organization/mysql-task-review.ts`, `task-review-views.ts`, `src/server/task-work/application.ts`, `src/server/time/team-adapter.ts` |
| `OH-BE-0303`, `OH-BE-0306`, `OH-BE-0307` | `src/server/reporting/application.ts`, `filters.ts`, `query.ts`, `src/contracts/reporting.ts`, `src/features/reports/report-builder.tsx`, `src/services/mock/reporting.ts`, `src/server/employee/application.ts`; `reporting.integration.test.ts` (21), `department-filter.test.tsx` (2) |
| `OH-BE-0308` | `src/server/notifications/service.ts` |
| `OH-BE-0309` | `src/server/workspace/application.ts` |
| `OH-BE-0311`–`OH-BE-0313` | `src/server/organization/department-workflow.integration.test.ts` (9) |
| `OH-BE-0314` | §4 of the verification document |
| `OH-BE-0305` (partial) | `src/services/mock/approval-chain.ts` — the shared `teamLeadOf` resolver now reads department leadership, so the demo routes requisition, conveyance and task review as the server does |

Decisions this phase had to make:

- **Precedence is per assignment**: a placed assignment resolves to its
  department appointment, an unplaced one keeps its frozen legacy lead. Losing
  routing for the rows Phase B1 could not map would have been the defect.
- **WFH and leave keep a single reviewer** — the primary placement's lead —
  rather than widening approval to every department an employee works in.
- **`reachesEmployee` is one shared test.** The division-only variants silently
  excluded every department lead, because an appointment never widens
  `divisionIds`; reports, notifications and search all used such a variant.
- **Report filter options are narrowed to the viewer's own departments.** A
  visible multi-division employee would otherwise name a department the viewer
  has no authority over.
- **A reviewer who no longer leads an employee gets the not-found answer**, not a
  denial, so a refusal cannot confirm that a request exists.

Verification: backend 416/416, frontend 918/918, typecheck, eslint,
`db:validate` and the production build clean. The browser probe
(`scripts/_ohbe03-probe.mjs`) exits 2 with a stated precondition: `/api/reporting`
answers 503 in this environment because no private export bucket is configured,
a Backend Phase 6 deployment requirement unrelated to this phase.

## 7. Phase V1 — Cutover and Quality Gates

- [ ] `OH-V-0101` Freeze hierarchy mutations during the final migration window.
- [ ] `OH-V-0102` Run migration dry-run and reconcile employee/division/department/lead counts.
- [ ] `OH-V-0103` Resolve every migration-review row or record an approved exception.
- [ ] `OH-V-0104` Switch frontend hierarchy services from mock to MySQL adapters.
- [ ] `OH-V-0105` Remove obsolete mock-only and legacy employee department/lead paths.
- [ ] `OH-V-0106` Run type-check, lint, migration validation, frontend tests, backend tests, and production build.
- [ ] `OH-V-0107` Run role, authorization, responsive, accessibility, stress, and journey browser gates.
- [ ] `OH-V-0108` Verify appointment start/end boundaries and session-cache invalidation.
- [ ] `OH-V-0109` Verify protected Government Projects membership, counts, search, and exports.
- [ ] `OH-V-0110` Verify audit events and historical lead resolution against a production-like dataset.
- [ ] `OH-V-0111` Verify deactivated departments remain readable in history and unavailable for new placement.
- [ ] `OH-V-0112` Obtain HR and Super Administrator review of migrated placement and lead mappings.
- [ ] `OH-V-0113` Record rollback criteria, monitoring queries, ownership, and support procedure.
- [ ] `OH-V-0114` Update milestone evidence and mark completion only after every gate passes.

### Phase V1 Exit Criteria

- [ ] No runtime screen or service depends on the legacy global employee department/lead fields.
- [ ] Migrated and new hierarchy records reconcile.
- [ ] Security, accessibility, responsive, migration, and regression evidence is recorded.
- [ ] Stakeholders approve the authoritative department catalogue and lead mapping.

## 8. Principal Acceptance Scenarios

| ID | Scenario | Expected result |
|---|---|---|
| `OH-AC-001` | PowerInAI and WesternCF both create Sales | Both save because uniqueness is division-scoped. |
| `OH-AC-002` | An assignment submits a department from another division | The service rejects it with field-level corrective guidance. |
| `OH-AC-003` | One employee works in PowerInAI/Technical and WesternCF/Operations | Both effective placements coexist independently. |
| `OH-AC-004` | An employee is appointed to lead two departments | Both scopes are granted while each appointment is effective. |
| `OH-AC-005` | A lead appointment begins tomorrow | No lead access exists today; access appears on the effective date. |
| `OH-AC-006` | A lead appointment ends | Future access is removed, while historical decisions retain the responsible lead. |
| `OH-AC-007` | A non-administrator calls a department mutation directly | The operation is denied without revealing unauthorized records. |
| `OH-AC-008` | A referenced department is deleted or moved | The operation is blocked and explains how to resolve references. |
| `OH-AC-009` | An active department is deactivated | Existing history remains readable; new placements are blocked. |
| `OH-AC-010` | A department lead lacks a global Team Lead role | Department-scoped lead capabilities still work; no unrelated scope is granted. |
| `OH-AC-011` | An employee transfers departments mid-month | Records before and after the effective date resolve to the correct department and lead. |
| `OH-AC-012` | A lead has Government Projects and ordinary scopes | Government records remain denied unless the required restricted-data permission is also present. |

## 9. Dependencies and Risks

- The business must provide the authoritative department catalogue and initial effective Team Lead mapping for all five divisions.
- Every existing employee–division assignment needs an approved department mapping before cutover.
- Department-scoped lead authority does not override government-project, evaluation, salary, cost, attachment, export, or audit permissions.
- MySQL cannot express every non-overlapping effective-date invariant with a simple partial unique key; application transactions and locking are mandatory.
- Session or permission caches must expire or invalidate when appointments start, end, or change.
- The preliminary mock implementation currently models only a primary employee department and is not completion evidence for this milestone.

## 10. Definition of Done

- Contracts, mock adapters, persistent adapters, UI, authorization, workflows, reports, and documentation implement the same hierarchy.
- Normal, loading, empty, validation, conflict, denied, error, and success states are covered.
- Every mutation is authorized, validated, transactional where necessary, and audited.
- Historical department placement and lead responsibility remain reproducible.
- All relevant automated and browser quality gates pass without weakened thresholds or exclusions.
- Migration and recovery evidence exists for empty and representative existing databases.

## 11. Current Progress Summary

| Phase | Status | Completed / total | Next task |
|---:|---|---:|---|
| 0 — Product rules and architecture | Done | 10 / 10 | `OH-FE-0101` |
| F1 — Frontend contracts and mock model | Done | 12 / 12 | `OH-FE-0201` |
| F2 — Department administration | Done | 11 / 11 | `OH-FE-0301` |
| F3 — Employee placement and lead experience | Done | 13 / 14 | `OH-V-0101` (`OH-FE-0314` waits for Backend Phase 9 adapters) |
| B1 — MySQL schema and migration | Done | 14 / 15 | `OH-BE-0201` (`OH-BE-0115` awaits Phase B3 and HR reconciliation sign-off) |
| B2 — Services, authorization, and audit | Done | 16 / 16 | `OH-BE-0301` |
| B3 — Workflow and reporting integration | Done | 12 / 14 | `OH-FE-0301` (`OH-BE-0305` and `OH-BE-0310` wait for Backend Phases 10, 11 and 13) |
| V1 — Cutover and quality gates | Pending | 0 / 14 | `OH-V-0101` |

Overall implementation progress: **88 / 106 tasks complete**. Phase F1 established the typed hierarchy and effective-dated mock authorization model, Phase F2 delivered department administration on a typed service that replaces the preliminary prototype, Phase B1 put the same model in MySQL with a reviewable backfill and a rehearsed recovery, Phase B2 connected the screen to MySQL with authorization, scoped lead capability, audit evidence and concurrency control, Phase B3 moved every existing workflow, report, notification and search result onto one effective-dated authority resolver, and Phase F3 made placement per assignment and department leadership a capability a person can see, scope and lose; Phase V1 is next.
