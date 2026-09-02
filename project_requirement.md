# Multi-Division Employee Timesheet and Work Management System

## Project Requirements Document

| Document field | Value |
|---|---|
| Version | 1.0 |
| Status | Baseline requirements |
| Source baseline | Multi-Division Timesheet & Work Management System Feature Requirements, Version 1.0, June 2026 |
| Product owner | PowerInAI |
| Initial divisions | PowerInAI, PowerInAI Training, Government Projects, Computer Jagat, WesternCF |
| Intended audience | Product owners, designers, developers, QA engineers, operations, HR, Finance, and management |

## 1. Purpose and Objectives

The product is a centralized, responsive web application for tracking employee time and work across multiple divisions. It connects working hours to divisions, projects, and tasks and gives employees, Team Leads, HR, Finance, and management a consistent view of attendance, workload, performance, and labour cost.

The system must:

- Provide one authoritative record of employee time across all divisions.
- Distinguish active work from break time and apply the company's daily working-hour policy consistently.
- Relate time to measurable work through projects, tasks, descriptions, and completed-work details.
- Support Work From Home (WFH), leave, attendance, evaluations, reports, and controlled financial analysis.
- Preserve historical and audit information while enforcing role-, division-, and project-based access.
- Deliver a focused operational product before adding broad collaboration and AI capabilities.

### 1.1 Success Measures

- Employees can record a complete day against one or more divisions without double-counting time.
- Team Leads can identify missing, unusual, incomplete, under-time, and overtime records without a daily approval queue.
- HR can verify each payroll period and produce reliable attendance and evaluation information.
- Finance can report verified hours and authorized cost information by employee, division, project, and payroll period.
- Management can understand planned allocation versus actual contribution.
- Every sensitive view, change, override, verification, and export is permission-controlled and auditable.

## 2. Scope and Delivery Boundaries

### 2.1 Full Product Scope

The full product vision includes identity and access, employee and division administration, projects and tasks, timesheets, WFH, leave and attendance, dashboards, evaluations, reporting, workload planning, notifications, documents, lightweight communication, search, integrations, and advanced automation.

### 2.2 MVP Scope

The MVP must include:

- Secure login, roles, permissions, the five initial divisions, employee profiles, and multi-division assignments.
- Projects, basic tasks, daily timesheets, manual and duration entry, timer operation, copied entries, active-time and break calculations, validation, and overtime highlighting.
- Work-location recording, including Office and WFH.
- A single general remark model and correction workflow without daily Team Lead approval.
- Employee, Team Lead, HR, and Finance dashboard summaries required for core operations.
- Basic employee-, division-, project-, task-, and period-based reports with Excel, CSV, PDF, and printable output.
- Monthly HR verification and authorized Finance access to verified hours.

### 2.3 Deferred Scope

- Phase 2 must add full leave management, WFH requests, evaluations, workload planning, project costing, Finance reports, notifications, and improved mobile workflows.
- Phase 3 must add messages, document and knowledge areas, announcements, task comments, and advanced search.
- Phase 4 must add AI-generated summaries, forecasting, anomaly detection, natural-language reporting, payroll integration, and accounting integration.
- A full Slack- or Notion-style collaboration suite, audio/video huddles, and advanced communication channels are outside the current product baseline.

## 3. Terminology and Policies

| Term | Definition |
|---|---|
| Active work | Valid time attributed to a division and, where applicable, a project or task. Breaks are excluded. |
| Break | Non-active time displayed separately from active work. The default is one hour per standard full working day. |
| Daily total | Active work plus the recognized daily break. |
| Normal full day | Exactly 7 active hours plus 1 break hour, totaling 8 scheduled hours. |
| Under-time | A day with an entry where active work is below 7 hours or the daily total is below 8 hours. |
| Overtime | A daily total greater than 8 hours and no more than 12 hours. |
| Critical exception | A daily total greater than 12 hours. |
| Missing timesheet | A required working day with no time entry and no approved leave, holiday, or other approved exemption. |
| Verified period | A payroll/reporting period reviewed and locked or explicitly verified by HR. It is not a daily Team Lead approval. |
| Planned allocation | The expected division or project allocation percentage/hours assigned to an employee. |
| Actual contribution | Valid active work recorded in timesheets for a division or project. |
| General remark | The single remark type used for clarification, correction, work quality, performance, or other review feedback. |
| WFH | Work From Home. |

## 4. Stakeholders, Roles, and Access

### 4.1 Role Responsibilities

#### Super Administrator

- `REQ-RBAC-001`: The system must allow a Super Administrator to create, edit, activate, and deactivate divisions.
- `REQ-RBAC-002`: The system must allow a Super Administrator to create, update, activate, and deactivate employees and assign them to one or more divisions.
- `REQ-RBAC-003`: The system must allow a Super Administrator to assign Team Lead, HR Manager, Finance Manager, management/view-only, and administrative roles.
- `REQ-RBAC-004`: The system must allow a Super Administrator to manage permissions, holidays, working-hour policies, overtime rules, integrations, and system settings.
- `REQ-RBAC-005`: The system must give authorized Super Administrators company-wide dashboards, reports, activity logs, and integration administration.

#### Team Lead

- `REQ-RBAC-006`: The system must limit a Team Lead's operational access to assigned divisions, projects, teams, and employees unless a broader permission is explicitly granted.
- `REQ-RBAC-007`: The system must allow Team Leads to create projects, create and assign tasks, review team timesheets, add general remarks, and request corrections.
- `REQ-RBAC-008`: The system must allow Team Leads to review WFH and leave requests for assigned employees and conduct authorized evaluations.
- `REQ-RBAC-009`: The system must allow Team Leads to generate reports only for their authorized scope.

