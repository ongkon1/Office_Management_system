# Product Feature Catalogue

## Multi-Division Employee Timesheet and Work Management System

**Product:** PowerInAI Office Management System  
**Application type:** Single Next.js application with MySQL  
**Business timezone:** Asia/Dhaka  
**Currency:** BDT  
**Document purpose:** A plain-language catalogue of the product's full approved feature set and its current delivery status.

> This document summarizes features. `project_requirement.md` remains the authoritative source for business requirements, permissions, calculations, and acceptance criteria. A feature marked **Planned** must not be presented as currently available.

## 1. Product Overview

The product provides one secure workspace for employee administration, organizational structure, projects, tasks, work logging, attendance, HR workflows, evaluations, financial reporting, requests, documents, notifications, and management reporting across multiple divisions.

Initial divisions are:

- PowerInAI
- PowerInAI Training
- Government Projects
- Computer Jagat
- WesternCF

These are seed records, not permanent hardcoded limits. Super Administrators can maintain the division catalogue.

## 2. Feature Status Legend

| Status | Meaning |
|---|---|
| Available | Implemented in the application and backed by the current frontend/backend delivery records. |
| Partially available | A usable portion exists, but a documented milestone, operational exercise, or cutover task remains. |
| Planned | Approved and documented, but its required frontend or backend milestone is not complete. |

## 3. User Roles

### Super Administrator

- Manages users, roles, permissions, divisions, departments, department leads, policies, holidays, integrations, branding, and administrative settings.
- Can create users with an initial password and assign Employee, Team Lead, HR Manager, Management/View-Only, or Super Administrator roles according to authorization rules.
- Can update an existing user's role and deactivate or remove access while preserving referenced operational history.
- Can manage projects and review organizational requests within authorized scope.
- Participates as a required reviewer for requisitions and conveyance claims.
- Can inspect protected audit and operational information when authorized.

### Team Lead

- Keeps all employee self-service capabilities, including personal tasks and My Timesheet.
- Manages work for employees in effective department scopes.
- Reviews employee-raised tasks, WFH requests, leave requests, workload, exceptions, and corrections.
- Creates tasks for team members or for themselves.
- Reviews requisitions and conveyance claims submitted by assigned employees.
- Can submit personal requisitions and conveyance claims without another Team Lead review.

### Employee

- Uses a personal dashboard, task board, work log, timesheet, profile, requests, remarks, documents, and notifications.
- Moves tasks through Pending, In Progress, and Completed.
- Logs duration-based active work against eligible In Progress tasks.
- Raises tasks for Team Lead review.
- Submits WFH, leave, requisition, and conveyance requests.
- Participates in evaluations and views authorized results.

### HR Manager

- Manages employee records, placements, attendance, WFH, leave, holidays, evaluations, payroll periods, and timesheet verification.
- Reviews organization-wide HR information within authorization boundaries.
- Participates in requisition and conveyance parallel review after Team Lead review.
- Uses reporting and export tools.
- Cost access remains an explicit per-user permission until the planned Client Panel cutover.

### Management/View-Only

- Receives authorized read-only dashboards and reports.
- Cannot mutate protected operational or financial records unless separately granted an approved capability.
- Cannot discover restricted government, employee, evaluation, attachment, cost, or audit information.

### Historical Finance Manager

- Finance Manager is retired as an active frontend role.
- Historical `finance_manager` records remain readable where required for audit and data compatibility.
- HR has absorbed the ordinary finance workflow, subject to the current permission model.

## 4. Authentication and Account Features

**Status: Available**

- Sign in with work email, employee ID, and password.
- Secure database-backed sessions.
- Remember-me behavior.
- Forgot-password and password-reset flows.
- User password change from personal settings.
- Account lockout and inactive-account handling.
- Two-factor authentication support.
- Login history and authentication-event auditing.
- Session expiry handling.
- Role-aware navigation and direct-route protection.
- Server-side authorization rather than UI-only hiding.
- User profile editing for all active users.
- Dynamic organization branding and logo management.
- Beta product indicator beside the brand logo.

## 5. Organization and Employee Management

**Status: Available; final hierarchy cutover verification remains**

