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
| Current status | Phase F1 complete; Phase F2 is next |

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

- [ ] `OH-FE-0201` Build the Super Administrator department catalogue grouped and filterable by division.
- [ ] `OH-FE-0202` Show department code, status, current lead, effective date, and active employee count.
- [ ] `OH-FE-0203` Build create/edit forms with division-dependent validation and in-division uniqueness guidance.
- [ ] `OH-FE-0204` Build an eligible-lead picker limited to active employees assigned to the department's division.
- [ ] `OH-FE-0205` Build effective-now and scheduled-future lead appointment flows.
- [ ] `OH-FE-0206` Show leadership history without allowing historical rows to be overwritten.
- [ ] `OH-FE-0207` Support department deactivation and block new placements into inactive departments.
- [ ] `OH-FE-0208` Block destructive deletion or division movement for referenced departments with corrective guidance.
- [ ] `OH-FE-0209` Cover loading, empty, validation, conflict, denied, error, and success states.
- [ ] `OH-FE-0210` Verify dialogs, forms, tables/cards, and destructive actions with keyboard and screen readers.
- [ ] `OH-FE-0211` Add `/admin/departments` to responsive, accessibility, stress, and role-access audits.

### Phase F2 Exit Criteria

- [ ] Only Super Administrators see and can use mutation controls.
- [ ] The same department name may exist in two divisions without ambiguity.
- [ ] Lead changes show their effective date and retained history.
- [ ] The screen works at 375, 768, 1024, and 1440 px without page-level overflow.

## Phase F3 — Employee Placement and Department Lead Experience

- [ ] `OH-FE-0301` Replace the employee-level department control with a department control on every division assignment form.
- [ ] `OH-FE-0302` Load only active departments belonging to the selected assignment division.
- [ ] `OH-FE-0303` Clear an incompatible department when the division changes.
- [ ] `OH-FE-0304` Show the effective department lead as read-only context rather than an editable employee field.
- [ ] `OH-FE-0305` Support an employee holding different departments in multiple active division assignments.
- [ ] `OH-FE-0306` Present placement history and department transfers with effective dates.
- [ ] `OH-FE-0307` Give appointed department leads Team Lead navigation while an appointment is effective.
- [ ] `OH-FE-0308` Scope lead employee lists and dashboard counts to effective department membership.
- [ ] `OH-FE-0309` Explain when a user leads multiple departments and provide a department/division scope selector.
- [ ] `OH-FE-0310` Preserve separate project manager and project-member experiences.
- [ ] `OH-FE-0311` Prevent department scope from revealing unauthorized government-project or protected employee data.
- [ ] `OH-FE-0312` Add normal, no-member, future-appointment, expired-appointment, and permission-loss states.
- [ ] `OH-FE-0313` Add frontend tests for dependent controls, stale selections, and scoped navigation.
- [ ] `OH-FE-0314` Add browser journeys for multi-division placement and department-lead access.

### Phase F3 Exit Criteria

- [ ] A single employee can be placed in Technical/PowerInAI and Operations/WesternCF independently.
- [ ] Appointing an eligible employee grants only the intended department scope.
- [ ] Ending the appointment removes future lead access without changing historical records.
- [ ] Frontend quality gates pass.

## 6. Backend Phases

## Phase B1 — MySQL Schema and Migration

- [ ] `OH-BE-0101` Create `departments` with division ownership, normalized name/code, active status, version, and audit metadata.
- [ ] `OH-BE-0102` Add unique keys for `(division_id, normalized_name)` and `(division_id, normalized_code)`.
- [ ] `OH-BE-0103` Create effective-dated `department_lead_assignments` with lead employee and audit metadata.
- [ ] `OH-BE-0104` Add `department_id` to `employee_division_assignments`.
- [ ] `OH-BE-0105` Add foreign keys using restrictive deletion behavior.
- [ ] `OH-BE-0106` Enforce one effective department placement per employee/division/date through service validation and transaction locking.
- [ ] `OH-BE-0107` Enforce non-overlapping lead periods per department through locked transactional validation.
- [ ] `OH-BE-0108` Backfill departments from distinct legacy division-and-department combinations.
- [ ] `OH-BE-0109` Backfill assignment departments and initial lead periods from legacy records.
- [ ] `OH-BE-0110` Produce a migration-review report for null, unmatched, cross-division, and conflicting rows.
- [ ] `OH-BE-0111` Keep legacy employee department/lead columns read-only during compatibility deployment.
- [ ] `OH-BE-0112` Add representative seed data for all five divisions and multi-division employees.
- [ ] `OH-BE-0113` Add repository methods and transaction tests for departments, members, and lead history.
- [ ] `OH-BE-0114` Add forward migration, recovery procedure, validation rules, and dry-run evidence.
- [ ] `OH-BE-0115` Remove legacy columns only in the later cutover migration after reconciliation approval.