#### Employee

- `REQ-RBAC-010`: The system must allow employees to view their assignments, projects, tasks, time, remarks, evaluations, leave, and WFH records.
- `REQ-RBAC-011`: The system must allow employees to create and correct their time entries, operate their timers, provide clarifications, request WFH, and apply for leave.
- `REQ-RBAC-012`: The system must prevent employees from viewing another employee's private, evaluation, salary, or cost information unless a separate role grants access.

#### HR Manager

- `REQ-RBAC-013`: The system must allow authorized HR Managers to manage employee profiles, employment status, assignments, holidays, leave, WFH, evaluation periods, and HR reports.
- `REQ-RBAC-014`: The system must allow authorized HR Managers to review company-wide attendance, timesheet exceptions, workload information, and Team Lead remarks.
- `REQ-RBAC-015`: The system must allow HR Managers to verify payroll/reporting periods and make audited WFH or leave overrides.

#### Finance Manager

- `REQ-RBAC-016`: The system must allow authorized Finance Managers to view verified hours, overtime, project hours, division hours, billable status, and payroll-period summaries.
- `REQ-RBAC-017`: The system must expose salaries, cost rates, budgets, and labour costs only through separately granted financial permissions.
- `REQ-RBAC-018`: The system must allow Finance Managers to export authorized financial and payroll-ready reports.

#### Management or View-Only User

- `REQ-RBAC-019`: The system must allow a management/view-only user to view only explicitly authorized dashboards, summaries, progress, and reports.
- `REQ-RBAC-020`: The system must prevent a view-only user from creating, editing, approving, verifying, or deleting operational records.

### 4.2 Access-Control Matrix

Legend: **M** = manage, **O** = own records, **A** = assigned scope, **V** = view only when authorized, **F** = separately granted financial permission, **-** = no default access.

| Capability | Super Admin | Team Lead | Employee | HR | Finance | Management |
|---|---:|---:|---:|---:|---:|---:|
| Divisions and system policy | M | V | V | V | V | V |
| Employee profiles/assignments | M | A/V | O/V | M | V | V |
| Projects and tasks | M | A/M | O/A | V | V | V |
| Timesheet entry | M | A/V | O/M | V | V/verified | V |
| Remarks/correction requests | M | A/M | O/respond | V | V | V |
| WFH and leave decisions | M | A/M | O/request | M/override | V | V |
| Evaluations | M | A/M | O/self | M | - | V |
| Cost and salary data | F | - | - | F | F | F |
| Period verification | M | - | - | M | V | V |
| Reports/exports | M | A | O | M | F | V |
| Audit logs | M | A/V | O/V | V | F/V | - |

## 5. Functional Requirements

### 5.1 Employee and Division Management

- `REQ-ORG-001`: The system must seed PowerInAI, PowerInAI Training, Government Projects, Computer Jagat, and WesternCF as the initial divisions while allowing authorized administrators to configure divisions later.
- `REQ-ORG-002`: The system must store employee ID, full name, profile photo, designation, department, employment type, joining date, status, contact details, and office location.
- `REQ-ORG-003`: The system must store each employee's primary division, additional divisions, Team Lead, skills, active projects, standard daily hours, standard weekly hours, and normal work mode.
- `REQ-ORG-004`: The system must support Office, WFH, Hybrid, Field Work, Official Travel, Training, and Client Location as employee work modes.
- `REQ-ORG-005`: The system must allow an employee to have multiple concurrent division assignments.
- `REQ-ORG-006`: Each division assignment must store division, employee role, Team Lead, allocation percentage, expected weekly hours, start date, end date, and active status.
- `REQ-ORG-007`: The system must retain historical assignment periods and must prevent destructive deletion when an assignment or employee is referenced by operational records.
- `REQ-ORG-008`: The system must support dated temporary assignments for events, campaigns, government work, training, client projects, content creation, emergency support, and implementation work.
- `REQ-ORG-009`: Every temporary assignment must have a start date and end date and must become unavailable for new time entries outside that range.
- `REQ-ORG-010`: The system must validate allocation percentages and visibly warn when an employee's concurrent planned allocation differs from 100 percent.

### 5.2 Projects and Tasks

- `REQ-WORK-001`: The system must associate each project with exactly one division and store its name, code, manager, team members, client/stakeholder, dates, priority, description, estimated hours, budget, completion percentage, documents, attachments, and notes.
- `REQ-WORK-002`: The system must calculate actual project hours from valid time entries rather than manually maintained totals.
- `REQ-WORK-003`: The system must store task title, division, project, assignee, supporting members, creator, priority, dates, estimate, description, checklist, attachments, and status.
- `REQ-WORK-004`: Task status must support Pending, In Progress, and Completed.
- `REQ-WORK-005`: Employees must be able to record time directly against an authorized task.
- `REQ-WORK-006`: A task view must show estimated and actual time, assigned employee, division, dated work entries, completed-work details, due date, and overdue state.
- `REQ-WORK-007`: The system must derive task actual time from valid linked time entries.
- `REQ-WORK-008`: The system must prevent new time from being recorded against an inactive project, completed/closed project that disallows time, or unauthorized task.
- `REQ-WORK-009`: Project and task attachments must inherit division-, project-, and role-based access controls.

### 5.3 Timesheet Management

