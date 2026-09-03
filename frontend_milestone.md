# Frontend Milestone Plan

## Multi-Division Employee Timesheet and Work Management System

| Field | Decision |
|---|---|
| Delivery strategy | Frontend first, backend second |
| Application model | One full-stack application, not separate frontend and backend projects |
| Framework | Next.js with the App Router and TypeScript |
| Database for backend phase | MySQL |
| Current milestone scope | Responsive frontend, realistic mock data, interactions, validation states, and backend-ready contracts |
| Requirements source | `project_requirement.md` |
| Design goal | Modern, premium, responsive, accessible, and efficient for data-heavy daily use |

## 1. Task Status Convention

Use exactly one status marker on every tracked task:

- `[ ]` Pending - work has not started.
- `[~]` In progress - work is actively being implemented or reviewed.
- `[x]` Done - work is implemented, checked, and satisfies its acceptance criteria.

Status rules:

- A task must have only one marker.
- Change `[ ]` to `[~]` when work starts.
- Change `[~]` to `[x]` only after visual, responsive, interaction, and acceptance checks pass.
- If a completed task needs material rework, return it to `[~]`.
- Phase progress is based on completed tasks, not elapsed time.
- A phase is complete only when its exit criteria are satisfied.

## 2. Frontend Delivery Principles

### 2.1 Single-Application Architecture

- The project will remain one Next.js codebase through frontend and backend delivery.
- The frontend phase will use typed fixture data and a mock data-access layer rather than a separate mock server.
- UI components must not import fixture files directly. Pages and feature modules must consume data through typed service/repository interfaces so the later MySQL implementation can replace the mock adapters without redesigning screens.
- Authentication, authorization, database access, server actions, route handlers, and background processing will be connected during the backend milestone inside the same application.
- No database engine, ORM, or API library beyond MySQL is selected by this frontend milestone.

### 2.2 Design Direction

- Use a premium enterprise-dashboard style: full white canvas, very light aquatic sections, deep slate text, restrained teal accents, crisp borders, and controlled elevation.
- Use DM Sans as the initial product typeface, with a system sans-serif fallback.
- Use subtle translucent or glass surfaces only for navigation, overlays, and selected summary panels; data tables and forms must use solid, high-contrast surfaces.
- Favor a compact dashboard density while preserving comfortable touch targets and readable forms.
- Use a consistent 8-point spacing system, semantic color tokens, rounded surfaces, and a limited shadow scale.
- Use SVG icons from one consistent icon family; do not use emoji as interface icons.
- Use motion only to explain state changes, navigation, loading, expanding content, and feedback. Normal transitions should take 150-300 ms and respect reduced-motion preferences.

### 2.3 Responsive Standards

- Design mobile-first and verify at minimum at 375 px, 768 px, 1024 px, and 1440 px widths.
- Use a desktop sidebar, compact tablet navigation, and a mobile drawer or role-focused bottom navigation with no more than five primary destinations.
- Convert wide tables to responsive cards or provide an intentional, labelled horizontal table viewport on small screens.
- Keep all primary interactive targets at least 44 by 44 px with at least 8 px separation where practical.
- Prevent page-level horizontal scrolling and preserve browser zoom.
- Ensure forms, dialogs, filters, charts, timers, and action bars remain usable with touch, keyboard, and screen readers.

### 2.4 Accessibility and Quality Standards

- Meet WCAG 2.2 AA contrast, keyboard, focus, semantics, error identification, and non-colour status requirements.
- Use visible labels, helper text, field-level errors, summaries for multi-field errors, and focus movement to actionable errors.
- Never communicate Missing, Under-time, Complete, Overtime, or Critical state by colour alone.
- Provide loading, empty, error, offline/retry, permission-denied, and success states for every data-driven screen.
- Reserve content space for loading states to prevent layout shift.
- Use realistic content lengths and dense datasets during QA, not only ideal sample data.

## 3. Proposed Frontend Route Map

The final route names may be refined without changing the feature ownership below.

| Area | Primary routes/screens |
|---|---|
| Access | `/login`, `/forgot-password`, `/reset-password`, `/two-factor` |
| Shared app | `/dashboard`, `/notifications`, `/search`, `/profile`, `/settings` |
| Employee | `/timesheets`, `/timesheets/[date]`, `/tasks`, `/tasks/[id]`, `/divisions`, `/wfh`, `/leave`, `/evaluations` |
| Team Lead | `/team`, `/team/timesheets`, `/projects`, `/projects/[id]`, `/workload`, `/requests`, `/evaluations`, `/reports` |
| HR | `/hr`, `/employees`, `/employees/[id]`, `/attendance`, `/hr/timesheets`, `/wfh`, `/leave`, `/evaluations`, `/reports` |
| Finance | `/finance`, `/finance/hours`, `/finance/overtime`, `/finance/project-costs`, `/finance/division-costs`, `/finance/payroll`, `/finance/reports` |
| Administration | `/admin/divisions`, `/admin/users`, `/admin/roles`, `/admin/policies`, `/admin/holidays`, `/admin/audit` |
| Collaboration | `/documents`, `/messages` |

## 4. Milestone Overview