- Division catalogue management.
- Division activation and deactivation while preserving history.
- Departments owned by one division.
- Department names and codes unique within their division.
- Department creation, editing, activation, and deactivation by Super Administrators.
- Effective-dated department Team Lead appointments.
- At most one effective lead per department at a time.
- One person may lead multiple departments.
- Employee placement through effective-dated division assignments.
- A department selection is required for each new active division assignment.
- Department options depend on the selected division.
- Cross-division department placement is rejected by both service and database constraints.
- Primary and secondary division assignments.
- Allocation percentages and expected weekly minutes.
- Placement history showing current, scheduled, ended, and department-transfer records.
- Employee directory with authorized search and filtering.
- Employee creation, editing, role assignment, password setup, activation, and deactivation.
- Referenced employees and organization records are deactivated instead of physically deleted.
- Department-scoped Team Lead authority is derived per request and does not create a permanent company-wide role.

## 6. Projects and Project Membership

**Status: Available**

- Create and maintain projects within authorized divisions.
- Active and inactive project states.
- Project manager assignment.
- Project team membership.
- Employee eligibility based on division assignments and project membership.
- Client or stakeholder attribution on projects.
- Government-project access restrictions.
- Project detail, task, contribution, and authorized reporting views.
- Deactivation rather than unsafe deletion when a project has operational references.
- Project management authority remains separate from department Team Lead authority.

## 7. Task Management

**Status: Available**

- Task creation by authorized Team Leads and administrators.
- Employee-raised task requests for Team Lead review.
- Team Lead self-task creation using the **Self (me)** assignee option.
- Task assignee and supporting-member management.
- Optional unassigned tasks produced by approved Meeting Minutes generation flows.
- Task priority, estimate, due date, project, division, and description.
- Three stored statuses: Pending, In Progress, and Completed.
- Derived All, Overdue, and Upcoming filters.
- Drag-and-drop task movement with equivalent keyboard/button controls.
- Optional note for Pending to In Progress and In Progress to Completed.
- Required reason for Completed to In Progress reopening.
- Required Team Lead note for direct Pending to Completed movement.
- Append-only transition history with separate transition timestamps.
- Task transitions never create active work time.
- Only eligible In Progress tasks accept work logs.
- Pending and Completed tasks reject new work until the correct transition occurs.
- Employee-raised tasks reject work until Team Lead endorsement.
- Actual hours are derived from work logs and compared with the unchanged estimate.
- Task filters including employee-name filtering for administrative views.

## 8. Task-Based Work Logging and Timesheets

**Status: Partially available; frontend flow and core backend exist, final backend cutover phases remain**

- Duration-based **Log Work** flow instead of requiring start and end times for new work.
- Work logging against an eligible In Progress task.
- Local work date, division, project, task, duration, location, description, and completed-work details.
- Active work recorded as integer minutes.
- Automatic immediate save rather than a timer-stop draft.
- Work-log editing with a required audit reason.
- Work-log correction and clarification history.
- Daily timesheet view.
- Employee period and calendar views.
- Division, project, task, client, and status attribution.
- Copy-previous-day assistance where valid.
- Live calculation preview before saving.
- Daily summaries update from the same authoritative calculation engine.
- Maximum 24 active hours on one local date.
- Approved leave, inactive projects, invalid assignments, locked periods, duplicate submissions, and other conflicts are rejected or explicitly flagged.
- Historical start/end clock records remain immutable and reproducible.
- New duration logs do not invent attendance ranges or apply overlap detection.

### Daily Time Policy

- Normal active work: 7 hours.
- Separate recognized break: 1 hour per day, never once per work log.
- Complete scheduled day: 8 total hours with both active and total thresholds met.
- Missing: no required work recorded.
- Under-time: either active or total requirement is unmet.
- Complete: both requirements are met at exactly the normal threshold.
- Overtime: above 8 hours through exactly 12 hours, with a required reason.
- Critical: above 12 hours, with explanation and Team Lead/HR notification.
- The standard work week is Sunday through Thursday.
- Friday and Saturday are default weekly holidays, subject to effective-dated calendar and policy overrides.

## 9. Timesheet Review, Corrections, and Payroll Verification

**Status: Available**

- Team Lead view of assigned employees' daily summaries and exceptions.
- Missing, under-time, overtime, critical, task, workload, and estimate-variance review.
- General remarks and correction requests.
- Employee amendment or clarification while preserving history.
- No daily Team Lead approval state or approval button.
- HR period selection and review.
- HR monthly verification before payroll and formal reporting.
- Verified-period locking and policy-version preservation.
- Audited unlock or amendment process for post-verification changes.
- Reproducible historical totals.

## 10. Dashboards

**Status: Available**

### Employee Dashboard