- `REQ-TIME-001`: Employees must have daily, weekly, monthly, calendar, and list views of their timesheets.
- `REQ-TIME-002`: Authorized Team Leads and HR users must have employee-, division-, project-, and month-based summary views.
- `REQ-TIME-003`: The system must provide focused views for missing timesheets, under-time, overtime, critical exceptions, and WFH entries.
- `REQ-TIME-004`: A time entry must store date, employee, division, project, task, entry method, work location, work description, completed work, and optional attachment or supporting link.
- `REQ-TIME-005`: Clock-based entries must store start and end time; duration-based entries must store an explicit duration.
- `REQ-TIME-006`: The system must support manual start/end entry, direct duration entry, start/stop timer, and copying an earlier entry as a new draft.
- `REQ-TIME-007`: A copied entry must use the target date, must not copy approval/verification state, and must be revalidated before saving.
- `REQ-TIME-008`: An employee must not have more than one running timer at a time.
- `REQ-TIME-009`: Stopping a timer must create or update a draft time entry that the employee reviews and saves.
- `REQ-TIME-010`: Work location must support Office, WFH, Hybrid, Field Work, Client Office, Official Travel, and Training Venue.
- `REQ-TIME-011`: The system must aggregate valid active work across every division for the employee's local calendar day while preserving the contribution of each division, project, and task.
- `REQ-TIME-012`: The system must display active work, recognized break, and daily total as separate values.
- `REQ-TIME-013`: The standard daily break must default to one hour and must be editable only by a user with the break-override permission.
- `REQ-TIME-014`: The system must calculate daily total as active work plus recognized break.
- `REQ-TIME-015`: The system must mark a standard day complete only when it has 7 active hours and an 8-hour daily total, subject to an employee's authorized work policy.
- `REQ-TIME-016`: The system must classify no required-day entry as Missing, a populated day below either normal threshold as Under-time, a normal full day as Complete, a total from 8:01 through 12:00 as Overtime, and a total above 12:00 as Critical.
- `REQ-TIME-017`: The system must use accessible text/status indicators in addition to the intended grey/red, yellow, green, orange, and red visual highlighting.
- `REQ-TIME-018`: The system must require an overtime reason whenever the daily total exceeds 8 hours.
- `REQ-TIME-019`: The system must require an explanation and notify the employee's Team Lead and HR whenever the daily total exceeds 12 hours.
- `REQ-TIME-020`: The system must detect overlapping entries for the same employee, including entries assigned to different divisions.
- `REQ-TIME-021`: The system must reject duplicate entries and end times earlier than or equal to start times.
- `REQ-TIME-022`: The system must reject entries missing a valid division, required task/project relationship, description, completed-work information, or required break information.
- `REQ-TIME-023`: The system must reject time against an inactive project or a division to which the employee was not assigned on the entry date.
- `REQ-TIME-024`: The system must flag or reject time entered during approved leave according to the leave type and duration and must explain the conflict.
- `REQ-TIME-025`: Every validation response must identify the affected field or entry and state how the user can correct it.
- `REQ-TIME-026`: Saving a daily entry must not require Team Lead approval.
- `REQ-TIME-027`: Changes made after HR verification must require an authorized unlock or amendment workflow and must preserve the before/after values and reason.
- `REQ-TIME-028`: All daily and period calculations must use a configured business timezone and must handle cross-midnight work by splitting or attributing time according to that configured policy.

### 5.4 General Remarks and Corrections

- `REQ-RMK-001`: The system must use one general remark type rather than multiple remark categories.
- `REQ-RMK-002`: An authorized Team Lead must be able to relate a remark to an employee and optionally to a timesheet or task.
- `REQ-RMK-003`: A remark must store its author, timestamp, employee, related record, message, correction-request state, and resolution state.
- `REQ-RMK-004`: Employees must be able to view remarks addressed to them and add a clarification response.
- `REQ-RMK-005`: A correction request must identify the record to change and must notify the employee.
- `REQ-RMK-006`: Correcting a record must preserve its change history and must not erase the original remark or employee response.
- `REQ-RMK-007`: Team Leads must be able to review missing, under-time, overtime, critical, overlapping, incomplete, leave-conflicting, and otherwise unusual records without approving every normal daily entry.

### 5.5 Work From Home

- `REQ-WFH-001`: Employees must be able to request WFH for a dated full day or half day.
- `REQ-WFH-002`: A WFH request must store request date, WFH date, duration, reason, planned tasks, division, contact availability, and optional required attachment.
- `REQ-WFH-003`: The primary Team Lead must be able to approve, reject, request information, and add a general remark to a WFH request.
- `REQ-WFH-004`: Authorized HR users must be able to oversee and override a WFH decision with a required reason and audit record.
- `REQ-WFH-005`: Employees must be notified of WFH requests, information requests, approval, rejection, and overrides.
- `REQ-WFH-006`: An approved WFH day must not itself create working hours; the employee must record normal time, break, division, project/task, and completed work with WFH as the location.
- `REQ-WFH-007`: WFH reporting must provide employee history, WFH-day counts, division summaries, decisions, hours, and completed-work information.

### 5.6 Leave and Attendance

- `REQ-ATT-001`: The system must support annual, sick, casual, unpaid, and half-day leave.
- `REQ-ATT-002`: The attendance model must distinguish Office, WFH, Official Travel, Field Duty, Training Duty, approved leave, absence, holiday, and missing timesheet.
- `REQ-ATT-003`: The holiday calendar must support company-wide holidays, division-specific holidays, and weekly holidays.
- `REQ-ATT-004`: Approved full-day leave and applicable holidays must not appear as missing-timesheet dates.
- `REQ-ATT-005`: Half-day leave must proportionally adjust the employee's required active and scheduled time for that day.
- `REQ-ATT-006`: Team Leads must be the primary leave reviewers for assigned employees, and HR must have an audited oversight and override capability.
- `REQ-ATT-007`: Attendance results must be derived from approved leave/WFH, holidays, employee schedule, work location, and valid timesheets without conflating WFH with leave.

