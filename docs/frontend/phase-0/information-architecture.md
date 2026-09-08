# Information Architecture and User Flows

Covers `FE-0009` (role-to-navigation map), `FE-0010` (screen flows), `FE-0011` (navigation rules), and `FE-0012` (high-risk responsive screens).

## 1. Role-to-Navigation Map (`FE-0009`)

Navigation is permission-aware (`REQ-NAV-005`): unauthorized destinations are hidden from navigation **and** still return an explicit denied state on direct routing. Flagged destinations disappear entirely when their feature flag is off.

### 1.1 Employee (`REQ-NAV-001`)

| Order | Label | Route | Flag | Mobile bottom nav |
|---:|---|---|---|---|
| 1 | Dashboard | `/dashboard` | — | Yes |
| 2 | My Timesheet | `/timesheets` | — | Yes |
| 3 | My Tasks | `/tasks` | — | Yes |
| 4 | My Divisions | `/divisions` | — | No |
| 5 | WFH | `/wfh` | `wfhRequests` | No |
| 6 | Leave | `/leave` | `leaveManagement` | No |
| 7 | My Evaluation | `/evaluations` | `evaluations` | No |
| 8 | Documents | `/documents` | `documents` | No |
| 9 | Messages | `/messages` | `messages` | No |
| 10 | Notifications | `/notifications` | `notifications` | No (top bar) |
| 11 | Profile | `/profile` | — | Yes (More) |

Default route after login: `/dashboard`.

### 1.2 Team Lead (`REQ-NAV-002`)

| Order | Label | Route | Flag | Mobile bottom nav |
|---:|---|---|---|---|
| 1 | Dashboard | `/dashboard` | — | Yes |
| 2 | My Team | `/team` | — | Yes |
| 3 | Team Timesheets | `/team/timesheets` | — | Yes |
| 4 | Projects | `/projects` | — | Yes |
| 5 | Tasks | `/tasks` | — | No |
| 6 | Workload | `/workload` | `workloadPlanning` | No |
| 7 | Requests | `/requests` | `wfhRequests` or `leaveManagement` | No |
| 8 | Evaluations | `/evaluations` | `evaluations` | No |
| 9 | Reports | `/reports` | — | No |
| 10 | Documents | `/documents` | `documents` | No |
| 11 | Messages | `/messages` | `messages` | No |

A Team Lead is also an employee: their own timesheet, tasks, WFH, and leave remain reachable from the profile menu, in a distinct "My work" group, so personal and team scope never blur.

Default route after login: `/dashboard`.

### 1.3 HR Manager (`REQ-NAV-003`)

| Order | Label | Route | Flag | Mobile bottom nav |
|---:|---|---|---|---|
| 1 | HR Dashboard | `/hr` | — | Yes |
| 2 | Employees | `/employees` | — | Yes |
| 3 | Timesheets | `/hr/timesheets` | — | Yes |
| 4 | Attendance | `/attendance` | `attendance` | Yes |
| 5 | WFH | `/wfh` | `wfhRequests` | No |
| 6 | Leave | `/leave` | `leaveManagement` | No |
| 7 | Evaluations | `/evaluations` | `evaluations` | No |
| 8 | Reports | `/reports` | — | No |
| 9 | Holidays | `/admin/holidays` | — | No |
| 10 | Documents | `/documents` | `documents` | No |

Default route after login: `/hr`.

### 1.4 HR Manager (formerly Finance Manager) (`REQ-NAV-004`)

| Order | Label | Route | Flag | Extra permission |
|---:|---|---|---|---|
| 1 | Finance Dashboard | `/finance` | — | — |
| 2 | Employee Hours | `/finance/hours` | — | — |
| 3 | Overtime | `/finance/overtime` | — | — |
| 4 | Project Costs | `/finance/project-costs` | `projectCosting` | Financial permission |
| 5 | Division Costs | `/finance/division-costs` | `projectCosting` | Financial permission |
| 6 | Payroll Reports | `/finance/payroll` | `financeReports` | Financial permission |
| 7 | Financial Reports | `/finance/reports` | `financeReports` | Financial permission |

Without the financial permission, items 4–7 are hidden and their routes return a denied state; items 1–3 render hours with every cost field redacted.

Default route after login: `/finance`.

### 1.5 Management / View-Only

| Order | Label | Route |
|---:|---|---|
| 1 | Dashboard | `/dashboard` |
| 2 | Reports | `/reports` |
| 3 | Projects (read-only) | `/projects` |
| 4 | Documents | `/documents` (flagged) |

No action bar, row action, form, or bulk control renders for this role on any screen (`REQ-RBAC-020`, `AC-AUTH-005`).

Default route after login: `/dashboard`.

### 1.6 Super Administrator