| Phase | Name | Demonstrable outcome |
|---:|---|---|
| 0 | Product and UX foundation | Frontend decisions, information architecture, contracts, and delivery controls are locked. |
| 1 | Next.js foundation and design system | A polished, responsive component showcase and application shell run locally. |
| 2 | Authentication and role-based shell | Users can enter a mocked session and see role-appropriate navigation and states. |
| 3 | Employee core experience | The full employee timesheet, timer, task, and personal dashboard journey is demonstrable. |
| 4 | Team Lead experience | Team review, projects/tasks, remarks, corrections, requests, and workload views are demonstrable. |
| 5 | HR experience | Employees, assignments, attendance, WFH/leave, verification, and evaluation screens are demonstrable. |
| 6 | Finance and management experience | Hours, overtime, costing, payroll, reports, and read-only management views are demonstrable. |
| 7 | Shared reporting and supporting modules | Reports, exports, notifications, search, documents, messages, profile, and settings are represented. |
| 8 | Responsive, accessibility, and quality hardening | All agreed flows pass responsive, accessibility, visual, and interaction QA. |
| 9 | Demo packaging and backend handoff | Stakeholders can review the product, and backend implementation can begin without UI restructuring. |

## 5. Detailed Phase Tasks

## Phase 0 - Product and UX Foundation

### Requirements and Scope

- [x] `FE-0001` Review and baseline the complete product requirements in `project_requirement.md`.
- [x] `FE-0002` Confirm Next.js and MySQL as the application and database technologies.
- [x] `FE-0003` Confirm that frontend and backend will be delivered in one Next.js project.
- [x] `FE-0004` Define the task tracking convention used by this milestone.
- [x] `FE-0005` Create a frontend traceability table mapping every MVP screen to its requirement IDs.
- [x] `FE-0006` Label each screen as MVP, Phase 2, Phase 3, or Phase 4 and prevent deferred features from blocking the frontend MVP demo.
- [x] `FE-0007` Confirm the initial demo roles and sample accounts for Employee, Team Lead, HR, Finance, Super Administrator, and Management.
- [x] `FE-0008` Confirm the sample organization, employees, assignments, projects, tasks, payroll period, WFH requests, leave requests, and evaluation period used in the demo.

### Information Architecture and User Flows

- [x] `FE-0009` Produce a role-to-navigation map for all six roles.
- [x] `FE-0010` Produce screen flows for employee time entry, timer use, correction, WFH request, leave request, Team Lead review, HR verification, evaluation, and Finance reporting.
- [x] `FE-0011` Define breadcrumbs, page titles, back behavior, deep links, and mobile navigation rules.
- [x] `FE-0012` Identify high-risk responsive screens: timesheet grid, report builder, employee profile, workload planner, cost tables, and evaluation form.
- [x] `FE-0013` Define the global terminology and display formats for dates, times, durations, money, status, divisions, and employee names.

### Frontend Contracts

- [x] `FE-0014` Define TypeScript domain types for users, roles, employees, divisions, assignments, projects, tasks, time entries, daily summaries, remarks, WFH, leave, attendance, evaluations, reports, notifications, documents, and audit events.
- [x] `FE-0015` Define view models for each dashboard so presentation logic is not scattered across components.
- [x] `FE-0016` Define typed mock service interfaces for queries and mutations that can later be implemented with Next.js server-side code and MySQL.
- [x] `FE-0017` Define standard result shapes for loading, success, validation failure, permission denial, not found, conflict, and unexpected error.
- [x] `FE-0018` Define pagination, sorting, filtering, date-range, and search parameter contracts for data tables.
- [x] `FE-0019` Define a frontend feature-flag map for modules delivered after the MVP.

### Phase 0 Exit Criteria

- [x] All MVP screens have a requirement owner, route, role scope, priority, and mock-data contract.
- [x] All primary user flows have an agreed start, success state, failure states, and mobile behavior.
- [x] Deferred features are visible in the roadmap without expanding the MVP build.

Phase 0 deliverables:

| Task | Deliverable |
|---|---|
| `FE-0005`, `FE-0006` | `docs/frontend/phase-0/traceability-and-priority.md` |
| `FE-0007`, `FE-0008` | `docs/frontend/phase-0/demo-setup.md` |
| `FE-0009`–`FE-0012` | `docs/frontend/phase-0/information-architecture.md` |
| `FE-0013` | `docs/frontend/phase-0/terminology-and-formats.md` |
| `FE-0014` | `contracts/domain.ts` |
| `FE-0015` | `contracts/view-models.ts` |
| `FE-0016` | `contracts/services.ts` |
| `FE-0017` | `contracts/results.ts` |
| `FE-0018` | `contracts/query.ts` |
| `FE-0019` | `contracts/feature-flags.ts` |

The `contracts/` files move into the application's import alias during `FE-0102`.

## Phase 1 - Next.js Foundation and Design System

### Project Foundation

- [x] `FE-0101` Initialize the Next.js application with the App Router, TypeScript, linting, formatting, and a stable import alias.
- [x] `FE-0102` Establish feature-oriented folders for app routes, shared UI, feature modules, domain types, mock services, fixtures, utilities, and tests.
- [x] `FE-0103` Configure environment templates without committing secrets.
- [x] `FE-0104` Add development, type-check, lint, test, and production-build commands.
- [x] `FE-0105` Add route-level `loading`, `error`, and `not-found` experiences.
- [x] `FE-0106` Establish metadata, viewport, favicon, application name, and baseline SEO/no-index behavior appropriate for an internal system.

