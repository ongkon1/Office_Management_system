# Organization Hierarchy — Phase B3 Verification

Every workflow, report, notification and search result that depended on
"who is this employee's Team Lead" now asks the department hierarchy, on the
business date that matters.

| Field | Value |
|---|---|
| Milestone | `organization_hierarchy_milestone.md` Phase B3 |
| Tasks | `OH-BE-0301` – `OH-BE-0314` |
| Shared resolver | `src/server/organization/department-authority.ts` |
| Status | 12 of 14 complete; `OH-BE-0305` and `OH-BE-0310` blocked on backends that do not exist yet (§5) |

---

## 1. One resolver, six former copies

`employee_division_assignments.lead_employee_id` was read directly in HR
requests, evaluations, HR jobs, notifications, task review, task work, reports
and the employee's own division view. Each read was a separate copy of "find
the Team Lead", and a disagreement between them is a record reaching a reviewer
it should not have.

All of them now resolve through `department-authority.ts`:

| Function | Answers |
|---|---|
| `authorityForEmployee` | every effective assignment with the authority applying on a date |
| `leadsOfEmployee` | who may act as this employee's lead on a date |
| `primaryLeadOfEmployee` | the one reviewer for a request — the **primary** placement's lead |
| `employeesLedBy` | everyone a lead reaches on a date |
| `departmentsOfEmployee` | the placements themselves |
| `reachesEmployee` | the pure reach test every surface shares |

**Precedence is per assignment.** An assignment placed in a department whose
appointment is effective on the date resolves to that appointment's lead. An
assignment the Phase B1 backfill could not place keeps its frozen legacy lead,
so nobody loses routing during the compatibility deployment; those rows are
exactly the ones `department_migration_review` lists. An **inactive** department
grants nothing, matching the authorization context.

## 2. What each task changed

| Task | Change |
|---|---|
| `OH-BE-0301` | `HrRepository.assignments` resolves `effective_lead_employee_id` in one query; WFH and leave decisions and read access use it, resolved on the **request date** — so a transfer or a lead change after submission still routes to whoever led the primary placement on the day requested |
| `OH-BE-0302` | Task review (`mysql-task-review`, `task-review-views`), task work authority and notification recipients, and the team timesheet list, which now intersects a requested employee id with the actor's reach instead of trusting it |
| `OH-BE-0303` | `ReportApplication.employeeVisible` accepts department reach; the employee's own division view shows the effective department lead as read-only context |
| `OH-BE-0304` | The evaluation reviewer default must be the lead effective on the period end date; HR's explicit override path is untouched (§4) |
| `OH-BE-0306` | A `department` filter kind, `departmentIds` in the query contract, authorized options on the server's single filter list, and the same filter in the mock catalogue for timesheet, attendance, WFH, headcount, evaluation and workload reports |
| `OH-BE-0307` | Scope is applied before counting; an out-of-scope employee or department yields zero rows rather than a refusal, and the **filter options themselves** are narrowed to departments the viewer holds — a visible multi-division employee would otherwise name a department the viewer has no authority over |
| `OH-BE-0308` | Notification candidates come from the resolver, and each candidate is authorized with `reachesEmployee`; the previous division-only test silently excluded every department lead, because an appointment never widens `divisionIds` |
| `OH-BE-0309` | Search results: a department-scoped row needs an effective appointment, an employee-scoped row uses the shared reach test (a Team Lead used to find only themselves), and a division reached through an appointment passes while the department check bounds it |
| `OH-BE-0311` | A reconciliation test proving the resolver, the authorization context and the department detail agree for one date and scope, and that the stored placement count matches |
| `OH-BE-0312` | Boundary tests: a transfer on its first effective day, a lead change on the day before and the day of, an appointment that has not started or has ended, a deactivated department, and an unplaced assignment still routing on its legacy lead |
| `OH-BE-0313` | One employee leading departments in two divisions, including a restricted Government Projects department, with the government permission proven to remain a separate and unconditional check |
| `OH-BE-0314` | §4 below |

## 3. Evidence