### 5.7 Dashboards

- `REQ-DASH-001`: The Employee dashboard must show today's active work, break, total, remaining active requirement, total-schedule progress, divisions, active tasks, deadlines, and active timer.
- `REQ-DASH-002`: The Employee dashboard must show weekly/monthly totals, overtime, missing dates, recent remarks, WFH requests, leave balance, division contribution, and recently completed tasks.
- `REQ-DASH-003`: The Employee dashboard must provide direct actions to add time, start a timer, add completed work, request WFH, and apply for leave when those modules are enabled.
- `REQ-DASH-004`: The Team Lead dashboard must show assigned headcount, employees working today, and office/WFH/field/travel/leave status.
- `REQ-DASH-005`: The Team Lead dashboard must identify missing, under-time, overtime, and critical records and summarize division hours, project progress, pending/overdue tasks, recent entries, requests, workload warnings, and evaluation status.
- `REQ-DASH-006`: The HR dashboard must show total/active employees, division headcount, attendance states, missing timesheets, under-time, overtime, monthly hours, evaluation periods, performance trends, WFH trends, workload concerns, and assignment information.
- `REQ-DASH-007`: The Finance dashboard must show verified employee, division, project, and overtime hours plus authorized labour costs, billable/non-billable hours, payroll summaries, budget variance, and export history.
- `REQ-DASH-008`: Every dashboard metric must respect the viewer's access scope and must link to a filtered detail view where detail access is allowed.
- `REQ-DASH-009`: Dashboard totals must use the same calculation service and policy version as reports and timesheet views.

### 5.8 Employee Evaluation

- `REQ-EVAL-001`: The system must support monthly, quarterly, half-yearly, annual, project-based, and probation evaluation periods.
- `REQ-EVAL-002`: Authorized HR users must be able to create, open, close, and publish evaluation periods and assign eligible employees and reviewers.
- `REQ-EVAL-003`: Evaluations must automatically present required hours, active hours, breaks, overtime, missing timesheets, task results, overdue tasks, completion rate, estimate variance, division/project contribution, WFH days, leave summary, and relevant Team Lead remarks.
- `REQ-EVAL-004`: Team Lead evaluations must support work quality, timeliness, responsibility, communication, teamwork, problem-solving, initiative, documentation, and learning/improvement.
- `REQ-EVAL-005`: Employee self-evaluation must support achievements, completed projects, challenges, skills, training needs, goals, and required support.
- `REQ-EVAL-006`: The default weighted score must use task completion/results 30%, work quality 25%, timeliness 15%, teamwork/communication 10%, responsibility 10%, and learning/initiative 10%.
- `REQ-EVAL-007`: Authorized administrators must be able to version evaluation weighting without changing completed historical evaluations.
- `REQ-EVAL-008`: An evaluation must not use working hours as the sole performance measure and must preserve the greater combined weight of quality, outcomes, responsibility, and results.
- `REQ-EVAL-009`: Employees must see evaluation results only after publication, while authorized HR and reviewers must see status during the evaluation workflow.

### 5.9 Reports and Exports

- `REQ-RPT-001`: The system must provide daily, weekly, and monthly working-hour reports.
- `REQ-RPT-002`: Timesheet reports must support employee-, division-, project-, and task-based grouping and overtime, under-time, missing, critical, and WFH views.
- `REQ-RPT-003`: HR reports must cover attendance, leave, WFH, evaluations, performance history, workload, division assignments, and remarks.
- `REQ-RPT-004`: Finance reports must cover verified employee hours, overtime, project/division labour cost, billable/non-billable time, payroll preparation, and budget versus actuals.
- `REQ-RPT-005`: Report filters must support date/period, employee, division, project, task, Team Lead, employment type, work location, WFH/office state, overtime classification, and record status where applicable.
- `REQ-RPT-006`: Reports must export to Excel, CSV, and PDF and must provide a printable representation.
- `REQ-RPT-007`: Every report and export must respect row-level and field-level permissions, including restrictions on salary, cost, evaluation, and government-project data.
- `REQ-RPT-008`: An export must record requester, timestamp, report type, filters, format, status, and file access/expiry information in the export history.
- `REQ-RPT-009`: Generated reports must show the reporting period, filters, timezone, generation timestamp, and policy version used for calculations.
- `REQ-RPT-010`: Finance-facing hour and cost reports must default to HR-verified periods and must visibly identify unverified information when access to it is explicitly allowed.

### 5.10 Workload Planning

- `REQ-CAP-001`: The system must track each employee's standard weekly capacity, assigned work, actual active work, and remaining capacity.
- `REQ-CAP-002`: Capacity calculations must account for division allocation, project allocation, approved leave, WFH schedule, holidays, and employee working policy.
- `REQ-CAP-003`: The default five-day capacity must be 35 active hours; the five daily one-hour breaks must produce a 40-hour scheduled week but must not be assigned to tasks.
- `REQ-CAP-004`: The system must warn when an employee is overallocated or underallocated against configurable thresholds.
- `REQ-CAP-005`: Authorized Team Leads and HR users must be able to view upcoming deadlines and a team workload calendar for their scope.
- `REQ-CAP-006`: Planned allocation must remain distinct from actual contribution calculated from timesheets.

### 5.11 Notifications