### Design Tokens

- [x] `FE-0107` Create semantic tokens for white backgrounds, aquatic surfaces and actions, slate text, borders, success, warning, overtime, destructive, critical, focus ring, and chart colours.
- [x] `FE-0108` Validate text and control contrast in every semantic colour pairing.
- [x] `FE-0109` Configure DM Sans with a local/system fallback and define the display, heading, body, label, caption, and numeric type scale.
- [x] `FE-0110` Define the spacing, radius, border, shadow, elevation, z-index, and motion token scales.
- [x] `FE-0111` Define dense and comfortable control/table density options while keeping minimum touch targets.
- [x] `FE-0112` Define the full-white aquatic light theme as the only current product theme; dark mode is outside the approved design scope.

### Reusable Components

- [x] `FE-0113` Build buttons, icon buttons, links, badges, avatars, status indicators, tooltips, dividers, skeletons, and progress indicators.
- [x] `FE-0114` Build text, number, currency, percentage, date, time, duration, select, multi-select, checkbox, radio, switch, search, and file-upload controls.
- [x] `FE-0115` Build accessible form field wrappers with visible labels, helper text, required state, validation text, and described-by relationships.
- [x] `FE-0116` Build cards, metric cards, callouts, empty states, alerts, toasts, dropdowns, popovers, dialogs, drawers, tabs, accordions, and step indicators.
- [x] `FE-0117` Build a responsive data table with sorting, filtering, pagination, column visibility, selection, row actions, sticky headers, and mobile fallback.
- [x] `FE-0118` Build date-range, employee, division, project, task, location, and status filter primitives.
- [x] `FE-0119` Build reusable chart containers, legends, tooltips, empty states, accessible summaries, and colour-safe series.
- [x] `FE-0120` Build page header, section header, breadcrumbs, command/search trigger, filter bar, action bar, and pagination layouts.
- [x] `FE-0121` Build a component showcase route covering normal, hover, focus, disabled, loading, empty, error, and dense states.

### Application Shell

- [x] `FE-0122` Build the responsive desktop sidebar, tablet mode, mobile header, and navigation drawer.
- [x] `FE-0123` Build the top bar with page context, global search trigger, notifications, profile menu, and active timer indicator.
- [x] `FE-0124` Build permission-aware navigation groups for every role and feature flag.
- [x] `FE-0125` Build consistent content widths, dashboard grids, split panels, sticky action regions, and mobile safe-area behavior.
- [x] `FE-0126` Add subtle shell and overlay motion with reduced-motion fallbacks.

### Phase 1 Exit Criteria

- [x] The application shell works at 375, 768, 1024, and 1440 px without page-level horizontal scrolling.
- [x] Shared components cover keyboard, focus, disabled, loading, error, and touch interaction states.
- [~] The component showcase is visually consistent and approved as the frontend source of truth.

Phase 1 deliverables:

| Task group | Deliverable |
|---|---|
| `FE-0101`–`FE-0106` | Next.js 16 App Router + TypeScript + Tailwind v4; `src/` module folders; `.env.example`; `dev`/`build`/`lint`/`typecheck`/`test`/`verify` scripts; route-level `loading`, `error`, `not-found`; no-index metadata |
| `FE-0107`–`FE-0112` | `src/app/globals.css` — semantic white/aquatic colour system, typography, spacing, radius, shadow, z-index, motion, and density tokens; light theme only |
| `FE-0113`–`FE-0121` | `src/components/{ui,forms,feedback,data,charts,layout}`; showcase at `/showcase` |
| `FE-0122`–`FE-0126` | `src/components/shell` — sidebar, top bar, mobile drawer, bottom navigation, permission- and flag-aware navigation model |

Automated gates added in this phase:

| Gate | Command | Result |
|---|---|---|
| Contrast audit (`FE-0108`) | `npm run audit:contrast` | 48/48 pass |
| Responsive audit | `npm run audit:responsive` | 8/8 route × width combinations pass |
| Type check, lint, tests, build | `npm run verify` | pass (23 tests) |

The remaining exit criterion is a stakeholder sign-off on the showcase, which cannot be self-certified.

## Phase 2 - Authentication and Role-Based Shell

### Access Screens

- [x] `FE-0201` Build the premium login screen with email/employee ID, password, remember-me, password visibility, and help states.
- [x] `FE-0202` Build forgot-password and reset-password screens with success, invalid, expired, and retry states.
- [x] `FE-0203` Build the two-factor verification screen with code entry, resend timer, recovery guidance, and validation states.
- [x] `FE-0204` Build locked, inactive-account, expired-session, unauthorized, and permission-denied screens.
- [x] `FE-0205` Ensure authentication forms support password managers, keyboard submission, autofill, and accessible error announcements.

### Mock Session and Role Switching

- [x] `FE-0206` Implement a local mock session provider using the same consumer interface expected from later server authentication.
- [x] `FE-0207` Provide development-only demo account selection for all six roles.
- [x] `FE-0208` Redirect each demo user to the correct role dashboard after mocked login.
- [x] `FE-0209` Hide unauthorized navigation and actions while retaining explicit permission-denied page states for direct-route testing.
- [x] `FE-0210` Build the profile menu, session expiry warning, sign-out confirmation, and recent-login presentation.

