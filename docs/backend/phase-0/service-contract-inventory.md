# Backend Service Contract Inventory

Status: Backend Phase 0 baseline  
Owners: Frontend lead and backend lead  
Sources: `src/contracts/services.ts`, `src/contracts/results.ts`, `src/contracts/query.ts`, `src/contracts/view-models.ts`  
Tasks: `BE-0006`, `BE-0020`

## Contract rules

- The UI depends only on `ServiceRegistry`; it never receives repository or database records.
- Every operation resolves to `Promise<Result<T>>`. Expected failures are values, not thrown transport errors.
- Authorization and field redaction happen before a result reaches the UI. Unauthorized and nonexistent protected records share the same externally observable not-found behavior.
- List operations use `ListQuery` and return `Paginated<T>` unless the contract explicitly calls for a bounded list.
- Time and export mutations carrying `IdempotentInput` must preserve the same result for a repeated key and must not duplicate effects.
- View models are already authorized and presentation-ready. Domain calculations remain server-side and are never reconstructed by a component.

## Standard outcomes

| Result status | Backend meaning | UI contract |
|---|---|---|
| `success` | Operation completed | Consume `data` |
| `validation_failure` | Input failed domain or field validation | Display `message`, field `guidance`, and optional form summary |
| `permission_denied` | Authenticated caller lacks a general capability where revealing denial is safe | Show the explicit denied state |
| `unauthenticated` | Session is missing or no longer valid | Enter the authentication/session-expiry flow |
| `not_found` | Record is absent or its existence is protected from this caller | Use the same response shape and observable behavior in both cases |
| `conflict` | Current state prevents the mutation, including locked period or stale/concurrent state | Display the conflict code/message and recovery action |
| `error` | Unexpected or dependency failure | Show retry-safe generic feedback; correlate server detail outside the response |

## Query contract

`ListQuery<TFilters>` owns page, page size, sort, search, and typed filters. Services must validate bounds and allowed sort fields. Authorization filters are applied before counting, grouping, pagination, or aggregation. No adapter may return an unrestricted result and filter it in the UI.

## Service-to-use-case inventory

