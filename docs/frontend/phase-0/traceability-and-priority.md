# Frontend Screen Traceability and Priority

Covers `FE-0005` (screen-to-requirement traceability) and `FE-0006` (delivery-priority labelling).

| Source | Reference |
|---|---|
| Requirements | `project_requirement.md` |
| Route map | `frontend_milestone.md` Section 3 |
| Priority source | `project_requirement.md` Sections 2.2, 2.3, 10 |

## 1. Priority Labels

| Label | Meaning | Frontend build rule |
|---|---|---|
| `MVP` | Required by `project_requirement.md` Section 2.2 and the Section 10.1 MVP exit checklist. | Must be fully built, demonstrable, and responsive in the frontend milestone. |
| `P2` | Phase 2 (HR and evaluation) per Section 2.3. | Built in the frontend milestone where the milestone plan schedules it, but never a blocker for the MVP demo. |
| `P3` | Phase 3 (collaboration) per Section 2.3. | Prototype or feature-flagged placeholder only. Excluded from MVP navigation when its flag is off. |
| `P4` | Phase 4 (advanced/AI) per Section 2.3. | Not built in this milestone. Roadmap visibility only. |

Rule for `FE-0006`: a `P2`, `P3`, or `P4` screen must never appear in an MVP demo path, must never be a required step in an MVP flow, and must be removable through the feature-flag map (`contracts/feature-flags.ts`) without breaking navigation, routing, or layout.

## 2. Access Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Login | `/login` | All | MVP | `REQ-NFR-SEC-002`, `REQ-NFR-UX-003` |
| Forgot password | `/forgot-password` | All | MVP | `REQ-NFR-SEC-002` |
| Reset password | `/reset-password` | All | MVP | `REQ-NFR-SEC-002` |
| Two-factor verification | `/two-factor` | All | MVP | `REQ-NFR-SEC-002` |
| Locked / inactive / expired-session / denied states | shared route states | All | MVP | `REQ-NFR-SEC-001`, `REQ-NFR-SEC-002`, `AC-AUTH-001` |

## 3. Shared Application Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Role dashboard router | `/dashboard` | All | MVP | `REQ-DASH-008`, `REQ-DASH-009`, `REQ-NAV-005` |
| Notification centre | `/notifications` | All | P2 | `REQ-NOT-001`–`REQ-NOT-005` |
| Global search | `/search` | All | P3 | `REQ-SRCH-001`–`REQ-SRCH-003` |
| Profile | `/profile` | All | MVP | `REQ-ORG-002`, `REQ-ORG-003`, `REQ-RBAC-010` |
| Settings (personal preferences) | `/settings` | All | MVP | `REQ-NFR-UX-003`, `REQ-NFR-UX-004` |
| Settings (notification and feature toggles) | `/settings` sections | Admin/HR | P2 | `REQ-NOT-005`, `REQ-NFR-OPS-001` |

## 4. Employee Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Employee dashboard | `/dashboard` | Employee | MVP | `REQ-DASH-001`, `REQ-DASH-002`, `REQ-DASH-003`, `REQ-DASH-008` |
| Timesheet views (daily/weekly/monthly/calendar/list) | `/timesheets` | Employee | MVP | `REQ-TIME-001`, `REQ-TIME-012`, `REQ-TIME-016`, `REQ-TIME-017` |
| Day detail and time entry | `/timesheets/[date]` | Employee | MVP | `REQ-TIME-004`–`REQ-TIME-011`, `REQ-TIME-013`–`REQ-TIME-026`, `REQ-TIME-028` |
| Timer operation | shell + `/timesheets/[date]` | Employee | MVP | `REQ-TIME-006`, `REQ-TIME-008`, `REQ-TIME-009`, `REQ-NFR-PERF-004` |
| My tasks | `/tasks` | Employee | MVP | `REQ-WORK-003`, `REQ-WORK-004`, `REQ-WORK-006` |
| Task detail | `/tasks/[id]` | Employee | MVP | `REQ-WORK-005`–`REQ-WORK-008` |
| My divisions | `/divisions` | Employee | MVP | `REQ-ORG-003`, `REQ-ORG-005`, `REQ-ORG-006`, `REQ-ORG-009` |
| My remarks and corrections | `/timesheets` + remark views | Employee | MVP | `REQ-RMK-001`, `REQ-RMK-004`, `REQ-RMK-005`, `REQ-RMK-006` |
| WFH requests | `/wfh` | Employee | P2 | `REQ-WFH-001`, `REQ-WFH-002`, `REQ-WFH-005`, `REQ-WFH-006` |
| Leave requests and balances | `/leave` | Employee | P2 | `REQ-ATT-001`, `REQ-ATT-005` |
| My evaluations | `/evaluations` | Employee | P2 | `REQ-EVAL-005`, `REQ-EVAL-009` |