### Phase 2 Exit Criteria

- [x] Every demo role can enter and leave a mock session and sees the correct shell and default dashboard route.
- [x] Restricted routes and actions have demonstrable denied states.
- [x] Authentication screens pass mobile, keyboard, validation, and contrast checks.

Phase 2 deliverables:

| Task group | Deliverable |
|---|---|
| `FE-0201`–`FE-0205` | `src/features/access/` — `auth-layout`, `login-form`, `password-forms`, `two-factor-form`, `account-state`; routes under `src/app/(access)/` |
| `FE-0206` | `session-provider` + `session-store` implementing the `AuthService` contract; `src/services/mock/auth.ts` |
| `FE-0207` | `demo-account-picker` and the in-app demo tools panel, both gated by `demo-mode` |
| `FE-0208` | `DEFAULT_ROUTE` redirection; landing routes `/dashboard`, `/hr`, `/finance` |
| `FE-0209` | `route-access.ts` rule table plus the guard in `src/app/(app)/layout.tsx`; denied state renders in place, keeping the URL |
| `FE-0210` | Profile menu wiring, session-expiry warning, sign-out confirmation, recent-login display |

Automated gates:

| Gate | Command | Result |
|---|---|---|
| Phase 2 flows | `npm run audit:flows` | 16/16 pass (role routing, denied states, 2FA, account states, sign-out, scoped navigation) |
| Responsive audit | `npm run audit:responsive` | 28/28 route × width combinations pass |
| Contrast audit | `npm run audit:contrast` | 48/48 pass |
| Type check, lint, tests, build | `npm run verify` | pass (48 tests) |

Two demo accounts were added for the locked and inactive sign-in states; both are recorded in `docs/frontend/phase-0/demo-setup.md` §1.1 along with the demo password, 2FA code, and reset-token fixtures.

Routes navigation links to but a later phase builds resolve to a registered "planned screen" placeholder naming the phase and task ids. Unregistered paths still return not-found.

## Phase 3 - Employee Core Experience

### Employee Dashboard

- [x] `FE-0301` Build today's summary for active work, break, total, remaining active time, and progress toward the eight-hour schedule.
- [x] `FE-0302` Build today's divisions, active tasks, upcoming deadlines, active timer, and quick actions.
- [x] `FE-0303` Build weekly/monthly totals, overtime, missing dates, recent remarks, WFH/leave status, division contribution, and recently completed tasks.
- [x] `FE-0304` Add loading, empty, first-use, incomplete-day, complete-day, overtime, critical, and offline dashboard states.
- [x] `FE-0305` Make every dashboard metric open the corresponding filtered detail view.

### Timesheet Views

- [x] `FE-0310` Build daily, weekly, monthly, calendar, and list view navigation.
- [x] `FE-0311` Build the daily timeline with entry blocks, division/project/task labels, locations, descriptions, and completed-work summaries.
- [x] `FE-0312` Build weekly and monthly summaries with active work, break, total, missing, under-time, overtime, and critical indicators.
- [x] `FE-0313` Build the calendar view with accessible status labels and a compact mobile agenda alternative.
- [x] `FE-0314` Build a timesheet filter and search bar for date, division, project, task, location, and status.
- [x] `FE-0315` Build empty, no-results, loading, error, locked/verified, and permission states for all timesheet views.

### Time Entry and Timer

- [x] `FE-0320` Build a time-entry drawer or page supporting manual start/end entry and direct duration entry.
- [x] `FE-0321` Add date, division, project, task, work location, description, completed work, attachment/link, and break inputs.
- [x] `FE-0322` Dynamically constrain projects and tasks by the selected division and mock assignment dates.
- [x] `FE-0323` Show an immediate calculation preview for entry duration, daily active work, break, total, remaining time, and resulting status.
- [x] `FE-0324` Show field-level validation for invalid ranges, overlap, duplicates, inactive projects, unassigned divisions, approved leave, and missing information.
- [x] `FE-0325` Require and progressively reveal an overtime reason above eight total hours and a critical explanation above twelve hours.
- [x] `FE-0326` Build save-draft, save, cancel, discard-confirmation, and unsaved-change behavior.
- [x] `FE-0327` Build copy-previous-entry selection and present copied data as a clearly identified editable draft.
- [x] `FE-0328` Build the timer start flow with division/project/task/location context.
- [x] `FE-0329` Build global running-timer presentation, elapsed time, pause/stop behavior if approved, and stop-to-draft review.
- [x] `FE-0330` Prevent two visually active timers and show recovery UI for a timer restored after refresh.

### Tasks, Divisions, Remarks, and Profile

- [x] `FE-0340` Build employee task list views for assigned, pending, in progress, completed, overdue, and upcoming tasks.
- [x] `FE-0341` Build task detail with estimate versus actual time, due date, checklist, attachments, completed-work history, supporting members, and add-time action.
- [x] `FE-0342` Build My Divisions with primary/additional assignments, Team Lead, allocation, expected hours, dates, and current status.
- [x] `FE-0343` Build the employee remarks inbox and remark detail with linked record, correction state, history, and clarification response.
- [x] `FE-0344` Build correction editing with locked-field guidance, change summary, and successful resubmission state.
- [x] `FE-0345` Build the employee profile view and editable permitted fields, preferences, work mode, and accessibility settings.