- `REQ-NOT-001`: Employees must receive notifications for missing time, under-time, overtime, new tasks, approaching/overdue deadlines, new remarks, WFH/leave decisions, and published evaluations.
- `REQ-NOT-002`: Team Leads must receive notifications for team overtime, critical time, missing timesheets, WFH/leave requests, overdue tasks, workload warnings, and due evaluations.
- `REQ-NOT-003`: HR must receive notifications for missing monthly records, high overtime, due evaluations, excessive workload, unusual WFH patterns, and incomplete employee information.
- `REQ-NOT-004`: Notifications must link to the authorized related record, record read state, and avoid exposing restricted content in notification text.
- `REQ-NOT-005`: The system must prevent duplicate notifications for the same rule occurrence and must record delivery status for configured channels.

### 5.12 Documents and Knowledge

- `REQ-DOC-001`: The system must support company policies, employee handbooks, division guidelines, procedures, training material, government-project documents, templates, meeting notes, client instructions, and FAQs.
- `REQ-DOC-002`: Each document must store title, owner, division/project scope, version or update timestamp, file/link, description, and access policy.
- `REQ-DOC-003`: Each division must be able to maintain a private document area accessible only to authorized users.
- `REQ-DOC-004`: Government-project documents must be denied by default to users without explicit authorization.
- `REQ-DOC-005`: Document downloads and permission changes must be auditable.

### 5.13 Lightweight Communication

- `REQ-COM-001`: Phase 3 must support division messages, project messages, direct messages, and task comments.
- `REQ-COM-002`: Messages must support attachments, mentions, announcements, and pinned content within the sender's authorized scope.
- `REQ-COM-003`: Message and attachment access must follow division-, project-, participant-, and role-based permissions.
- `REQ-COM-004`: The initial communication module must not be treated as a full Slack replacement and must exclude audio/video huddles and advanced channel administration.

### 5.14 Search

- `REQ-SRCH-001`: The system must provide authorized global search across employees, divisions, projects, tasks, timesheets, remarks, and documents as those modules become available.
- `REQ-SRCH-002`: Search must support date, division, employee, project, status, work location, and file-type filters where applicable.
- `REQ-SRCH-003`: Search results must never reveal the existence, title, snippet, metadata, or attachment of a record the user is not authorized to view.

### 5.15 Integrations and External Interfaces

- `REQ-INT-001`: The integration framework must support Google Calendar and Microsoft Outlook Calendar connectors.
- `REQ-INT-002`: Calendar events may be converted only into draft time entries and must require employee review and confirmation before saving.
- `REQ-INT-003`: The integration framework must support future Gmail, Microsoft 365, Google Drive, OneDrive, Google Meet, Zoom, Slack, and Jira connections where approved.
- `REQ-INT-004`: The integration framework must support future biometric attendance, payroll, accounting, and HR system connections.
- `REQ-INT-005`: The system must provide versioned REST API and webhook capabilities for authorized integrations and may support automation platforms such as Zapier or Make.
- `REQ-INT-006`: Integrations must use scoped credentials, configurable synchronization, retry handling, idempotency, error logging, and auditable administrative actions.
- `REQ-INT-007`: Single sign-on must be supported as an optional authentication integration.
- `REQ-INT-008`: External data must not bypass the same authorization, validation, verification, and audit rules applied to interactive entry.

## 6. Core Workflows

### 6.1 Employee Time Workflow

1. The employee must authenticate and see authorized assignments and tasks.
2. The employee must select the work date, division, project/task, entry method, and work location.
3. The employee must enter or record active work and completed-work details.
4. The system must validate authorization, dates, overlap, leave conflicts, and required fields.
5. The system must calculate active work, break, daily total, remaining time, and daily status across all divisions.
6. The employee must provide an overtime reason when required and save the entry without daily Team Lead approval.
7. If a Team Lead requests correction, the employee must amend the record or provide clarification; the audit history must remain intact.

### 6.2 Team Lead Review Workflow

1. The Team Lead must see summaries and exceptions for assigned employees.
2. The Team Lead must inspect missing, under-time, overtime, critical, completed-work, task, and workload information.
3. The Team Lead must add a general remark and correction request when clarification is needed.
4. The Team Lead must review assigned WFH and leave requests.
5. The Team Lead must use verified operational information in periodic evaluations.

### 6.3 HR Verification Workflow

1. HR must select a reporting/payroll period and review employee time, attendance, leave, WFH, exceptions, and unresolved corrections.
2. HR must resolve or record authorized exceptions before verification.
3. HR must verify the period, causing its included records and calculation-policy version to be fixed for reporting.
4. Post-verification changes must use an audited unlock or amendment process.
5. HR must provide verified data to Finance and generate attendance and evaluation reports.

### 6.4 Finance Workflow

1. Finance must select a verified period within its permission scope.
2. Finance must review employee, overtime, division, project, billable, and non-billable hours.
3. Where authorized, Finance must apply protected cost rates and budgets to produce labour-cost and variance reports.
4. Finance must generate payroll-ready and financial exports, which the system must audit.

### 6.5 WFH and Leave Workflow

1. An employee must submit a dated request with the required details.
2. The Team Lead must approve, reject, or request more information.
3. HR must be able to exercise an audited override.
4. The system must notify the employee and update attendance expectations.
5. Approved WFH must still require a timesheet; approved leave must adjust or remove the time requirement according to its duration.

### 6.6 Evaluation Workflow

1. HR must create an evaluation period and assign employees and reviewers.
2. The system must calculate the period's factual time, attendance, task, contribution, leave, WFH, and remark information.
3. The employee must complete self-evaluation when required.
4. The Team Lead must score and comment on the defined evaluation areas.
5. HR must review and publish the evaluation.
6. The employee must be able to view the published result while the system retains the inputs, weighting version, reviewer, and publication history.

