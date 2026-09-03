# Phase 5 — HR Experience Verification

Phase 5 replaces the HR placeholders with company-wide, mock-backed workflows. UI modules consume `HrService` (`src/contracts/hr.ts`); only `src/services/mock/hr.ts` imports fixtures or mutable mock storage.

HR's boundary is not scope — HR sees every division — but **sensitivity**. Period verification, period amendment, HR override and private evaluation content are separately granted permissions, and all four are enforced in the service rather than by hiding a control.

## Deliverable Map

| Tasks | Routes / implementation | Evidence |
|---|---|---|
| `FE-0501` | `/hr`, `hr-dashboard.tsx` | Active headcount, division count and headcount, attendance states, timesheet exceptions, monthly hours, evaluation periods, WFH trend, workload concerns, incomplete profiles, recent assignment changes, pending verification |
| `FE-0502` | `/employees`, `employees.tsx` | Directory with status, division, Team Lead, employment-type, work-mode and incomplete-profile filters; responsive table and mobile cards |
| `FE-0503` | `/employees/new`, `/employees/[id]/edit` | Identity, employment, contact, office, schedule, work mode, skills and status; field-level validation with guidance and a duplicate-code conflict state |
| `FE-0504` | `/employees/[id]` | Eleven tabs: overview, assignments, projects, time, attendance, WFH, leave, evaluations, remarks, documents, record history |
| `FE-0505` | Employee detail, assignments tab | Primary division, Team Lead, allocation, expected weekly hours, effective dates, active state and the over-100% concurrent-allocation warning |
| `FE-0506` | Employee detail, assignments tab | Temporary assignment creation with a required end date, plus the historical assignment timeline |
| `FE-0510` | `/attendance` | Calendar and list views distinguishing office, WFH, travel, field, training, leave, half-day leave, absence, holiday, weekly off and missing timesheet |
| `FE-0511` | `/wfh` | Scoped filters, employee history, division summary, decisions, completed-work preview and the audited override flow |
| `FE-0512` | `/leave` | Balances, request review, half-day display, conflict state and the audited override flow |
| `FE-0513` | `/admin/holidays` | Company, division-specific and weekly holiday management with activation |
| `FE-0514` | `/attendance`, `hr.test.ts` | Approved leave and holidays are explained non-working days; half-day leave reduces the visible requirement to 3:30 |
| `FE-0520` | `/hr/timesheets` | Completeness, exceptions, unresolved corrections and per-employee drill-down |
| `FE-0521` | Verify dialog | Included dates, policy version, exception count, employee count and explicit lock consequences |
| `FE-0522` | `/hr/timesheets` | Verified, locked, unlock-request, amendment and amendment-history states |
| `FE-0523` | `/evaluations` | Period creation for monthly, quarterly, half-yearly, annual, project-based and probation types |
| `FE-0524` | `/evaluations` | Reviewer/employee assignment, per-state progress, overdue flags, reminders and publication states |
| `FE-0525` | `/evaluations/[id]` | Automatic facts, self-evaluation, Team Lead scoring, default 30/25/15/10/10/10 weighting, comments, final result and publication history |

## Domain Rules Held

- **No daily approval.** The HR workspace has no approve or reject control on a time record; the flow gate asserts its absence. Verification is framed on screen as a payroll action on the whole period.
- **Verification is one fact, not a copy.** `verifyPeriod` writes the period status into the mock store, and `mockStore.isDateLocked` is what the calculation path reads. A unit test asserts that verifying September makes `summaryFor('emp-1001', '2026-09-02').isLocked` true — the lock is not re-derived anywhere.
- **Assignments drive access.** Assignments moved into the mock store for the same reason: adding one immediately widens which divisions accept time, and ending one immediately narrows it.
- **Explained days are not failures.** Leave, half-day leave, holiday and weekly off carry an exemption note and a non-negative tone. Only a genuinely missing timesheet reads as a problem.
- **An override is visible.** Replacing an existing Team Lead decision requires `hr.request.override` *and* a reason; both, plus the previous outcome, stay on the request.
- **Restricted is not empty.** `selfEvaluationState` separates `restricted` from `not_submitted`, so an unauthorized read can never be presented as an absent one. A restricted document keeps its title and renders the restricted marker.
- **Unauthorized reads as nonexistent.** `getEmployee` returns `not_found` — never `permission_denied` — for a record outside the viewer's reach, so a denial cannot confirm the record exists.

## Defects Found and Fixed During the Phase

| Defect | How it surfaced | Fix |
|---|---|---|
| Native `required` pre-empted service validation on the employee form, replacing the guidance-carrying field errors `REQ-TIME-025` requires with a browser tooltip | `audit:flows5` FE-0503 | Added `noValidate`, matching the Phase 2 auth forms |
| No leave request in the dataset conflicted with an approved one, so the conflict state was unreachable | `audit:flows5` FE-0512 | Added `lv-5`, a pending request overlapping the approved `lv-1` |
| `Button` had no link variant, so navigation actions were being written as buttons that route | Writing the HR dashboard | Added `LinkButton` sharing `BASE_CLASSES` with `Button`, so a link keeps the 44 px hit area |

## Automated Evidence

| Gate | Result |
|---|---:|
| `npm run audit:flows5` | 51/51 HR checks pass |
| `npm run audit:responsive` | 156/156 route × width combinations pass |
| Rendered contrast | 10,353 elements checked; 297 documented skips |
| `npm run audit:flows` | 16/16 authentication and access checks pass |
| `npm run audit:flows3` | 18/18 employee and calculation checks pass |
| `npm run audit:flows4` | 20/20 Team Lead checks pass |
| `npm run audit:contrast` | 48/48 token pairings pass |
| `npm run test` | 126/126 tests pass (21 new in `hr.test.ts`) |
| `npm run verify` | Type check, lint, contrast, tests and a 37-route production build pass |

The responsive gate now covers eleven HR routes at 375, 768, 1024 and 1440 px. The rendered-contrast check still measures only fully opaque backgrounds; the skipped elements are translucent shell surfaces, documented in `docs/frontend/phase-1/contrast-audit.md` section 5.