### Phase 3 Exit Criteria

- [x] A stakeholder can complete the employee journey from login through dashboard, time entry/timer, calculation, save, remark, correction, and updated summary using realistic mock data.
- [x] Cross-division totals and the 7-active-plus-1-break policy are visually unambiguous.
- [x] Employee workflows pass responsive and keyboard checks at all target widths.

Phase 3 deliverables:

| Task group | Deliverable |
|---|---|
| Calculation core | `src/lib/calculation/engine.ts` — the single authoritative daily calculation; `validation.ts` for entry rules. 53 unit tests cover `AC-CALC-001`–`007`. |
| `FE-0301`–`FE-0305` | `src/features/dashboard/employee-dashboard.tsx` |
| `FE-0310`–`FE-0315` | `src/features/timesheet/timesheet-views.tsx` — week, month, calendar and list views with filters |
| `FE-0320`–`FE-0327` | `src/features/timesheet/entry-drawer.tsx`, `day-view.tsx` |
| `FE-0328`–`FE-0330` | `src/features/timesheet/timer-panel.tsx`, `use-timer.ts` |
| `FE-0340`–`FE-0345` | `src/features/tasks/task-screens.tsx`, `divisions-remarks-profile.tsx` |
| Data | `src/fixtures/index.ts` (deterministic dataset), `src/services/mock/{store,timesheet,organization,work}.ts` |

Automated gates:

| Gate | Command | Result |
|---|---|---|
| Phase 3 flows | `npm run audit:flows3` | 18/18 — DEMO-01, the under-time/overtime/12:00/critical boundaries, leave and holiday exemptions, cross-division overlap, progressive overtime reason, locked period, timer recovery, remark history |
| Responsive + rendered contrast | `npm run audit:responsive` | 60/60 route × width combinations (now includes authenticated screens) |
| Contrast tokens | `npm run audit:contrast` | 48/48 |
| Type check, lint, tests, build | `npm run verify` | pass (101 tests) |

The responsive audit gained a **rendered**-contrast check in this phase. It immediately found a primary button at 1.07:1: `tailwind-merge` treated the custom `text-body-sm` size class as a text *colour* and stripped `text-ink-inverse`, so a class present in the source was removed at runtime. Fixed in `src/lib/cn.ts` by registering the type scale as font sizes.

## Phase 4 - Team Lead Experience

### Team Dashboard and Timesheet Review

- [x] `FE-0401` Build Team Lead metrics for assigned employees, people working today, and Office/WFH/Field/Travel/Leave states.
- [x] `FE-0402` Build exception summaries for missing, under-time, overtime, and critical records.
- [x] `FE-0403` Build division-hours, project-progress, task, request, workload, recent-entry, and evaluation-status panels.
- [x] `FE-0404` Build team timesheet table and mobile cards with employee, date, active work, break, total, division contribution, location, and status.
- [x] `FE-0405` Add scoped filters, saved filter state, clear filters, detail navigation, and bulk-safe presentation without adding daily approval controls.
- [x] `FE-0406` Build timesheet detail with calculation breakdown, entries, completed work, attachments, anomalies, remarks, and change history.

### Remarks and Corrections

- [x] `FE-0410` Build the one-general-remark composer for a timesheet, task, missing information, overtime, work quality, performance, or correction need.
- [x] `FE-0411` Build correction-request confirmation with linked employee/record, requested changes, and notification preview.
- [x] `FE-0412` Build open, responded, corrected, and resolved remark states.
- [x] `FE-0413` Build the Team Lead review of employee clarification and corrected values.

### Projects and Tasks

- [x] `FE-0420` Build project list, filters, status/priority presentation, progress, estimate/actual, budget visibility state, and responsive cards.
- [x] `FE-0421` Build project create/edit forms with division, code, manager, members, stakeholder, dates, priority, estimate, budget, progress, files, and notes.
- [x] `FE-0422` Build project detail overview, team, tasks, time, progress, files, and activity tabs.
- [x] `FE-0423` Build task list/board views using only Pending, In Progress, and Completed statuses.
- [x] `FE-0424` Build task create/edit with assignee, supporting members, dates, estimate, description, checklist, and attachments.
- [x] `FE-0425` Build task detail with actual-time entries, work history, overdue state, comments placeholder, and status change feedback.

### Requests, Workload, and Evaluations

- [x] `FE-0430` Build Team Lead WFH and leave request queues with pending, information-requested, approved, and rejected views.
- [x] `FE-0431` Build request detail and decision interfaces with general remark, information request, confirmation, and audited-override display.
- [x] `FE-0432` Build workload capacity cards/table showing weekly capacity, assigned, actual, remaining, overallocated, underallocated, and upcoming deadlines.
- [x] `FE-0433` Build a responsive workload calendar with division/project context and leave-adjusted capacity.
- [x] `FE-0434` Build Team Lead evaluation queue, evaluation form, weighted scoring summary, supporting facts, draft, submit, and read-only submitted states.

### Phase 4 Exit Criteria

- [x] A Team Lead can review team status, inspect exceptions, request a correction, manage projects/tasks, decide a request, and complete an evaluation with mock data.
- [x] The interface contains no daily timesheet approval action.
- [x] All Team Lead data and actions visually communicate assigned scope.