## 7. Data Requirements

### 7.1 Core Entities

| Domain | Required entities |
|---|---|
| Access | User, Role, Permission, UserRole, LoginHistory, Session/AuthenticationEvent |
| Organization | Employee, Division, EmployeeDivisionAssignment, Team, WorkPolicy, HolidayCalendar |
| Work | Project, ProjectMember, Task, TaskMember, TaskChecklistItem |
| Time | TimeEntry, TimerSession, DailyBreak, DailySummary, TimesheetPeriod, Verification/Amendment |
| HR | LeaveRequest, WFHRequest, AttendanceDay, EvaluationPeriod, Evaluation, EvaluationResponse, GeneralRemark |
| Finance/reporting | CostRate, Budget, PayrollPeriod, ReportDefinition, ReportExport |
| Collaboration | Document, DocumentVersion, Message, Comment, Announcement, Notification, Attachment |
| Control | AuditLog, IntegrationConnection, WebhookDelivery, PolicyVersion |

### 7.2 Relationship and Integrity Rules

- `REQ-DATA-001`: Every time entry must belong to one employee and one division and may belong to an authorized project and task consistent with that division.
- `REQ-DATA-002`: An employee-division assignment must be effective on the work date for new time to be accepted.
- `REQ-DATA-003`: A task linked to a time entry must belong to the selected project and division.
- `REQ-DATA-004`: Daily summaries must be reproducible from source entries, daily break, work policy, leave, holidays, and the applicable policy version.
- `REQ-DATA-005`: Cost rates must be effective-dated and access-restricted so historical reports use the rate applicable to the reported work date or configured payroll policy.
- `REQ-DATA-006`: Attachments must identify their owning record, uploader, access scope, upload timestamp, media type, size, and integrity reference.
- `REQ-DATA-007`: Deactivation must preserve historical relationships, while hard deletion must be limited to legally permitted, unreferenced data through an audited administrative process.
- `REQ-DATA-008`: All business records must store created/updated timestamps and actor identity; sensitive state changes must additionally store reason and before/after values.

## 8. Navigation Requirements

- `REQ-NAV-001`: Employee navigation must include Dashboard, My Timesheet, My Tasks, My Divisions, WFH, Leave, My Evaluation, Documents, Messages, Notifications, and Profile when the relevant modules are enabled.
- `REQ-NAV-002`: Team Lead navigation must include Dashboard, Employees, Team Timesheets, Projects, Tasks, Workload, WFH Requests, Leave Requests, Evaluations, Reports, Documents, and Messages when enabled.
- `REQ-NAV-003`: HR navigation must include HR Dashboard, Employees, Attendance, Timesheets, WFH, Leave, Evaluations, Reports, Documents, and Settings when enabled.
- `REQ-NAV-004`: Finance navigation must include Finance Dashboard, Employee Hours, Overtime, Project Costs, Division Costs, Payroll Reports, and Financial Reports when enabled and authorized.
- `REQ-NAV-005`: Navigation must hide unauthorized modules and must also enforce authorization at the server/API layer.

## 9. Non-Functional Requirements

### 9.1 Security, Privacy, and Audit

- `REQ-NFR-SEC-001`: The system must enforce role-, division-, project-, record-, and field-level authorization on every protected request.
- `REQ-NFR-SEC-002`: The system must support secure login, configurable password policy, two-factor authentication, session management, and login history.
- `REQ-NFR-SEC-003`: Data must be encrypted in transit and sensitive data, credentials, and backups must be encrypted at rest.
- `REQ-NFR-SEC-004`: Salary, cost, evaluation, export, and government-project information must be denied by default and granted only through explicit permissions.
- `REQ-NFR-SEC-005`: Audit logs must be append-only for application users and must cover login events, record changes, approvals, overrides, verifications, permission changes, integration changes, file access, and exports.
- `REQ-NFR-SEC-006`: The system must apply configurable data-retention and deletion policies while preserving records required for payroll, audit, legal, and historical reporting.
- `REQ-NFR-SEC-007`: Logs, notifications, analytics, and error messages must not disclose passwords, tokens, salary/cost data, private evaluations, or unauthorized record content.

### 9.2 Performance and Availability

- `REQ-NFR-PERF-001`: Under the agreed production load, 95 percent of normal interactive read requests must complete within 2 seconds and write requests within 3 seconds, excluding file transfer and report generation.
- `REQ-NFR-PERF-002`: Dashboard and standard filtered report requests must complete within 5 seconds for an agreed normal reporting period and data volume.
- `REQ-NFR-PERF-003`: Long-running exports must execute asynchronously, show progress/status, and notify the requester when ready or failed.
- `REQ-NFR-PERF-004`: Timer capture and saved time data must remain consistent after refresh, reconnect, retry, or duplicate client submission.
- `REQ-NFR-PERF-005`: Production availability, recovery-time objective, and recovery-point objective must be agreed before go-live and verified through an operational test.

### 9.3 Backup and Recovery

- `REQ-NFR-BACKUP-001`: The system must perform automated, monitored backups of application data and protected file metadata/content according to the approved retention schedule.
- `REQ-NFR-BACKUP-002`: Backup restoration must be tested before production launch and at a defined recurring interval.
- `REQ-NFR-BACKUP-003`: Recovery procedures must document responsible roles, recovery order, verification steps, and communication paths.

### 9.4 Accessibility and Responsive Use