- Today's active work, break, total, remaining time, and status.
- Task and deadline summary.
- Division contribution.
- WFH, leave, attendance, notification, and evaluation summaries.

### Team Lead Dashboard

- Department-scoped team overview.
- Team-member list with department filter.
- Missing, under-time, overtime, and critical exceptions.
- Workload and task visibility.
- Pending WFH, leave, task, requisition, conveyance, and correction work.

### HR Dashboard

- Employee and attendance overview.
- Missing-time and exception monitoring.
- WFH, leave, holiday, evaluation, and payroll-period information.
- Verification and reporting status.

### Management Dashboard

- Authorized read-only organizational summaries.
- Division, project, utilization, attendance, and performance indicators without restricted detail leakage.

## 11. WFH, Leave, Holidays, and Attendance

**Status: Available**

- Employee WFH requests.
- Employee full-day and partial-day leave requests.
- Team Lead as primary reviewer.
- Approve, reject, or request-more-information decisions.
- HR oversight and audited override authority.
- Request history and status notifications.
- Approved WFH changes attendance context but does not create work hours.
- Approved leave adjusts the day's expected requirement.
- Attendance-day calculation from policy, holidays, leave, WFH, and work results.
- Missing-time detection and scheduled processing.
- Configurable holiday calendar.
- Friday and Saturday weekly holidays by default.
- Effective-dated policy and calendar overrides.

## 12. Workload Planning

**Status: Available**

- Team workload overview.
- Planned effort and task allocation.
- Employee availability and expected weekly capacity.
- Over-allocation and under-allocation indicators.
- Department-scoped Team Lead filtering.
- Project and task context.
- Actual-versus-estimated work comparison.

## 13. Employee Evaluations

**Status: Available**

- Evaluation-period creation and management.
- Employee and reviewer assignment.
- Self-evaluation.
- Team Lead scoring and comments.
- HR review and publication.
- Time, attendance, task, contribution, leave, WFH, and remark evidence.
- Versioned weights and scoring configuration.
- Published evaluation access for the employee.
- Protected evaluation visibility and audit history.

## 14. General Remarks and Corrections

**Status: Available**

- One general remark type throughout the product.
- Remarks linked to the relevant employee, date, or operational context.
- Team Lead correction requests.
- Employee clarification and amendment responses.
- Status and history tracking.
- Audit evidence for sensitive changes.

## 15. Requisitions

**Status: Available**

- In-house and New requisition types.
- Item, purpose, urgency, model, last-recovery date where applicable, and exact approximate BDT amount.
- Employee submission to the effective Team Lead.
- Team Lead personal submission directly to HR and Super Administrator.
- Shared approval workflow with append-only decisions.
- HR and Super Administrator parallel approval.
- Approval requires both parallel reviewers.
- Any rejection is terminal and requires a reason.
- Submitter withdrawal before a final decision.
- Automatic rerouting when the effective Team Lead changes.
- Audited escalation when no Team Lead remains.
- Safe notifications without unauthorized field disclosure.
- Identical not-found behavior for unauthorized and nonexistent requests.

## 16. Conveyance Claims

**Status: Available**

- Work-travel claim submission by Employees and Team Leads.
- Business, client, visited date/time, travel mode, description, and exact BDT amount.
- Travel modes: Self, Uber, and Other.
- Required description for Other.
- Server-assigned submission timestamp.
- Rejection of future visited dates/times.
- Employee submission to effective Team Lead.
- Team Lead personal submission directly to HR and Super Administrator.
- Shared requisition/conveyance approval engine.
- Parallel HR and Super Administrator approval.
- Rejection with reason and submitter withdrawal.
- Optional JPEG, PNG, or PDF receipt up to the configured size limit.
- Protected receipt upload with checksum, type validation, malware scan, and private storage.
- Separate absent, processing, attached, rejected, and restricted receipt states.
- Claim-bound receipt visibility.
- Authorized streamed or short-lived downloads.
- Audit record for every protected receipt download.
- Receipt immutability after it is bound to a claim.

## 17. Reporting and Exports

**Status: Available**

- Employee, division, department, project, task, attendance, leave, WFH, overtime, utilization, evaluation, and financial report families.
- Shared filters for period and authorized organizational dimensions.
- Client-based time filtering from project attribution.
- Report totals use authoritative work calculations.
- Authorization before rows, counts, filters, or totals are produced.
- Excel, CSV, PDF, and print experiences where supported by the report definition.
- Export history with requester, filters, format, timestamp, and status.
- Protected asynchronous export processing.
- Restricted fields are omitted or explicitly marked Restricted, never represented as zero.
- Reconciliation across dashboards, reports, exports, and verified periods.