Phase 4 evidence is recorded in `docs/frontend/phase-4/verification.md`: Team Lead flows 20/20, responsive route/width combinations 112/112, rendered contrast 6,628 elements checked, and the complete verification gate passing with 105 tests and a 26-route build.

## Phase 5 - HR Experience

### HR Dashboard and Employees

- [x] `FE-0501` Build the HR dashboard for active headcount, division count, attendance states, timesheet exceptions, monthly hours, evaluations, WFH trends, workload concerns, and assignments.
- [x] `FE-0502` Build employee directory with filters for status, division, Team Lead, employment type, work mode, and incomplete profile.
- [x] `FE-0503` Build employee create/edit with identity, employment, contact, office, schedule, work mode, skills, and status fields.
- [x] `FE-0504` Build employee detail tabs for overview, assignments, projects, time, attendance, WFH, leave, evaluations, remarks, documents, and audit history.
- [x] `FE-0505` Build multi-division assignment management with primary division, Team Lead, allocation, expected weekly hours, dates, active state, and allocation warning.
- [x] `FE-0506` Build temporary assignment creation and historical assignment timeline.

### Attendance, Leave, WFH, and Holidays

- [x] `FE-0510` Build attendance calendar/list views that distinguish Office, WFH, travel, field, training, leave, absence, holiday, and missing timesheet.
- [x] `FE-0511` Build WFH administration with scoped filters, employee history, division summary, decisions, completed-work preview, and override UI.
- [x] `FE-0512` Build leave administration with balances, request review, half-day display, conflict state, and audited override UI.
- [x] `FE-0513` Build company, division-specific, and weekly holiday management views.
- [x] `FE-0514` Demonstrate that approved leave/holidays do not appear as missing and half-day leave adjusts the visible requirement.

### Period Verification and Evaluations

- [x] `FE-0520` Build monthly/payroll-period verification workspace with completeness, exceptions, unresolved corrections, and employee drill-down.
- [x] `FE-0521` Build verify-period confirmation showing included dates, policy version, exception count, and lock consequences.
- [x] `FE-0522` Build verified, locked, unlock-request, amendment, and amendment-history states.
- [x] `FE-0523` Build evaluation-period creation for monthly, quarterly, half-yearly, annual, project, and probation types.
- [x] `FE-0524` Build reviewer/employee assignment, progress tracking, reminders, review, and publication states.
- [x] `FE-0525` Build evaluation detail with automatic facts, self-evaluation, Team Lead scoring, default weighting, comments, final result, and publication history.

Phase 5 evidence is recorded in `docs/frontend/phase-5/verification.md`: HR flows 51/51, responsive route/width combinations 156/156, rendered contrast 10,353 elements checked, and the complete verification gate passing with 126 tests and a 37-route build.

### Phase 5 Exit Criteria

- [x] HR can manage a realistic employee assignment, review attendance and requests, verify a period, and publish an evaluation in the frontend demo.
- [x] Locked and amended period states are clear and cannot be mistaken for daily approval.
- [x] Sensitive evaluation content has explicit loading, unauthorized, unpublished, and read-only states.

## Phase 6 - Finance and Management Experience

### Finance Dashboard and Analysis

- [x] `FE-0601` Build Finance metrics for verified employee, division, project, and overtime hours.
- [x] `FE-0602` Build protected metric states for project labour cost, division labour cost, billable/non-billable hours, payroll, and budget variance.
- [x] `FE-0603` Build employee-hours and overtime tables with payroll-period, employee, division, project, and status filters.
- [x] `FE-0604` Build project-cost and division-cost analysis with totals, trends, estimate/budget variance, drill-down, and permission-redacted states.
- [x] `FE-0605` Build billable versus non-billable analysis with reconciliation to total verified hours.
- [x] `FE-0606` Build payroll-period summary with verification status, exception visibility, export readiness, and audit/export history.

### Finance Reports and Management Read-Only Views

- [x] `FE-0610` Build payroll-ready report preview and export configuration without performing a real export during the frontend phase.
- [x] `FE-0611` Build financial report filters, saved presentation state, loading, no-results, unverified warning, and restricted-field behavior.
- [x] `FE-0612` Build management dashboard with authorized company, division, employee-summary, time-allocation, and project-progress views.
- [x] `FE-0613` Ensure management screens expose no edit, approve, verify, override, or destructive action.
- [x] `FE-0614` Add accessible chart alternatives and tabular reconciliation for every financial visualization.

Phase 6 evidence is recorded in `docs/frontend/phase-6/verification.md`: Finance and Management flows 40/40, responsive route/width combinations 200/200, and the complete verification gate passing with 164 tests and a 47-route build.

### Phase 6 Exit Criteria

- [x] Finance can move from verified hours to project/division analysis and a payroll-ready preview using mock data.
- [x] Cost and salary content can be visibly included or redacted based on mock permissions.
- [x] Management can explore authorized summaries through a completely read-only experience.

## Phase 7 - Shared Reporting and Supporting Modules

### Reports and Export Experience