| Order | Label | Route |
|---:|---|---|
| 1 | Dashboard | `/dashboard` |
| 2 | Divisions | `/admin/divisions` |
| 3 | Users | `/admin/users` |
| 4 | Roles and Permissions | `/admin/roles` |
| 5 | Work Policies | `/admin/policies` |
| 6 | Holidays | `/admin/holidays` |
| 7 | Audit Log | `/admin/audit` |
| 8 | Integrations | `/admin/integrations` (flagged, placeholder) |
| 9 | Employees | `/employees` |
| 10 | Reports | `/reports` |

Default route after login: `/dashboard`.

## 2. Primary Screen Flows (`FE-0010`)

Each flow lists the start point, the success state, the failure states that must be designed, and the mobile behavior.

### 2.1 Employee Time Entry

1. `/dashboard` → "Add time" quick action, or `/timesheets` → select date → "Add entry".
2. Entry drawer: date, division, project, task, entry method (clock or duration), work location.
3. Constrained selects: projects filter by division; tasks filter by project; divisions filter by assignments effective on the chosen date.
4. Live calculation preview: entry duration, day active work, recognized break, daily total, remaining active requirement, resulting status.
5. Description and completed work required; attachment or link optional.
6. Above 8:00 total, the overtime reason field is revealed and required. Above 12:00 total, the critical explanation is additionally revealed and required.
7. Save → success toast, drawer closes, day view and dashboard totals update.

**Failure states:** end at or before start; overlap with an existing entry, including one in a different division; duplicate entry; inactive project; division not assigned on the work date; approved-leave conflict; missing description or completed work; locked/verified period; permission denied; save failure with retry.

**Mobile:** the drawer becomes a full-screen sheet with a sticky footer action bar that stays reachable above the on-screen keyboard; the calculation preview pins under the header.

### 2.2 Timer

1. Start from the dashboard quick action, the shell timer control, or a task detail page.
2. Required context: division, project or task, work location.
3. The running timer appears in the top bar on every route with elapsed time and a stop control.
4. Stop → a clearly identified **draft** entry opens for review; the employee completes description and completed work, then saves.

**Failure states:** an attempt to start a second timer (blocked with an explanation, never two visually active timers); timer recovered after a refresh (recovery banner); stop failing with retry; discarding a draft with confirmation.

**Mobile:** the timer indicator collapses to a compact pill in the header and remains tappable at 44 px.

### 2.3 Copy Previous Entry

1. `/timesheets/[date]` → "Copy previous entry" → pick a source entry from recent days.
2. The copy opens as an editable draft on the **target** date with no approval or verification state carried over.
3. Full revalidation runs before save.

### 2.4 Correction Cycle

1. Team Lead: `/team/timesheets` → filter exceptions → open a timesheet detail.
2. Add one general remark; optionally mark it a correction request naming the record to change; preview the employee notification.
3. Employee: remark inbox → open remark → either add a clarification response or open the linked record for correction.
4. Correction editing shows locked fields, a change summary, and requires resubmission.
5. Team Lead: reviews the response and corrected values, then resolves the remark.

**States:** open, responded, corrected, resolved. History is never erased.

### 2.5 WFH Request

1. Employee: `/wfh` → new request → WFH date, full or half day, reason, planned tasks, division, contact availability, optional attachment.
2. Submit → pending.
3. Team Lead: `/requests` → decide (approve, reject, request information) with an optional general remark.
4. HR: `/wfh` → audited override with a required reason.
5. Employee is notified at each transition; attendance context updates, but **no hours are created**.

### 2.6 Leave Request

1. Employee: `/leave` → balance summary → new request → type, dates, full or half day, reason.
2. Validation: balance sufficiency, overlap with existing leave, conflict with recorded time.
3. Team Lead decision → HR override where needed → notification.
4. Approved full-day leave removes the day's time requirement; half-day leave adjusts it proportionally.

### 2.7 Team Lead Review

1. `/dashboard` → exception tile → `/team/timesheets` pre-filtered to that exception.
2. Inspect the calculation breakdown, entries, completed work, anomalies, remarks, and change history.
3. Act via remark or correction request. **No approve control exists on any daily record.**

### 2.8 HR Period Verification

1. `/hr/timesheets` → select payroll period → verification workspace.
2. Review completeness, exceptions, and unresolved corrections; drill into any employee.
3. Resolve or record exceptions.
4. "Verify period" confirmation lists included dates, employee count, policy version, exception count, and lock consequences.
5. Verified → the period shows as locked. Later changes route through unlock request or amendment, each with a reason and before/after history.

### 2.9 Evaluation