Note: WFH as a **work location** on a time entry is MVP (`REQ-TIME-010`, `project_requirement.md` Section 2.2). The WFH **request and decision workflow** is P2.

## 5. Team Lead Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Team Lead dashboard | `/dashboard` | Team Lead | MVP | `REQ-DASH-004`, `REQ-DASH-005`, `REQ-DASH-008` |
| Team overview | `/team` | Team Lead | MVP | `REQ-RBAC-006`, `REQ-DASH-004` |
| Team timesheets and exceptions | `/team/timesheets` | Team Lead | MVP | `REQ-TIME-002`, `REQ-TIME-003`, `REQ-RMK-007` |
| Remark composer and correction request | `/team/timesheets` detail | Team Lead | MVP | `REQ-RMK-001`–`REQ-RMK-006`, `REQ-TIME-026` |
| Projects list | `/projects` | Team Lead | MVP | `REQ-WORK-001`, `REQ-WORK-002` |
| Project detail | `/projects/[id]` | Team Lead | MVP | `REQ-WORK-001`, `REQ-WORK-002`, `REQ-WORK-009` |
| Task management | `/projects/[id]`, `/tasks` | Team Lead | MVP | `REQ-WORK-003`–`REQ-WORK-008` |
| Workload planner | `/workload` | Team Lead | P2 | `REQ-CAP-001`–`REQ-CAP-006` |
| WFH and leave request queues | `/requests` | Team Lead | P2 | `REQ-WFH-003`, `REQ-ATT-006` |
| Team evaluations | `/evaluations` | Team Lead | P2 | `REQ-EVAL-004`, `REQ-EVAL-006`, `REQ-EVAL-008` |
| Scoped reports | `/reports` | Team Lead | MVP | `REQ-RBAC-009`, `REQ-RPT-001`, `REQ-RPT-002`, `REQ-RPT-005` |

## 6. HR Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| HR dashboard | `/hr` | HR | MVP | `REQ-DASH-006`, `REQ-DASH-008` |
| Employee directory | `/employees` | HR, Admin | MVP | `REQ-ORG-002`, `REQ-RBAC-013` |
| Employee detail and edit | `/employees/[id]` | HR, Admin | MVP | `REQ-ORG-002`–`REQ-ORG-010`, `REQ-DATA-007` |
| Assignment management | `/employees/[id]` assignments tab | HR, Admin | MVP | `REQ-ORG-005`–`REQ-ORG-010` |
| Attendance views | `/attendance` | HR | P2 | `REQ-ATT-002`, `REQ-ATT-004`, `REQ-ATT-007` |
| HR timesheet oversight | `/hr/timesheets` | HR | MVP | `REQ-TIME-002`, `REQ-TIME-003`, `REQ-RBAC-014` |
| Period verification workspace | `/hr/timesheets` verification | HR | MVP | `REQ-TIME-027`, `REQ-RBAC-015`, `AC-WF-003` |
| WFH administration | `/wfh` (HR scope) | HR | P2 | `REQ-WFH-004`, `REQ-WFH-007` |
| Leave administration | `/leave` (HR scope) | HR | P2 | `REQ-ATT-001`, `REQ-ATT-005`, `REQ-ATT-006` |
| Holiday management | `/admin/holidays` | HR, Admin | MVP | `REQ-ATT-003`, `REQ-ATT-004` |
| Evaluation administration | `/evaluations` (HR scope) | HR | P2 | `REQ-EVAL-001`–`REQ-EVAL-003`, `REQ-EVAL-007`, `REQ-EVAL-009` |
| HR reports | `/reports` (HR scope) | HR | P2 | `REQ-RPT-003` |

Period verification is MVP because `project_requirement.md` Section 2.2 requires "Monthly HR verification and authorized Finance access to verified hours".

## 7. Finance Screens

> **Owner changed in Phase 10.** HR absorbed the Finance Manager role, which was
> retired. Every screen below keeps its route and its requirement ids; the
> "Role" column now means HR. `finance.cost.view` is unchanged — it is still a
> per-user grant, and it is still what separates the hours from the money.


| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Finance dashboard | `/finance` | HR | MVP (hours) / P2 (cost tiles) | `REQ-DASH-007`, `REQ-RBAC-016`, `REQ-RBAC-017` |
| Verified employee hours | `/finance/hours` | HR | MVP | `REQ-RBAC-016`, `REQ-RPT-010` |
| Overtime analysis | `/finance/overtime` | HR | MVP | `REQ-RBAC-016`, `REQ-RPT-004` |
| Project costs | `/finance/project-costs` | Finance + `F` | P2 | `REQ-RBAC-017`, `REQ-RPT-004`, `REQ-DATA-005` |
| Division costs | `/finance/division-costs` | Finance + `F` | P2 | `REQ-RBAC-017`, `REQ-RPT-004` |
| Payroll summary and preview | `/finance/payroll` | Finance + `F` | P2 | `REQ-RPT-004`, `REQ-RPT-010` |
| Financial reports and exports | `/finance/reports` | Finance + `F` | P2 | `REQ-RBAC-018`, `REQ-RPT-006`–`REQ-RPT-009` |

`F` marks the separately granted financial permission from the Section 4.2 access matrix. Every cost, rate, salary, budget, and labour-cost field must have a redacted presentation state.

## 8. Management / View-Only Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Management dashboard | `/dashboard` | Management | MVP | `REQ-RBAC-019`, `REQ-DASH-008` |
| Authorized summaries and reports | `/reports` (read-only) | Management | MVP | `REQ-RBAC-019`, `REQ-RBAC-020`, `AC-AUTH-005` |

No management screen may render a create, edit, approve, verify, override, or delete control.

## 9. Administration Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Division management | `/admin/divisions` | Super Admin | MVP | `REQ-RBAC-001`, `REQ-ORG-001`, `REQ-DATA-007` |
| User management | `/admin/users` | Super Admin | MVP | `REQ-RBAC-002` |
| Role and permission management | `/admin/roles` | Super Admin | MVP | `REQ-RBAC-003`, `REQ-NFR-SEC-001`, `REQ-NFR-SEC-004` |
| Work-hour, break, and overtime policies | `/admin/policies` | Super Admin | MVP | `REQ-RBAC-004`, `REQ-TIME-013`, `REQ-TIME-015`, `REQ-NFR-OPS-001` |
| Holiday calendars | `/admin/holidays` | Super Admin, HR | MVP | `REQ-RBAC-004`, `REQ-ATT-003` |
| Audit log viewer | `/admin/audit` | Super Admin | MVP | `REQ-NFR-SEC-005`, `REQ-DATA-008` |
| Integration settings | `/admin/integrations` | Super Admin | P3 | `REQ-INT-001`–`REQ-INT-008` |

## 10. Collaboration Screens

| Screen | Route | Roles | Priority | Requirement IDs |
|---|---|---|---|---|
| Document library | `/documents` | Scoped | P3 | `REQ-DOC-001`–`REQ-DOC-005` |
| Messages and task comments | `/messages` | Scoped | P3 | `REQ-COM-001`–`REQ-COM-004` |

## 11. Requirement Coverage Check

| Requirement group | Covered by |
|---|---|
| `REQ-RBAC-001`–`020` | Sections 2, 5–9 of this table plus the role-to-navigation map |
| `REQ-ORG-001`–`010` | Employee, division, and assignment screens (Sections 4, 6, 9) |
| `REQ-WORK-001`–`009` | Project and task screens (Sections 4, 5) |
| `REQ-TIME-001`–`028` | Timesheet, entry, timer, and verification screens (Sections 4, 5, 6) |
| `REQ-RMK-001`–`007` | Remark and correction screens (Sections 4, 5) |
| `REQ-WFH-001`–`007` | WFH screens (Sections 4, 5, 6) — P2 |
| `REQ-ATT-001`–`007` | Leave, attendance, holiday screens (Sections 4, 6, 9) |
| `REQ-DASH-001`–`009` | Dashboards (Sections 3–8) |
| `REQ-EVAL-001`–`009` | Evaluation screens (Sections 4, 5, 6) — P2 |
| `REQ-RPT-001`–`010` | Report and export screens (Sections 5, 6, 7) |
| `REQ-CAP-001`–`006` | Workload planner (Section 5) — P2 |
| `REQ-NOT-001`–`005` | Notification centre (Section 3) — P2 |
| `REQ-DOC-001`–`005`, `REQ-COM-001`–`004`, `REQ-SRCH-001`–`003` | Collaboration and search (Sections 3, 10) — P3 |
| `REQ-INT-001`–`008` | Integration settings placeholders (Section 9) — P3 |
| `REQ-NAV-001`–`005` | Role-to-navigation map (`information-architecture.md`) |
| `REQ-NFR-*` | Delivery principles in `frontend_milestone.md` Sections 2.2–2.4 and Phase 8 QA tasks |
| `REQ-DATA-001`–`008` | Domain type contracts in `contracts/domain.ts` |

Requirements with no MVP frontend screen: `REQ-INT-002`–`REQ-INT-008` (draft-only calendar import and future connectors) are represented as placeholders only and are explicitly deferred; they must not be presented as connected services.