## 18. Finance and Labour Cost

**Status: Available under current explicit permissions; role-wide access change is planned**

- Verified-period hours review.
- Overtime analysis.
- Division and project contribution reporting.
- Billable and non-billable analysis.
- Effective-dated internal cost rates.
- Budget and variance reporting.
- Payroll-ready exports.
- Exact money calculations using fixed-precision decimal values.
- Type-level redaction for users without `finance.cost.view`.
- Current access is granted per user.
- Planned Phase 14 will grant cost access through HR Manager and Super Administrator roles as one coordinated cutover.

## 19. Notifications

**Status: Available**

- In-application notification centre.
- Unread counts and read state.
- Safe deep links to authorized records.
- WFH, leave, task review, correction, evaluation, requisition, conveyance, announcement, and operational notifications.
- Deduplication and occurrence keys.
- Notification creation only after live record authorization.
- Safe templates that exclude protected details.
- Scheduled notification and delivery support.

## 20. Documents, Files, and Knowledge

**Status: Available**

- Document library.
- Company, division, and project scope.
- Categories and descriptions.
- Link-based and file-based document versions.
- Version history and change notes.
- Protected private file storage.
- Upload size/type validation, checksums, scan states, and storage adapters.
- Authorized streaming or short-lived downloads.
- Download auditing.
- Government and protected sensitivity controls.
- Deactivation rather than destructive deletion.

## 21. Communication

**Status: Available behind an administrative module switch**

- Division channels.
- Direct conversations.
- Task comments.
- Mentions.
- Announcements and pinned messages.
- Scope-based membership and authorization.
- Government-project restrictions.
- Administrative enable/disable control with audit reason.

## 22. Search

**Status: Available**

- Authorized global search.
- Search across supported employees, projects, tasks, documents, and operational records.
- Direct links to accessible results.
- Authorization before indexing results are returned or counted.
- Restricted records, names, counts, empty groups, and timing remain undiscoverable.

## 23. Integrations and External Interfaces

**Status: Available as provider-neutral foundations; individual integrations require configuration**

- Versioned API endpoints.
- Secure webhook delivery foundation.
- OAuth callback foundation.
- Integration configuration administration.
- Calendar-import drafts that do not affect totals until confirmed.
- Payroll/export integration boundaries.
- Provider-neutral email delivery.
- Durable background job support.
- Feature/module switches for integrations not enabled in production.
- Audit and retry behavior for external operations.

## 24. Meeting Minutes and AI Task Generation

**Status: Partially available; frontend is in progress and backend Phase 13 is planned**

- Meeting Minutes navigation for all active roles.
- Authorized create, edit, archive, view, retry, and processing controls.
- Client and dependent active-project selection.
- Long-form meeting-minute content.
- Save without AI as Not Processed.
- Optional Process with AI action.
- Original minute preserved before processing begins.
- Processing states: Not Processed, Pending, Processing, Processed, and Failed.
- Planned durable, idempotent background processing.
- Planned provider-neutral structured AI output.
- Planned extraction of multiple task proposals.
- Planned validation, normalization, and duplicate prevention.
- Planned employee matching limited to eligible project members.
- Planned unassigned fallback when no safe employee clears the threshold.
- Planned generated-task provenance and reciprocal minute/task links.
- Planned protected diagnostics, retry, dead-letter, and operational monitoring.

## 25. Client Panel

**Status: Planned — Frontend Phase 12 and Backend Phase 14**

- `/clients` route for HR Managers and Super Administrators only.
- Latest HR-verified payroll period selected by default.
- Flat table with Client, Employee, Active Hours, and Internal Labour Cost.
- Payroll-period, client, and employee filters.
- Sorting, pagination, summary totals, and clear-all filters.
- One row per authorized client-employee pair.
- Active work only; breaks and task transitions excluded.
- Cost from active minutes multiplied by the effective internal cost rate.
- **Not assigned to a client** group for unmapped work.
- Government-project and other authorization applied before aggregation.
- Excel, CSV, PDF, and print outputs with filters and generation metadata.
- Reconciliation with authoritative time and protected financial reports.
- Coordinated role-based `finance.cost.view` migration for HR and Super Administrator.

## 26. Administration

**Status: Available**