- [x] `FE-0701` Build a report catalogue grouped into Timesheet, HR, Finance, Attendance, WFH, Evaluation, Workload, and Remarks.
- [x] `FE-0702` Build a reusable report builder with date, employee, division, project, task, Team Lead, employment type, location, overtime, and status filters.
- [x] `FE-0703` Build report preview with applied-filter summary, timezone, policy version, generated timestamp, totals, table, and chart when useful.
- [x] `FE-0704` Build export-format selection for Excel, CSV, PDF, and Print with mocked queued, processing, ready, expired, and failed states.
- [x] `FE-0705` Build export history with requester, filters, format, timestamp, status, retry, and download permission states.
- [x] `FE-0706` Create print styles that remove application chrome and preserve report titles, filters, table headers, totals, and page-break behavior.

### Notifications and Search

- [x] `FE-0710` Build notification centre with role-aware groups, unread count, read/unread behavior, related-record links, loading, empty, and permission-safe content.
- [x] `FE-0711` Build global search command and full results page for employees, divisions, projects, tasks, timesheets, remarks, and documents.
- [x] `FE-0712` Add search filters, recent searches stored locally for the demo, keyboard navigation, no-results guidance, and protected-result behavior.

### WFH, Leave, Evaluations, Documents, and Messages for Employees

- [x] `FE-0720` Build employee WFH history, request form, detail, information-requested, approved, rejected, and cancelled presentation.
- [x] `FE-0721` Build employee leave balance, history, request form, half-day choice, conflicts, detail, and decision presentation.
- [x] `FE-0722` Build employee evaluation list, self-evaluation form, draft state, submitted state, and published-result view.
- [x] `FE-0723` Build document library with company/division/project grouping, search, filters, file metadata, preview placeholder, download action, and denied state.
- [x] `FE-0724` Build lightweight division/project/direct message and task-comment prototypes for Phase 3, clearly separated from the MVP navigation when disabled.

### Settings and Administration

- [x] `FE-0730` Build Super Administrator division management screens and deactivation safeguards.
- [x] `FE-0731` Build user/role/permission screens with clear scope and sensitive-permission warnings.
- [x] `FE-0732` Build work-hour, break, overtime, holiday, notification, and feature-flag settings screens as frontend prototypes.
- [x] `FE-0733` Build audit-log viewer with actor, action, resource, date, scope, filter, before/after detail, and restricted values.
- [x] `FE-0734` Build integration settings placeholders for calendars, email, storage, conferencing, biometric, payroll, accounting, SSO, API, and webhooks without simulating a connected service as real.

Phase 7 evidence is recorded in `docs/frontend/phase-7/verification.md`: shared reporting and supporting-module flows 55/55, responsive route/width combinations 268/268, and the complete verification gate passing with 213 tests and a 61-route build.

### Phase 7 Exit Criteria

- [x] Shared reports, export states, notifications, search, and profile/settings patterns are consistent across roles.
- [x] Deferred collaboration and integrations are demonstrable without being represented as production-connected features.
- [x] All navigation destinations have an intentional page, coming-later state, or feature-flag exclusion.

## Phase 8 - Responsive, Accessibility, and Quality Hardening

### Responsive QA

- [ ] `FE-0801` Test every primary route at 375, 768, 1024, and 1440 px.
- [ ] `FE-0802` Correct navigation, table, form, chart, dialog, drawer, sticky-action, and safe-area issues at every target width.
- [ ] `FE-0803` Test long employee names, long project/task titles, many divisions, large currency values, translated-length labels, and empty values.
- [ ] `FE-0804` Verify there is no unintentional page-level horizontal scrolling.
- [ ] `FE-0805` Verify timer and primary actions remain reachable on small screens and with the on-screen keyboard visible.

### Accessibility QA

- [ ] `FE-0810` Complete keyboard-only testing for login, navigation, time entry, timer, requests, remarks, reports, dialogs, and tables.
- [ ] `FE-0811` Verify visible focus, logical focus order, dialog focus trapping/restoration, skip link, headings, landmarks, and page titles.
- [ ] `FE-0812` Verify labels, descriptions, live regions, validation announcements, table semantics, chart summaries, and icon accessible names.
- [ ] `FE-0813` Verify WCAG AA colour contrast and ensure status, charts, validation, and links do not rely on colour alone.
- [ ] `FE-0814` Verify 200% zoom, text resizing, reduced motion, touch targets, and screen-reader use on primary flows.

### Functional and Visual QA

- [ ] `FE-0820` Add automated component tests for status classification presentation, duration formatting, filters, responsive navigation, forms, dialogs, and permission-aware controls.
- [ ] `FE-0821` Add end-to-end frontend tests for each role's primary demo journey using mock services.
- [ ] `FE-0822` Test loading, empty, error, denied, conflict, locked, offline, retry, and success states across all feature modules.
- [ ] `FE-0823` Verify fixture totals reconcile across dashboard, timesheet, reports, evaluation, and Finance screens.
- [ ] `FE-0824` Run type checks, lint checks, tests, and a production build with no unresolved errors.
- [ ] `FE-0825` Perform visual review for spacing, alignment, hierarchy, typography, colour consistency, clipping, overflow, and layout shift.
- [ ] `FE-0826` Check that all clickable elements provide hover/focus/pressed/loading feedback and that non-interactive elements do not show misleading pointer behavior.
- [ ] `FE-0827` Optimize images, icons, fonts, client component boundaries, route loading, and large-list rendering.

### Phase 8 Exit Criteria