| Registry key / interface | Operations | Server-side use case and scope owner | Expected exceptional outcomes |
|---|---|---|---|
| `auth` / `AuthService` | `getSession`, `login`, `verifyTwoFactor`, `resendTwoFactorCode`, `requestPasswordReset`, `resetPassword`, `logout`, optional `switchDemoAccount` | Access module; public credential flows plus actor-owned session operations. Demo switching is development-only and absent in production. | validation, unauthenticated, conflict/rate-limit, error; reset/login responses must not enumerate accounts |
| `divisions` / `DivisionService` | `list`, `getById`, `create`, `update`, `setActive` | Organization module; administration mutation, authorized directory reads | validation, permission denied, protected not found, conflict |
| `employees` / `EmployeeService` | `list`, `getById`, `create`, `update`, `setStatus`, `listAssignments`, `createAssignment`, `updateAssignment`, `endAssignment`, `listEffectiveDivisions` | Organization module; self/team/HR/admin scope is date-effective; restricted employee fields are omitted or redacted | validation, permission denied, protected not found, assignment conflict |
| `projects` / `ProjectService` | `list`, `getById`, `create`, `update`, `setStatus`, `listSelectable` | Work module; one-division project scope and effective membership; selectable results accept time on the work date | validation, permission denied, protected not found, inactive/closed conflict |
| `tasks` / `TaskService` | `list`, `getById`, `create`, `update`, `setStatus`, `listChecklist`, `setChecklistItem`, `listSelectable` | Work module; project/team membership and task workflow scope | validation, permission denied, protected not found, state conflict |
| `timesheets` / `TimesheetService` | `getDay`, `getWeek`, `getMonth`, `listEntries`, `getDailySummaries`, `createEntry`, `updateEntry`, `deleteEntry`, `copyEntry`, `previewCalculation`, `setBreakOverride`, `getRunningTimer`, `startTimer`, `stopTimer`, `cancelTimer` | Time module; employee ownership/team/HR scope. Preview and persistence call the same pure calculation engine. Break is one daily value. Overlap checks span divisions. | validation, permission denied, protected not found, locked/stale/overlap/timer conflict, error |
| `teamTimesheets` / `TeamTimesheetService` | `listTeamDays`, `getEmployeeDay` | Time module; Team Lead authority is effective on the requested date and exception review is not daily approval | permission denied, protected not found, validation |
| `periods` / `PeriodService` | `list`, `getVerificationSummary`, `verify`, `requestUnlock`, `amend` | Time/HR module; HR period verification and authorized audited amendment | validation, permission denied, protected not found, locked/stale/idempotency conflict |
| `remarks` / `RemarkService` | `list`, `getById`, `create`, `respond`, `resolve` | Time collaboration module; one general remark model, optionally a correction request | validation, permission denied, protected not found, state conflict |
| `wfh` / `WfhService` | `list`, `getById`, `create`, `update`, `submit`, `cancel`, `decide`, `override` | HR workflow; employee ownership, effective Team Lead decision scope, authorized HR override | validation, permission denied, protected not found, workflow conflict |
| `leave` / `LeaveService` | `listRequests`, `getRequest`, `listBalances`, `create`, `submit`, `cancel`, `decide`, `override` | HR workflow; balance and private-record restrictions, effective Team Lead decision scope, authorized HR override | validation, permission denied, protected not found, balance/workflow conflict |
| `attendance` / `AttendanceService` | `list`, `getEmployeeMonth` | HR module; derived only from authoritative schedule, leave, holiday, WFH and time facts | permission denied, protected not found, validation |
| `holidays` / `HolidayService` | `list`, `create`, `update`, `setActive` | Organization/HR policy module; authorized reads and HR/admin mutation | validation, permission denied, protected not found, effective-date conflict |
| `workPolicies` / `WorkPolicyService` | `list`, `getEffective` | Organization/time policy module; date-effective, versioned lookup | permission denied, protected not found, configuration conflict |
| `workload` / `WorkloadService` | `listWeeks`, `getEmployeeWeek` | Workload module; authorized planned-versus-actual data, never a replacement for authoritative time | permission denied, protected not found, validation |
| `evaluations` / `EvaluationService` | `listPeriods`, `createPeriod`, `listEvaluations`, `getById`, `saveSelfEvaluation`, `submitSelfEvaluation`, `saveReviewerScores`, `submitReview`, `publish` | Evaluation module; employee/reviewer/HR workflow and field-level privacy | validation, permission denied, protected not found, workflow/stale conflict |
| `dashboards` / `DashboardService` | `getEmployeeDashboard`, `getTeamLeadDashboard`, `getHrDashboard`, `getFinanceDashboard`, `getManagementDashboard` | Reporting/query layer; pre-authorized materialized summaries and shared calculation results | unauthenticated, permission denied, validation, error |
| `reports` / `ReportService` | `listCatalogue`, `run` | Reporting module; permission-aware query plans over shared calculated results | validation, permission denied, protected not found, dependency error |
| `exports` / `ExportService` | `request`, `getStatus`, `listHistory`, `cancel`, `retry` | Reporting/jobs/files modules; durable idempotent generation and authorization recheck on download | validation, permission denied, protected not found, job-state conflict, dependency error |
| `notifications` / `NotificationService` | `list`, `getUnreadCount`, `markRead`, `markAllRead` | Notifications module; actor-owned records with safe payloads | unauthenticated, validation, protected not found, error |
| `search` / `SearchService` | `search` | Search module; authorization precedes matching, counts, snippets and pagination | validation, permission denied, dependency error |
| `documents` / `DocumentService` | `list`, `getById` | Files/collaboration module; company/division/project and government-project scope | permission denied, protected not found, dependency error |
| `audit` / `AuditService` | `list`, `getById` | Audit module; narrowly scoped sensitive reads, themselves audited | permission denied, protected not found, validation |

## Contract gaps and later-phase ownership

This inventory describes the implemented frontend boundary; it does not silently expand it. The following backend capabilities are named in requirements but do not yet have a dedicated frontend service method: role/grant administration, protected upload initiate/complete and download, notification preferences, document mutation/versioning, communication, integration administration, audit export, payroll configuration, and administrative policy management beyond holidays/work-policy reads. They must be added through reviewed contract changes in their owning frontend/backend phase, not exposed as database-shaped shortcuts.

The interfaces use broad `Partial<DomainType>` inputs in several update operations. Before implementing each mutation, its backend phase must replace or validate that surface with allow-listed command fields so callers cannot mass-assign protected, audit, identity, calculated, or workflow fields.

## Adapter acceptance checklist

For each real adapter replacing a mock operation:

1. Map the method to one application command/query and one authorization policy.
2. Validate the public input and reject unknown or immutable fields.
3. Apply row authorization before query aggregation and field authorization before mapping.
4. Map repository records into contract domain/view types; never return ORM entities.
5. Return the standard `Result<T>` value and stable error code.
6. Propagate actor, correlation, timezone, locale, policy version and idempotency context where applicable.
7. Cover allow, deny, not-found-equivalence, validation, conflict and dependency-failure tests.