- `REQ-NFR-UX-001`: The product must support current mobile-phone, tablet, laptop, and desktop layouts without loss of core functionality.
- `REQ-NFR-UX-002`: Mobile users must be able to add time, operate timers, view time/tasks/remarks/notifications, upload files, request WFH, and apply for leave.
- `REQ-NFR-UX-003`: User interfaces must meet WCAG 2.2 AA requirements for keyboard access, focus visibility, semantics, contrast, error identification, and non-colour status communication.
- `REQ-NFR-UX-004`: Date, time, duration, status, and calculation messages must be presented consistently and in plain language.

### 9.5 Maintainability and Observability

- `REQ-NFR-OPS-001`: Working-hour, overtime, evaluation, holiday, and notification policies must be configurable and versioned rather than embedded only in application code.
- `REQ-NFR-OPS-002`: The system must provide structured operational logs, error monitoring, job monitoring, and integration-delivery diagnostics without exposing restricted data.
- `REQ-NFR-OPS-003`: Calculation logic used by entry views, dashboards, reports, exports, evaluations, and APIs must have a single authoritative implementation or contract.
- `REQ-NFR-OPS-004`: Public APIs and webhooks must be documented, versioned, authenticated, rate-limited, and backward-compatible within their published version.

## 10. Delivery Phases

| Phase | Required outcome |
|---|---|
| Phase 1 - Core System / MVP | Identity and roles, five initial divisions, employees and assignments, projects/basic tasks, timesheets and timers, calculations/validation, work locations, remarks/corrections, core dashboards, basic reports and exports. |
| Phase 2 - HR and Evaluation | Leave, WFH request decisions, evaluations, workload planning, notifications, Finance reports, project costing, and improved mobile workflows. |
| Phase 3 - Collaboration | Division/project/direct messages, task comments, documents, knowledge base, announcements, and advanced search. |
| Phase 4 - Advanced Features | AI summaries, workload forecasting, anomaly detection, automated monthly summaries, natural-language reporting, and payroll/accounting integrations. |

### 10.1 MVP Exit Checklist

- [ ] Employees can belong to and record authorized time for multiple divisions.
- [ ] Time can be linked to a division, project, and task and includes completed-work details.
- [ ] Office, WFH, Hybrid, Field Work, Client Office, Official Travel, and Training Venue are supported.
- [ ] Seven active hours plus a separate one-hour break produces a complete eight-hour day.
- [ ] Under-time, overtime, critical, missing, and normal states are calculated consistently.
- [ ] Overtime and critical explanations/notifications follow the defined thresholds.
- [ ] Team Leads can review time and request corrections without daily approval.
- [ ] HR can verify a monthly/payroll period and audited amendments are supported.
- [ ] Core employee, Team Lead, HR, and Finance summaries are permission-correct.
- [ ] Authorized reports can be filtered and exported to Excel, CSV, PDF, and print.
- [ ] Security, audit, responsive use, accessibility, backup, and restoration acceptance tests pass.

## 11. Dependencies and Constraints

- The product owner must supply the authoritative employee list, division membership, Team Lead mapping, holiday calendars, employment schedules, leave balances, and initial projects.
- HR must approve the work-policy definitions, payroll periods, verification process, leave rules, and retention periods.
- Finance must approve cost-rate handling, billable classifications, budget rules, payroll export fields, and permissions before Finance features are released.
- Security owners must approve authentication, 2FA, government-project access, audit retention, backup, and integration credential handling.
- Email, calendar, storage, conferencing, biometric, payroll, accounting, SSO, webhook, or automation capabilities depend on approved external accounts and provider APIs.
- Exact production volume, availability, RTO, RPO, retention, and regional privacy obligations must be confirmed before production architecture and go-live approval.

## 12. Assumptions and Decisions

- The five named divisions are configurable seed records, not hard-coded permanent limits.
- The standard policy is a five-day week with 7 active hours and 1 break hour per full day; authorized employee/work-policy overrides may define part-time or special schedules.
- Both the 7-hour active threshold and 8-hour total threshold must be satisfied for a normal full day.
- Break is a daily value displayed separately; individual work entries contribute active time and do not each receive an additional break.
- Daily Team Lead approval does not exist. Team Leads perform exception-based review, and HR performs period verification.
- Team Leads make the primary WFH and leave decision for assigned employees; HR may oversee and override with a reason and audit trail.
- Employees and assignments referenced by historical records are deactivated, not physically deleted.
- `Verified` refers to HR period verification and does not imply that Team Leads approved every entry.
- Costs and salaries are optional protected data even for Finance users and require explicit permission.
- All stored timestamps use a consistent canonical representation and are displayed/calculated using the configured business timezone.
- Technical framework, database engine, cloud provider, and deployment topology are intentionally not prescribed by this requirements document.

## 13. Risks and Mitigations

| Risk | Impact | Required mitigation |
|---|---|---|
| Incorrect cross-division aggregation | Payroll and reporting errors | Use one authoritative calculation contract and automated boundary tests. |
| Ambiguous break handling | False under-time/overtime results | Store and display one recognized daily break separately from active entries. |
| No daily approval misunderstood as no control | Unverified data reaches Finance | Use exception review, HR period verification, locks, and audited amendments. |
| Excessive permissions | Exposure of government, salary, cost, or evaluation data | Deny by default and test role-, scope-, and field-level access. |
| Retrospective policy changes | Historical totals change unexpectedly | Version policies and bind verified periods to the applied version. |
| Timer/network retries | Duplicate or lost time | Make timer/save operations idempotent and recoverable. |
| Scope growth into collaboration suite | MVP delay | Enforce phase boundaries and treat Phase 3/4 features as deferred. |
| Poor source data | Incorrect assignments and reports | Validate and obtain owner sign-off on migrated/seed data. |