- [ ] Primary flows meet the responsive and WCAG 2.2 AA targets.
- [ ] Automated checks and the production build pass.
- [ ] No critical visual, navigation, permission-presentation, or calculation-presentation defect remains open.

## Phase 9 - Demo Packaging and Backend Handoff

### Stakeholder Demo

- [ ] `FE-0901` Create deterministic demo fixtures for all six roles and the five initial divisions.
- [ ] `FE-0902` Create a demo scenario showing cross-division time: 3 hours PowerInAI, 2 hours Government Projects, 2 hours WesternCF, and a separate 1-hour break.
- [ ] `FE-0903` Create under-time, complete, overtime, critical, missing, leave, WFH, correction, verified, and restricted-data scenarios.
- [ ] `FE-0904` Add a development-only demo reset control so every presentation starts from the same state.
- [ ] `FE-0905` Prepare a stakeholder walkthrough covering Employee, Team Lead, HR, Finance, Management, and Administrator perspectives.
- [ ] `FE-0906` Record stakeholder feedback with owner, priority, decision, and affected requirement/task IDs.

### Backend Readiness

- [ ] `FE-0910` Inventory every mock query and mutation used by the frontend.
- [ ] `FE-0911` Document request inputs, returned view models, validation errors, permission outcomes, pagination, sorting, and filters for every data interface.
- [ ] `FE-0912` Map frontend domain types to the core entities in `project_requirement.md` without selecting the MySQL schema prematurely.
- [ ] `FE-0913` Identify which interactions should later use server components, server actions, route handlers, background jobs, file storage, or real-time updates.
- [ ] `FE-0914` Document authentication, role, division, project, field-level, government-project, salary/cost, and evaluation permission expectations at each boundary.
- [ ] `FE-0915` Document calculation fixtures and expected results for backend parity tests.
- [ ] `FE-0916` Confirm that no UI component depends directly on fixture storage or mock-only behavior.
- [ ] `FE-0917` Produce the backend milestone plan for MySQL persistence, authentication, authorization, business logic, reporting, files, notifications, integrations, audit, testing, and deployment.

### Phase 9 Exit Criteria

- [ ] Stakeholders approve the frontend experience or all requested changes are tracked.
- [ ] Every visible workflow has a typed backend contract and documented permission expectation.
- [ ] Mock adapters can be replaced incrementally inside the same Next.js application.
- [ ] The backend milestone can start without splitting the repository or redesigning approved screens.

## 6. Frontend Definition of Done

A frontend task may be marked `[x]` only when all applicable conditions are true:

- The intended screen, component, or interaction is implemented against the typed mock service boundary.
- Normal, loading, empty, validation, error, denied, and success states are covered where applicable.
- Keyboard, focus, touch-target, semantic-label, contrast, and reduced-motion behavior is checked.
- The work is verified at the target responsive widths relevant to the feature.
- The design uses shared tokens and components and introduces no unapproved one-off styling.
- Visible totals and statuses agree with the requirements and deterministic fixtures.
- Tests appropriate to the task pass, with no lint, type-check, or production-build regression.
- Requirement and task references are updated when the implementation changes scope or behavior.

## 7. Demo Acceptance Scenarios

- [ ] `DEMO-01` An Employee records time across three divisions and sees 7 active hours plus 1 break hour as a complete 8-hour day.
- [ ] `DEMO-02` An Employee creates an overtime entry, sees the required reason field, and sees the resulting status throughout the UI.
- [ ] `DEMO-03` A critical entry above 12 hours shows a required explanation and Team Lead/HR notification previews.
- [x] `DEMO-04` A Team Lead finds an exception, adds one general remark, requests correction, and reviews the employee's response.
- [x] `DEMO-05` A Team Lead creates a project/task, reviews actual time, decides a WFH request, and inspects workload.
- [ ] `DEMO-06` HR manages a multi-division assignment, reviews attendance, verifies a period, and publishes an evaluation.
- [ ] `DEMO-07` Finance reviews verified hours, protected cost data, project/division totals, and a payroll export preview.
- [ ] `DEMO-08` Management views authorized summaries without seeing any editing control.
- [ ] `DEMO-09` An unauthorized role receives a safe denied state and cannot discover restricted information through navigation or search.
- [ ] `DEMO-10` The primary Employee, Team Lead, HR, and Finance flows remain usable at mobile and desktop widths.

## 8. Current Progress Summary

| Phase | Status | Completed/Total |
|---:|---|---:|
| Phase 0 - Product and UX Foundation | Done | 19/19 |
| Phase 1 - Next.js Foundation and Design System | Done | 26/26 |
| Phase 2 - Authentication and Role-Based Shell | Done | 10/10 |
| Phase 3 - Employee Core Experience | Done | 28/28 |
| Phase 4 - Team Lead Experience | Done | 21/21 |
| Phase 5 - HR Experience | Done | 17/17 |
| Phase 6 - Finance and Management Experience | Done | 11/11 |
| Phase 7 - Shared Reporting and Supporting Modules | Done | 19/19 |
| Phase 8 - Responsive, Accessibility, and Quality Hardening | Pending | 0/18 |
| Phase 9 - Demo Packaging and Backend Handoff | Pending | 0/14 |

Update this table whenever tasks change status. Exit-criteria checkboxes are gates and are not included in the task totals above.