1. HR: `/evaluations` → create period (type, range, eligible employees, reviewers, due dates).
2. System presents factual inputs: required and active hours, break, overtime, missing days, task results, estimate variance, division/project contribution, WFH days, leave summary, remarks.
3. Employee completes self-evaluation.
4. Team Lead scores each area; the weighted summary uses the versioned 30/25/15/10/10/10 default.
5. HR reviews and publishes; only then does the employee see the result.

### 2.10 Finance Reporting

1. `/finance` → verified-period selector (defaults to the latest HR-verified period).
2. `/finance/hours` or `/finance/overtime` → filter → review → drill down.
3. With financial permission: apply cost rates for project and division labour cost and budget variance.
4. `/finance/payroll` → payroll-ready preview → export configuration (mocked queued → processing → ready in this milestone).
5. Unverified data, where explicitly permitted, is visibly flagged.

## 3. Navigation Rules (`FE-0011`)

### 3.1 Page titles

- Document title pattern: `{Page} · {Section} · Timesheet` — for example `2026-09-02 · My Timesheet · Timesheet`.
- Every route sets a unique `<h1>` matching its navigation label or record name.

### 3.2 Breadcrumbs

- Shown on all detail and nested routes at ≥ 768 px; hidden below that width where a back control replaces them.
- Maximum four levels; the middle is truncated before the first and last items are.
- The trailing item is the current page and is not a link.
- Examples: `Projects / Vision Platform v2 / Tasks`, `Employees / Nadia Rahman / Assignments`, `My Timesheet / 2026-09-02`.

### 3.3 Back behavior

- Detail routes rendered as a page provide an explicit back control to the parent list, not merely browser history.
- Drawers, sheets, and dialogs close on Escape and on the backdrop, restore focus to the trigger, and never push a history entry.
- A form with unsaved changes intercepts back, close, and route change with a discard confirmation.

### 3.4 Deep links

- Every list state is expressible in the URL: filters, date range, page, page size, sort field, sort direction, and search term (see `contracts/query.ts`).
- Detail routes accept a stable record identifier. A record the viewer cannot access returns the same not-found presentation as a nonexistent one, so identifiers reveal nothing (`REQ-SRCH-003`, `AC-AUTH-004`).
- `/timesheets/[date]` accepts an ISO date; an invalid or out-of-policy date returns the not-found state.
- After an expired session, the attempted URL is preserved and restored after re-authentication.

### 3.5 Mobile navigation

- Below 768 px: a top app bar (page context, search trigger, notifications, timer pill, profile) plus a bottom navigation bar of at most five destinations, taken from each role's table above.
- The remaining destinations live behind a "More" sheet.
- The drawer traps focus, closes on Escape, and restores focus to its trigger.
- Bottom navigation respects the device safe area and never covers a sticky form action bar; when both are present, the action bar sits above the navigation.

## 4. High-Risk Responsive Screens (`FE-0012`)

These screens are reviewed first at every target width and are the mandatory subjects of `FE-0801`.

| Screen | Risk | Required mobile treatment |
|---|---|---|
| Daily timesheet grid / timeline (`/timesheets/[date]`) | Dense time blocks, overlapping labels, many columns | Stacked entry cards with a duration bar; timeline reserved for ≥ 1024 px |
| Team timesheet table (`/team/timesheets`) | Nine-plus columns including division contributions | Card list with employee, date, total, status badge, and a detail affordance |
| Report builder and preview (`/reports`) | Ten-plus filters plus a wide result table | Filters in a full-screen sheet with an applied-filter summary chip row; results in a labelled horizontal scroll region |
| Employee profile (`/employees/[id]`) | Eleven tabs of dense data | Scrollable tab strip with an overflow menu; one column below 768 px |
| Workload planner and calendar (`/workload`) | Week grid × employees × allocation | Per-employee capacity cards; the calendar becomes a vertical agenda |
| Finance cost tables (`/finance/project-costs`, `/finance/division-costs`) | Wide numeric tables with redaction states | Card summaries with expandable breakdown; redacted fields keep their label and show an explicit restricted marker |
| Evaluation form (`/evaluations/[id]`) | Nine scoring areas, weights, facts, and comments | One area per section with a sticky weighted-score summary |
| Time entry drawer (`/timesheets/[date]`) | Twelve-plus inputs plus a live preview plus the on-screen keyboard | Full-screen sheet, pinned preview, sticky footer actions |
| Attendance calendar (`/attendance`) | Month grid × nine attendance states | Vertical agenda with text status labels, never colour alone |
| Audit log viewer (`/admin/audit`) | Wide rows with before/after payloads | Row cards with an expandable detail panel |

Shared rule: any table that cannot become cards must live in a labelled, keyboard-reachable horizontal scroll region with a sticky first column. Page-level horizontal scrolling is never acceptable (`REQ-NFR-UX-001`, `AC-QUAL-001`).