## 14. Acceptance and Verification

### 14.1 Calculation Scenarios

- `AC-CALC-001`: Given 3 hours for PowerInAI, 2 hours for Government Projects, 2 hours for WesternCF, and a 1-hour break, the system must show 7 active hours, 1 break hour, an 8-hour total, Complete status, and the three division contributions.
- `AC-CALC-002`: Given 6 hours 59 minutes active work and a 1-hour break on a standard day, the system must show Under-time.
- `AC-CALC-003`: Given 7 hours 1 minute active work and a 1-hour break, the system must show an 8-hour 1-minute total, require an overtime reason, and show Overtime.
- `AC-CALC-004`: Given a total of exactly 12 hours, the system must show Overtime; given 12 hours 1 minute, it must require an explanation, show Critical, and notify the Team Lead and HR.
- `AC-CALC-005`: Given valid entries in two divisions that overlap in clock time, the system must reject the conflict even though the divisions differ.
- `AC-CALC-006`: Given approved full-day leave or an applicable holiday, the system must not show a missing timesheet for that date.
- `AC-CALC-007`: Given half-day leave, the system must use the proportionally adjusted daily requirements.

### 14.2 Authorization Scenarios

- `AC-AUTH-001`: An employee must not retrieve another employee's timesheet, evaluation, salary, or cost data through navigation, direct URL, search, export, or API.
- `AC-AUTH-002`: A Team Lead must access only assigned employees, divisions, and projects unless a broader permission is granted.
- `AC-AUTH-003`: A Finance user without cost permission must see verified hours but must not see cost rates, salaries, or calculated labour costs.
- `AC-AUTH-004`: An unauthorized user must not discover government-project records or documents through counts, notifications, search results, filenames, or exports.
- `AC-AUTH-005`: A view-only user must be unable to modify data through either the user interface or API.

### 14.3 Workflow and Audit Scenarios

- `AC-WF-001`: A valid employee entry must save without Team Lead approval and must immediately update authorized summaries.
- `AC-WF-002`: A correction request, employee amendment, and clarification must remain connected and visible in the record history.
- `AC-WF-003`: HR verification must lock or version the period; any later amendment must require authorization, reason, and before/after audit evidence.
- `AC-WF-004`: An approved WFH request must update attendance context but must not create hours automatically.
- `AC-WF-005`: A calendar integration must create a draft that is excluded from totals until the employee confirms and saves it.
- `AC-WF-006`: Every protected export must appear in export history with requester, filters, format, timestamp, and status.

### 14.4 Reporting and Quality Scenarios

- `AC-RPT-001`: Employee-, division-, project-, and task-based reports for the same filters must reconcile to the same active-time total.
- `AC-RPT-002`: Dashboard, report, export, and evaluation totals must reconcile for the same employee, period, timezone, and policy version.
- `AC-RPT-003`: Excel, CSV, PDF, and print outputs must contain the requested filters, reporting period, generation timestamp, and only authorized fields and rows.
- `AC-QUAL-001`: Core employee and reviewer workflows must operate at supported mobile, tablet, laptop, and desktop widths without clipped controls or horizontal page scrolling except for intentionally scrollable data tables.
- `AC-QUAL-002`: Keyboard-only and screen-reader testing must validate WCAG 2.2 AA behavior for authentication, time entry, timer, requests, remarks, reports, and navigation.
- `AC-QUAL-003`: A production-like backup must be restored and reconciled before go-live.

## 15. Source Coverage Matrix

| Source section | Covered by this document |
|---|---|
| 1. System Purpose | Sections 1-3 |
| 2. User Roles | Section 4 |
| 3. Employee and Division Management | Section 5.1 |
| 4. Timesheet Management | Sections 3 and 5.3 |
| 5. Project and Task Management | Section 5.2 |
| 6. Remarks | Section 5.4 |
| 7. Timesheet Review and Correction | Sections 5.4 and 6.2-6.3 |
| 8. Work From Home Management | Sections 5.5 and 6.5 |
| 9. Employee Dashboard | Section 5.7 |
| 10. Team Lead Dashboard | Section 5.7 |
| 11. HR Dashboard | Section 5.7 |
| 12. Finance Dashboard | Section 5.7 |
| 13. Employee Evaluation | Sections 5.8 and 6.6 |
| 14. Reports | Section 5.9 |
| 15. Workload Planning | Section 5.10 |
| 16. Notifications | Section 5.11 |
| 17. Leave and Attendance | Section 5.6 |
| 18. Documents and Knowledge | Section 5.12 |
| 19. Communication | Section 5.13 |
| 20. Security and Permissions | Sections 4 and 9.1 |
| 21. Mobile Access | Section 9.4 |
| 22. Search | Section 5.14 |
| 23. Integrations | Section 5.15 |
| 24. Recommended Navigation | Section 8 |
| 25. Core Workflows | Section 6 |
| 26. Core Database Entities | Section 7 |
| 27. Development Phases | Section 10 |
| 28. Core MVP Requirements | Sections 2.2 and 10.1 |

## 16. Requirement Governance

- Every change to a `REQ-*` business requirement must be reviewed by the product owner and the responsible business stakeholder.
- Changes affecting time, break, overtime, leave, attendance, verification, payroll, or evaluation calculations must include updated examples and regression acceptance criteria.
- Changes affecting permissions, government-project data, salary, cost, evaluations, exports, or integrations must receive a security review.
- A delivery phase is accepted only when its applicable requirements and acceptance scenarios are implemented, tested, documented, and approved by the designated business owners.
