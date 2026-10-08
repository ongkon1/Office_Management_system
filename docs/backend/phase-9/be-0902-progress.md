# BE-0902 Verification — Frontend Service Cutover

## Status

`BE-0902` is **complete**. Every production frontend contract within this task now resolves through an authenticated server boundary backed by MySQL. Fixture and mock adapters remain available only through Vitest aliases and explicit development-demo composition.

## Completed cutovers

| Surface | Browser adapter | Server boundary |
|---|---|---|
| Timesheet day/week/month, work-log CRUD/preview/copy/history, task transitions | `src/services/server/timesheet.ts` | `/api/time` |
| HR attendance, WFH/leave administration, holidays, and evaluations | `src/services/server/hr.ts` | `/api/hr` |
| Shared report catalogue, previews, exports, history, and retry | `src/services/server/reporting.ts` | `/api/reporting` |
| Finance periods, dashboard, hours, overtime, cost, billable, payroll, reports, and exports | `src/services/server/finance.ts` | `/api/reporting` |
| Super Administrator branding, divisions, users/roles, work-policy view, notification settings, audit log, and integration catalogue | `src/services/server/admin.ts` | `/api/admin` |
| Employee task list/detail/checklist, division assignments, and remarks | `src/services/server/employee.ts` | `/api/employee` |
| Employee profile reads and durable self-service edits | `src/services/server/profile.ts` | `/api/profile` |
| Employee-raised task options/create and Team Lead task-review queue/decision | `src/services/server/task-review.ts` | `/api/task-review` |
| Notifications, authorized search, documents, messages, WFH/leave self-service, and self-evaluation | `src/services/server/workspace.ts` | `/api/workspace` |
| Team Lead dashboard, members, timesheets, remarks, projects, tasks, requests, workload, and evaluations | `src/services/server/operations.ts` | `/api/operations` |
| HR dashboard, employee and assignment administration, and payroll-period workspace | `src/services/server/hr.ts` plus `src/services/server/operations.ts` | `/api/hr` and `/api/operations` |
| Employee and Management dashboards | `src/services/server/operations.ts` | `/api/operations` |
| Effective work-entry division, project, and task options | `src/services/runtime/organization.ts` → `src/services/server/operations.ts` | `/api/operations` |

All adapters use same-origin requests, `credentials: include`, `cache: no-store`, and the existing shared `Result<T>` values. The server continues to derive identity from the HttpOnly session cookie; a submitted `userId` is checked against the authenticated actor by the compatibility view service and is never trusted as identity.

Runtime composition under `src/services/runtime/` uses server adapters in production. Vitest replaces those modules with deterministic adapters under `src/test/runtime/`, preserving component-test determinism without allowing fixture data into a production bundle.

## Scope boundaries

Requisition, conveyance, Meeting Minutes, the remaining organization-hierarchy cutover gate, and Client Panel have their own milestones and are not counted as BE-0902 work. Completing this task does not mark those milestones complete.

The consolidated operations boundary accepts only an explicit method allowlist, rejects cross-origin and malformed requests, derives identity from the HttpOnly session cookie, applies authorization before returning records or options, uses `private, no-store` responses, and converts infrastructure failures to safe `Result<T>` values. Work-entry choices are loaded as one date-aware snapshot from the same repository context used by authoritative work-log validation.

## Verification runs

### 2026-10-08 completion

- Production data-boundary audit passed with no direct fixture or mock-service imports. The final violation in the HR employee screen was moved to the approved demo-context boundary.
- TypeScript compilation and Next.js route generation passed.
- ESLint completed with no BE-0902 warnings or errors. One pre-existing `session-provider.tsx` dependency warning remains outside this task.
- Focused work-log, browser-transport, and operations HTTP tests passed: 22/22.
- Full frontend/shared suite passed: 56 files, 948/948 tests.
- Full backend suite passed: 44 files, 421/421 tests.
- Next.js 16.3.4 production build passed, including dynamic `/api/operations` alongside the existing authenticated API routes.
- The production work-log form no longer reads empty compatibility selectors: it loads authorized effective divisions, active time-accepting projects, and assigned eligible In Progress tasks from MySQL for the selected employee and local date.

### 2026-10-04 incremental cutover

- Migration `0012_frontend_cutover_preferences.sql` and matching recovery script validated; the migration was applied to the local database.
- TypeScript compilation passed after adding the Admin, Workspace, Profile, Employee, and Task Review boundaries.
- Targeted ESLint passed for the Admin, Workspace, Profile, Employee, and Task Review boundaries.
- Focused browser-transport, authentication, workspace, and task-review suites passed: 4 files, 108 tests.
- Next.js 16.3.4 production build passed and includes dynamic `/api/admin`, `/api/employee`, `/api/profile`, `/api/task-review`, and `/api/workspace` routes. The sandboxed attempt could not fetch DM Sans; the approved network-enabled rerun passed.
- The full repository suite ran 909 tests: 904 passed and 5 frontend tests still failed (three work-log drawer checks, one department-dialog timeout, and one Meeting Minutes retry assertion). Those failures remain recorded rather than being hidden by a completion claim.

### 2026-09-30 initial cutover

- TypeScript compilation passed.
- Targeted ESLint passed.
- Existing affected frontend tests: 5 files, 74 tests passed.
- Browser transport tests: 2/2 passed.
- Backend API boundary tests: 4 files, 25 tests passed.
- Next.js 16.3.4 production build passed and retained dynamic `/api/time`, `/api/hr`, and `/api/reporting` routes.

The first build attempt could not reach Google Fonts from the restricted environment; the approved network-enabled rerun completed successfully. No database migration or seed was run.