- User administration.
- Initial user password assignment.
- Role assignment and role changes.
- Account activation and deactivation.
- Division administration.
- Department and department-lead administration.
- Work-policy administration.
- Holiday-calendar administration.
- Role and permission views.
- Integration and module settings.
- Dynamic logo and branding settings.
- Audit-log access under protected authorization.
- Operational dependency and health visibility.

## 27. Security, Privacy, and Audit

**Status: Available; production operational exercises remain in Phase 8**

- Deny-by-default access for government, salary, cost, evaluation, export, attachment, and audit data.
- Session-derived actor identity; client-supplied identity is not trusted.
- Role, division, department, project, record, and field-level authorization.
- Authorization before aggregation.
- Same not-found response for unauthorized and nonexistent records.
- Append-only audit evidence for sensitive decisions.
- Before/after values and reasons where required.
- Immutable review history for approval workflows.
- Idempotency and concurrency protection on important writes.
- Secure cookie and request-boundary controls.
- File integrity and malware-scanning integration.
- Production data-boundary checks preventing fixture/mock imports.
- Protected secrets and environment configuration.
- Privacy-aware notifications, exports, searches, and error responses.

## 28. Responsive Design and Accessibility

**Status: Available; final visual-review item remains**

- Modern responsive SaaS interface.
- Desktop, laptop, tablet, and mobile layouts.
- No page-level horizontal scrolling except intentional data-table regions.
- Responsive tables with mobile alternatives where required.
- Keyboard-accessible controls and task-transition alternatives.
- Visible field labels and field-level corrective guidance.
- Screen-reader structure and live feedback.
- Focus trapping and restoration for overlays.
- Reduced-motion support.
- Minimum effective target sizes.
- WCAG 2.2 AA contrast and interaction targets.
- Status communicated by text and shape in addition to colour.
- Centralized date, time, duration, money, percentage, and status formatting.

## 29. Operations, Health, Backup, and Reliability

**Status: Partially available; target-environment drills and approvals remain**

- `/api/health` application, database, and schema checks from the server.
- Migration status, validation, forward migration, and recovery scripts.
- Separate runtime and migration database credentials.
- Structured audit and operational events.
- Observability and dependency checks.
- Cache and static security audits.
- Database backup and restore tooling.
- Object-storage backup and restore tooling.
- Load-test tooling.
- Controlled production import workflow with dry run, approvals, checksums, crosswalks, and guarded rollback.
- Remaining work includes production monitoring configuration, formal load targets, restore drills, and owner approvals.

## 30. Current Delivery Summary

| Area | Current status |
|---|---|
| Frontend foundations and role experiences | Available through Phases 0-8; final visual review and Phase 9 packaging remain. |
| Core backend through reporting/supporting services | Available through Backend Phase 7. |
| Backend hardening and production readiness | Partially available; operational tasks remain in Phases 8-9. |
| Requisition | Available; Backend Phase 10 complete. |
| Conveyance | Available; Backend Phase 11 complete. |
| Finance-to-HR backend consolidation | Planned; Backend Phase 12. |
| Meeting Minutes and AI tasks | Partially available; frontend incomplete and Backend Phase 13 planned. |
| Client Panel | Planned; Frontend Phase 12 and Backend Phase 14. |
| Task-based work-log replacement | Partially available; final backend cutover and verification remain. |
| Division-department-Team Lead hierarchy | Available; final cutover verification and dependent workflow tasks remain. |

## 31. Important Product Boundaries

- A task status change never records working time.
- A daily timesheet never requires Team Lead approval.
- One recognized daily break is not multiplied by the number of work logs.
- Historical clock entries remain immutable.
- Work time, task-transition time, attendance presence, and submission time are separate concepts.
- Estimates do not change when actual hours are recorded.
- Money never uses floating-point arithmetic.
- Restricted money is not represented as zero.
- Department leadership grants scoped capability, not a permanent organization-wide Team Lead role.
- Government-project and protected attachment access is always enforced by the service.
- Unfinished planned features must not be shown as production-ready.

## 32. Related Documents

- `project_requirement.md` — authoritative requirements and acceptance criteria.
- `frontend_milestone.md` — frontend tasks and completion status.
- `backend_milestone.md` — backend tasks and completion status.
- `modify_milestone.md` — task-based work-log replacement plan.
- `organization_hierarchy_milestone.md` — organization hierarchy model and cutover plan.
- `docs/architecture.md` — technical architecture and security boundaries.
- `MEMORY.md` — current project state and decision history.