| Check | Result |
|---|---|
| `department-authority.unit.test.ts` | 8 passed — precedence and reach without a database |
| `department-workflow.integration.test.ts` | 9 passed — boundaries, multi-division leadership, government restriction, reconciliation |
| `hr.integration.test.ts` | 21 passed, including a new case where appointing a different lead moves both the WFH decision and the evaluation reviewer **while the frozen legacy column still names the old lead** — if the workflow still read that column the test would pass for the wrong reason |
| `reporting.integration.test.ts` | 21 passed, including a department lead reporting on their own team, the department filter narrowing, an out-of-scope employee and department returning zero, and the option lists disclosing only their own scope |
| `department-filter.test.tsx` | 2 passed — the filter is offered on screen, its options name their division, and choosing one narrows the report |
| Backend suites | 416/416 across unit, integration, api and authorization |
| Frontend suite | 918/918, including the mock approval chain now resolving leadership the same way |
| `typecheck`, `eslint`, `next build`, `db:validate` | clean (one pre-existing `session-provider.tsx` warning) |

`scripts/_ohbe03-probe.mjs` exists for the browser check and **exits 2 with a
stated precondition** in this environment: the server's reporting composition
builds protected export storage eagerly, so every `/api/reporting` request
answers 503 until a private export bucket is configured. That is a Backend
Phase 6 deployment requirement and unrelated to B3 — `/api/time` and
`/api/admin` work in the same session — but it does mean the report UI cannot be
exercised in a browser here, which is why the filter is covered by the
integration and component tests above rather than claimed from a probe.

## 4. Workflows that intentionally keep explicit authority (`OH-BE-0314`)

Department leadership is the **default**, not a replacement for authority
somebody deliberately assigned. These keep their own:

- **Project manager and project membership.** `projects.manager_employee_id` and
  `project_members` decide project authority. A department lead gains nothing
  over a project, and a project manager keeps their authority over work in
  divisions and departments they do not lead. The two are checked separately in
  `validateProject` and `validateTaskScope`.
- **An explicitly assigned evaluation reviewer.** The *default* reviewer must be
  the lead effective on the period end date, which is what `OH-BE-0304`
  enforces. Once HR assigns an evaluation, the stored
  `evaluations.reviewer_employee_id` stands: a later appointment does not move a
  review already in progress, and HR's documented override path is untouched.
- **HR override on requests.** `request.override` lets HR decide or re-decide a
  WFH or leave request with a reason, regardless of leadership. The reason is
  required, which is what makes the override auditable rather than silent.
- **Period verification.** HR verifies and locks payroll periods
  (`time.period.verify`); no department appointment grants it, and leadership
  inside a verified period cannot change (`OH-BE-0213`).
- **Task assignee and creator.** An employee keeps self-service over their own
  tasks and time regardless of who leads their department, and a Team Lead's
  self-created task stays theirs — Team Lead capability is additive, never a
  substitute for the assignee's own authority.
- **Super Administrator and HR scope.** Both reach every division by role, so
  neither depends on an appointment; department administration itself stays
  Super Administrator only (`OH-BE-0202`).

## 5. What Phase B3 cannot finish yet

- **`OH-BE-0305` (requisition and conveyance routing)** stays `[~]`. There is no
  server-side requisition or conveyance module: they are Backend Phases 10 and
  11. What *was* done is the half that exists today — the mock's shared
  `teamLeadOf` resolver, which requisition, conveyance and employee-raised task
  review all call, now resolves the primary placement's department appointment
  with the legacy field as fallback, so the demo routes exactly as the server
  does. When Phases 10 and 11 build the server chain, they call
  `primaryLeadOfEmployee` and this task closes.
- **`OH-BE-0310` (meeting-minute matching)** stays `[~]`. The Meeting Minutes
  backend is Phase 13 and does not exist; matching today runs entirely in the
  mock, where a proposed assignee is already matched against records the creator
  may see rather than trusted from the model. The department data to feed it is
  ready (`departmentsOfEmployee`, `employeesLedBy`).

Both are listed rather than quietly marked done, and the first exit criterion
stays `[~]` for the same reason: every workflow that exists resolves the correct
lead for the business date, and two workflows do not exist yet.