### Phase B1 Exit Criteria

- [ ] Empty-database and representative-upgrade migrations pass.
- [ ] Every active assignment is either mapped to a valid same-division department or listed for review.
- [ ] Migration recovery restores the pre-change schema without silent data loss.

## Phase B2 — Services, Authorization, and Audit

- [ ] `OH-BE-0201` Implement department repositories and application services behind the approved contracts.
- [ ] `OH-BE-0202` Enforce Super Administrator-only department and lead mutations.
- [ ] `OH-BE-0203` Validate department/assignment same-division integrity server-side in one transaction.
- [ ] `OH-BE-0204` Validate that a lead candidate is active and assigned to the department's division.
- [ ] `OH-BE-0205` Resolve current and historical department leads by effective date.
- [ ] `OH-BE-0206` Derive department membership from effective employee–division assignments.
- [ ] `OH-BE-0207` Grant scoped Team Lead capabilities from effective lead appointments without creating a global role grant.
- [ ] `OH-BE-0208` Permit one employee to hold several simultaneous department-lead scopes.
- [ ] `OH-BE-0209` Revoke expired lead scope at authorization time and invalidate affected session/permission caches.
- [ ] `OH-BE-0210` Apply authorization before hierarchy counts, search, dashboards, reports, and exports.
- [ ] `OH-BE-0211` Return not-found-equivalent responses for unauthorized department/member records.
- [ ] `OH-BE-0212` Audit department, placement, deactivation, and lead-period mutations with before/after values and reasons.
- [ ] `OH-BE-0213` Prevent mutation of history covered by verified payroll/reporting periods where applicable.
- [ ] `OH-BE-0214` Add optimistic concurrency and conflict guidance for simultaneous administration changes.
- [ ] `OH-BE-0215` Add unit, integration, authorization, audit, and concurrency tests.
- [ ] `OH-BE-0216` Expose the implementation through the existing Next.js server boundary without creating a parallel API model.

### Phase B2 Exit Criteria

- [ ] Direct requests cannot bypass Super Administrator or department scope rules.
- [ ] An appointment grants no access before its start or after its end.
- [ ] Authorization decisions are reproducible for a historical date.
- [ ] Audit evidence identifies who changed what, when, why, and from/to which values.

## Phase B3 — Workflow and Reporting Integration

- [ ] `OH-BE-0301` Route Team Lead WFH and leave review using the request date and employee's effective department placement.
- [ ] `OH-BE-0302` Scope timesheet exception review and correction requests by effective department membership.
- [ ] `OH-BE-0303` Scope workload and employee views by department while preserving explicit project authority.
- [ ] `OH-BE-0304` Resolve evaluation reviewer defaults from effective department leadership without overwriting explicit authorized reviewers.
- [ ] `OH-BE-0305` Update requisition and conveyance routing to use effective department leadership where their shared chain requires a Team Lead.
- [ ] `OH-BE-0306` Add department filters to authorized employee, attendance, workload, time, and evaluation reports.
- [ ] `OH-BE-0307` Ensure report/export totals and empty groups reveal no unauthorized departments or members.
- [ ] `OH-BE-0308` Update notifications and deep links to preserve department scope without disclosing protected records.
- [ ] `OH-BE-0309` Update global search indexing and result authorization for departments.
- [ ] `OH-BE-0310` Feed current authorized department data into meeting-minute matching without trusting AI-proposed identities.
- [ ] `OH-BE-0311` Reconcile dashboard, report, export, and workflow results for the same date and scope.
- [ ] `OH-BE-0312` Add effective-date boundary tests for transfers and lead changes.
- [ ] `OH-BE-0313` Add multi-department lead tests across two divisions, including restricted Government Projects scope.
- [ ] `OH-BE-0314` Document any workflow that intentionally retains explicit reviewer/manager authority instead of department authority.

### Phase B3 Exit Criteria

- [ ] Every affected workflow resolves the correct lead for the relevant business date.
- [ ] Project authority and department authority remain distinct and testable.
- [ ] Reports and exports reconcile without leaking hidden departments or employees.

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
| F2 — Department administration | Pending | 0 / 11 | `OH-FE-0201` |
| F3 — Employee placement and lead experience | Pending | 0 / 14 | Blocked by F2 |
| B1 — MySQL schema and migration | Pending | 0 / 15 | Starts after F1 contracts stabilize |
| B2 — Services, authorization, and audit | Pending | 0 / 16 | Blocked by B1 |
| B3 — Workflow and reporting integration | Pending | 0 / 14 | Blocked by B2 |
| V1 — Cutover and quality gates | Pending | 0 / 14 | Blocked by F2, F3, B3 |

Overall implementation progress: **22 / 106 tasks complete**. Phase F1 established the typed hierarchy and effective-dated mock authorization model; Phase F2 is next.
