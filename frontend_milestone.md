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

- Use a premium enterprise-dashboard style: a light canvas, PowerInAI violet identity accents, deep ink text, crisp borders, and controlled elevation.
- Use DM Sans as the initial product typeface, with a system sans-serif fallback.
- Use subtle translucent or glass surfaces only for navigation, overlays, and selected summary panels; data tables and forms must use solid, high-contrast surfaces.
- Favor a compact dashboard density while preserving comfortable touch targets and readable forms.
- Use a consistent 8-point spacing system, semantic color tokens, rounded surfaces, and a limited shadow scale.
- Use SVG icons from one consistent icon family; do not use emoji as interface icons.
- Use motion only to explain state changes, navigation, loading, expanding content, and feedback. Normal transitions should take 150-300 ms and respect reduced-motion preferences.

### 2.2.1 Project-wide SaaS Design Enhancement

The September 2026 polish pass applies through shared components rather than per-screen overrides:

- Cards, charts, mobile table cards, and data tables use a consistent rounded surface and restrained elevation hierarchy.
- Metric tiles use a slim brand rule, increased internal spacing, and clearer hover elevation while retaining their existing content and links.
- Page headers have stronger title hierarchy and section separation; responsive gutters and vertical rhythm increase progressively by breakpoint.
- Sidebar items use bordered active pills with text, icon, and contrast cues; the top bar and sidebar use purposeful translucency and blur only for persistent navigation.
- Buttons and inputs use stable border/shadow feedback without layout-shifting motion. Tables gain clearer headers, alternating row surfaces, and stronger hover scanning cues.
- The approved PowerInAI light palette, semantic status colours, routes, permissions, data contracts, and business behavior are unchanged.

Verification: `npm run verify` passes with 409 tests and a 57-page production build; contrast remains 48/48; `/dashboard` passes 12/12 role/width responsive checks with 1,310 rendered elements checked for contrast.

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
| Requisition | `/requisitions`, `/requisitions/new`, `/requisitions/[id]` |
| Conveyance | `/conveyance`, `/conveyance/new`, `/conveyance/[id]` |
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
| 7 | Shared reporting and supporting modules | Reports, exports, notifications, search, documents, messages, profile, settings, requisition, conveyance, and employee-raised tasks are represented. |
| 8 | Responsive, accessibility, and quality hardening | All agreed flows pass responsive, accessibility, visual, and interaction QA. |
| 9 | Demo packaging and backend handoff | Stakeholders can review the product, and backend implementation can begin without UI restructuring. |
| 10 | Role consolidation: Finance into HR | The product presents five roles, HR performs every Finance task, and no user gained cost access by the merge alone. |

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

### Requisition

Added after Phase 7 was first completed, so the phase is reopened. `FE-0701`-`FE-0734` remain done and are not re-verified by this work.

**Scope.** One screen carrying two request forms, an approval chain, and a role-aware queue. Only an Employee or a Team Lead may submit. An Employee's requisition goes to their Team Lead first; a Team Lead's own requisition skips that step. After the Team Lead stage (or immediately, for a Team Lead's own), it reaches HR, Finance, and the Super Administrator for review.

| Form | Fields (in order) |
|---|---|
| In-house | Name · Purpose (repair/lost) · Last recover date · Model name · Approx amount · Urgency |
| New | Name · Purpose · Urgency · Approx amount · Model |

- [x] `FE-0740` Define requisition contracts in `src/contracts/requisition.ts`: the two form shapes, the shared record, review-stage and decision enums, list/detail view models, and the `RequisitionService` interface returning `Result<T>`.
- [x] `FE-0741` Add requisition fixtures and a mock service adapter covering every stage of the chain, including a Team Lead's own submission that bypasses the Team Lead stage.
- [x] `FE-0742` Add the `Requisition` navigation entry, route registration, and feature flag; the entry appears only for roles that may submit or review, and never for Management/view-only.
- [x] `FE-0743` Build `/requisitions` as a role-aware list: an Employee sees only their own, a Team Lead sees their own plus their team's awaiting review, and HR/Finance/Super Administrator see everything that has reached them.
- [x] `FE-0744` Build the In-house form with Name, Purpose (repair/lost), Last recover date, Model name, Approx amount, and Urgency.
- [x] `FE-0745` Build the New form with Name, Purpose, Urgency, Approx amount, and Model.
- [x] `FE-0746` Present the two forms as one create screen with a labelled choice between In-house and New, preserving entered values when the choice changes only where fields are shared.
- [x] `FE-0747` Implement submission validation at the service boundary with a field, a message, and corrective guidance for every failure (`REQ-TIME-025` pattern), including the amount and date normalisation described in the open questions below.
- [x] `FE-0748` Build `/requisitions/[id]` with the submitted values, the current stage, and a review timeline recording who decided what, when, and why.
- [x] `FE-0749` Build the Team Lead review action and the dashboard queue tile plus notification that tells a Team Lead an Employee requisition is waiting.
- [x] `FE-0750` Build the HR, Finance, and Super Administrator review action, reachable only once the requisition has actually reached that stage.
- [x] `FE-0751` Cover the full state set on every requisition screen: loading, empty, validation, permission-denied, not-found, conflict (already decided), and success.
- [x] `FE-0752` Add unit tests for the review chain and scope rules, and a `npm run audit:flows-requisition` browser gate walking Employee submit through Team Lead review to HR/Finance/Super Administrator review.

**Rules this feature must not break.**

- *Deny by default.* A requisition is visible only to its submitter, that submitter's Team Lead, and the reviewers it has reached. An Employee must not be able to discover another Employee's requisition through the list, a count, a search result, or an id in the URL — an unauthorised id returns the same not-found response as a nonexistent one.
- *Approval wording stays here.* A requisition is a genuine decision, so review and approval language is correct on these screens — the same licence WFH requests, leave requests, and HR period verification already have. It must never appear on a daily time record (`AGENTS.md` §2). `docs/frontend/phase-0/terminology-and-formats.md` needs the requisition vocabulary added alongside those.
- *Money is money.* `src/lib/money.ts` is still the only place an amount is computed and `formatMoney` the only place one is rendered.

**Open questions — do not implement past these without an answer.**

1. **No `REQ-*` backs this feature.** `project_requirement.md` is the source of truth and contains no requisition requirement. One needs to be written and numbered before build, or this ships as scope no acceptance criterion covers.
2. **Do HR, Finance, and the Super Administrator each have to decide, or does any one of them settle it?** This changes the state machine, the queue counts, and what "decided" means. Assumed for now: all three review in parallel and the requisition is decided when the last of them has, with any rejection ending the chain immediately.
3. **Approx amount is specified as a text field**, but the project stores money as a fixed-precision decimal string plus a currency code and never as a bare number. Assumed for now: the input stays a text field as specified, and the service normalises it to `Money` in BDT, rejecting anything it cannot parse with field-level guidance.
4. **Last recover date is specified as a text field**, but every other date in the product is an `IsoDate`. Assumed for now: text input, normalised and stored as `IsoDate`, rendered through `src/lib/format.ts`.
5. **Purpose and Urgency are specified as text fields**, yet "repair/lost" reads as a choice and urgency is what a reviewer would sort and filter a queue by. Free text supports neither. Assumed for now: free text as specified, with the queue ordered by submission date rather than urgency.
6. **What happens after a decision?** No fulfilment, purchase, or asset-handover step was described. Assumed out of scope.

### Conveyance

Added after the requisition work, so Phase 7 is reopened a second time. `FE-0701`-`FE-0752` remain done and are not re-verified by this work.

**Scope.** A travel-expense claim. One form, the same approval chain as requisition, and an optional receipt upload. Only an Employee or a Team Lead may submit. An Employee's claim goes to their Team Lead first; a Team Lead's own skips that step; after that it reaches HR, Finance and the Super Administrator.

| Field | Control | Note |
|---|---|---|
| Date/time | Read-only | When the claim was submitted. Not editable. |
| Business name | Text | |
| Client name | Text | |
| Visited date | Date | |
| Time | Time | |
| Mode | Self / Uber / Other | |
| Amount | Money | |
| Receipt | File upload | **Optional** |

- [x] `FE-0760` **Extract the shared review chain before building this.** Conveyance travels the identical path to requisition, and a second hand-written copy of the stage machine is how the two silently drift apart. Lift the stage/outcome model, the `canView`/`canDecide` rules and the timeline view model out of `src/services/mock/requisition.ts` into a shared module, re-run the requisition gates unchanged to prove the extraction was behaviour-preserving, then build conveyance on it.
- [x] `FE-0761` Define conveyance contracts in `src/contracts/conveyance.ts`: the record, the form input, the travel-mode enum, the attachment reference, list/detail view models, and the `ConveyanceService` interface returning `Result<T>`.
- [x] `FE-0762` Add conveyance fixtures and a mock service adapter covering every stage, including a Team Lead's own claim, a claim with a receipt and a claim without one.
- [x] `FE-0763` Add the `Conveyance` navigation entry, route registration, and feature flag, for the same audiences as requisition and never for Management/view-only.
- [x] `FE-0764` Build `/conveyance` as a role-aware list with the same scope rules as the requisition list, showing visited date, business, client, mode and amount.
- [x] `FE-0765` Build the claim form. The submitted date/time is rendered read-only from the service, never from a clock in the component.
- [x] `FE-0766` Build the optional receipt upload with file name, size, type and remove control, plus the states an upload actually has: none, selected, too large, wrong type, and failed.
- [x] `FE-0767` Implement submission validation at the service boundary with a field, a message and corrective guidance for every failure, including the amount and the visited date/time rules in the open questions below.
- [x] `FE-0768` Build `/conveyance/[id]` with the claimed journey, the receipt when present and permitted, and the same review timeline the requisition detail uses.
- [x] `FE-0769` Build the Team Lead review action, dashboard queue tile and notification, sharing one queue presentation with requisition rather than adding a second unrelated tile.
- [x] `FE-0770` Build the HR, Finance and Super Administrator review action, reachable only once the claim has reached that stage.
- [x] `FE-0771` Enforce attachment access: a receipt is deny-by-default like every other attachment (`AGENTS.md` §2, `REQ-WORK-009`), visible only to the people the claim itself is visible to, and absent from the view model rather than hidden in the UI when it is not.
- [x] `FE-0772` Cover the full state set on every conveyance screen: loading, empty, validation, permission-denied, not-found, conflict (already decided), and success.
- [x] `FE-0773` Add unit tests for the chain, the scope rules, attachment access and money handling, and extend the shared flow gate to walk an Employee claim through Team Lead review to HR/Finance/Super Administrator review.
- [x] `FE-0774` Add the three conveyance routes to the responsive, accessibility and content-stress route lists. A gate that does not visit a screen says nothing about it.

**Rules this feature must not break.**

- *Deny by default, receipts included.* A receipt is attachment data, which `AGENTS.md` §2 lists as deny-by-default. It is omitted from the view model for a viewer who may not see it — never rendered blank, and never merely hidden with CSS.
- *Money is money.* The amount reaches the record as a fixed-precision decimal plus a currency code through `src/lib/money.ts`, and is rendered only through `formatMoney`.
- *Time is stored, not guessed.* The submitted instant is UTC plus the local date, timezone and applied policy version, as every other timestamp in this product is.
- *Approval wording is correct here*, for the same reason it is on requisition: a real decision exists. It must never appear on a daily time record.

**Open questions — do not implement past these without an answer.**

1. **No `REQ-*` backs this feature either.** As with requisition, `project_requirement.md` contains no conveyance requirement. Both now need writing and numbering.
2. **"Date/time is the current time" conflicts with the pinned demo clock.** Demo "today" is fixed at 2026-09-02 (`docs/frontend/phase-0/demo-setup.md`), and a component reading `new Date()` would also produce a hydration mismatch. Assumed: the field shows the submission instant supplied by the service, which uses the demo clock — so the demo stays reproducible and the value is real rather than rendered client-side.
3. **What does "Other" mean without a description?** A mode of Self, Uber or Other is unusable for Finance if "Other" carries no detail. Assumed: selecting Other reveals a required free-text description. Confirm, because the alternative is a claim nobody can check.
4. **Visited date and time are separate controls but one instant.** Assumed: combined in Asia/Dhaka, and rejected when in the future — you cannot claim for a journey that has not happened.
5. **Is the amount reimbursable, and does Finance need it in a payroll or expense total?** Nothing was said about what happens after approval. Assumed: the claim records an amount and no total anywhere else consumes it, exactly as requisition does. If Finance expects conveyance to reach an export, that is additional scope.
6. **Is "client name" the same client as `Project.client`?** The product now has client names on projects and a client filter on the timesheet. Assumed: free text, unlinked, because no Client entity exists — but if these are meant to be the same clients, that is an argument for creating one rather than typing the name twice.
7. **File storage is undecided.** `BE-0007`-`BE-0014` have not chosen a storage provider, and no size or type limits have been approved. Assumed for the frontend: a mock upload with an in-memory reference, presented as a prototype and never as a stored file.

### Employee-Raised Tasks

Added after conveyance. Until now every task was created by a Team Lead; an employee can now raise one for themselves, and their Team Lead endorses it.

**The rule that makes this more than a form.** A task an employee raised **accepts no time until it is approved**. Without that, someone could invent a task, record a full day against it, and have the review happen after the hours already exist. It is the same reason an inactive project refuses time (`REQ-WORK-008`), and it is enforced in three places because each covers a gap the others leave: the dropdown omits it (convenience), `validation.ts` refuses a submitted `taskId` (the control, since an id can be posted without opening the dropdown), and the service refuses a Team Lead who is not that employee's own.

**This is deliberately not the shared approval chain.** `src/contracts/approval.ts` models a request travelling to a Team Lead and then to three parallel reviewers. A task is endorsed by one person and then stops being a request — it becomes work that time is recorded against. Forcing it into the chain would add a `reviewer_review` stage and three reviewer roles to a shape that has neither, and put a special case in every transition function for one workflow.

- [x] `FE-0780` Add `TaskReviewState` to the domain, with `taskAcceptsTime` as the single predicate, and enforce it in `selectableTasks` and in `src/lib/calculation/validation.ts` with a field, a message and corrective guidance.
- [x] `FE-0781` Build the employee raise-a-task form, naming the reviewer before anything is typed, restricted to projects in divisions the employee is assigned to, and validated at the service boundary.
- [x] `FE-0782` Build the Team Lead review queue on the team task board, with approve and do-not-approve, a required note on refusal, and a named list region.
- [x] `FE-0783` Surface the queue on the Team Lead dashboard inside the existing waiting-for-you prompt, and add the notification.
- [x] `FE-0784` Add unit tests for the scope, review and time-entry rules, and a `npm run audit:task-review` browser gate.

Evidence is in `docs/frontend/phase-7/task-review-verification.md`: 26/26 task-review flow checks and 41 unit tests, with accessibility 279/279 and content stress 73/73 unchanged.

**Open questions — unchanged by the build.**

1. **No `REQ-*` covers this**, as with requisition and conveyance. `REQ-WORK-003` describes a task's fields but says nothing about who may create one.
2. **A refusal is terminal.** The employee reads the note and raises a new task; there is no edit-and-resubmit. Assumed, not confirmed.
3. **The employee's form is narrower than the Team Lead's** — no assignee, no supporting members, no checklist — because an employee proposes work for themselves. Widening it later is easy; taking a granted power back is not.
4. **An approved task is an ordinary task.** It can then be edited by the Team Lead like any other, and nothing re-opens the review.

Conveyance evidence is recorded in `docs/frontend/phase-7/conveyance-verification.md`: the shared approval chain extracted first and proven behaviour-preserving by re-running the requisition gates unchanged, then 45/45 conveyance flow checks, 50 unit tests, accessibility 279/279 and content stress 73/73.

Requisition evidence is recorded in `docs/frontend/phase-7/requisition-verification.md`: 44/44 requisition flow checks, 40 unit tests, accessibility 248/248 and content stress 68/68 with the three new routes added to those gates.

Phase 7 evidence is recorded in `docs/frontend/phase-7/verification.md`: shared reporting and supporting-module flows 55/55, responsive route/width combinations 268/268, and the complete verification gate passing with 213 tests and a 61-route build.

### Phase 7 Exit Criteria

- [x] Shared reports, export states, notifications, search, and profile/settings patterns are consistent across roles.
- [x] Deferred collaboration and integrations are demonstrable without being represented as production-connected features.
- [x] All navigation destinations have an intentional page, coming-later state, or feature-flag exclusion.
- [x] A requisition can be submitted by an Employee and a Team Lead, routed through the correct review chain, and is invisible to every role it has not reached.
- [x] A conveyance claim travels the same chain on the same shared implementation, and its receipt is subject to the same access rule as the claim.
- [x] An employee can raise a task, their Team Lead reviews it, and no time can be recorded against it until they do.

## Phase 8 - Responsive, Accessibility, and Quality Hardening

### Responsive QA

- [x] `FE-0801` Test every primary route at 375, 768, 1024, and 1440 px.
- [x] `FE-0802` Correct navigation, table, form, chart, dialog, drawer, sticky-action, and safe-area issues at every target width.
- [x] `FE-0803` Test long employee names, long project/task titles, many divisions, large currency values, translated-length labels, and empty values.
- [x] `FE-0804` Verify there is no unintentional page-level horizontal scrolling.
- [x] `FE-0805` Verify timer and primary actions remain reachable on small screens and with the on-screen keyboard visible.

### Accessibility QA

- [x] `FE-0810` Complete keyboard-only testing for login, navigation, time entry, timer, requests, remarks, reports, dialogs, and tables.
- [x] `FE-0811` Verify visible focus, logical focus order, dialog focus trapping/restoration, skip link, headings, landmarks, and page titles.
- [x] `FE-0812` Verify labels, descriptions, live regions, validation announcements, table semantics, chart summaries, and icon accessible names.
- [x] `FE-0813` Verify WCAG AA colour contrast and ensure status, charts, validation, and links do not rely on colour alone.
- [x] `FE-0814` Verify 200% zoom, text resizing, reduced motion, touch targets, and screen-reader use on primary flows.

### Functional and Visual QA

- [x] `FE-0820` Add automated component tests for status classification presentation, duration formatting, filters, responsive navigation, forms, dialogs, and permission-aware controls.
- [x] `FE-0821` Add end-to-end frontend tests for each role's primary demo journey using mock services.
- [x] `FE-0822` Test loading, empty, error, denied, conflict, locked, offline, retry, and success states across all feature modules.
- [x] `FE-0823` Verify fixture totals reconcile across dashboard, timesheet, reports, evaluation, and Finance screens.
- [x] `FE-0824` Run type checks, lint checks, tests, and a production build with no unresolved errors.
- [~] `FE-0825` Perform visual review for spacing, alignment, hierarchy, typography, colour consistency, clipping, overflow, and layout shift.
- [x] `FE-0826` Check that all clickable elements provide hover/focus/pressed/loading feedback and that non-interactive elements do not show misleading pointer behavior.
- [x] `FE-0827` Optimize images, icons, fonts, client component boundaries, route loading, and large-list rendering.

Phase 8 evidence is recorded in `docs/frontend/phase-8/verification.md`: accessibility 217/217, content-stress and interaction 63/63, role journeys 41/41, performance 16/16, responsive route/width combinations 268/268, and the complete verification gate passing with 264 tests and a 61-route build.

`FE-0825` stays `[~]`: its measurable half — type-scale consistency, clipping, overflow, layout shift and colour contrast — is automated and passing, but spacing, alignment and hierarchy judgement needs a person to look at the screens. That review is the same stakeholder walkthrough the Phase 1 showcase criterion is waiting on.

### Phase 8 Exit Criteria

- [x] Primary flows meet the responsive and WCAG 2.2 AA targets.
- [x] Automated checks and the production build pass.
- [x] No critical visual, navigation, permission-presentation, or calculation-presentation defect remains open.

## Phase 9 - Demo Packaging and Backend Handoff

### Stakeholder Demo

- [x] `FE-0901` Create deterministic demo fixtures for all six roles and the five initial divisions.
- [x] `FE-0902` Create a demo scenario showing cross-division time: 3 hours PowerInAI, 2 hours Government Projects, 2 hours WesternCF, and a separate 1-hour break.
- [x] `FE-0903` Create under-time, complete, overtime, critical, missing, leave, WFH, correction, verified, and restricted-data scenarios.
- [x] `FE-0904` Add a development-only demo reset control so every presentation starts from the same state.
- [x] `FE-0905` Prepare a stakeholder walkthrough covering Employee, Team Lead, HR, Finance, Management, and Administrator perspectives.
- [~] `FE-0906` Record stakeholder feedback with owner, priority, decision, and affected requirement/task IDs. Register created; stakeholder sign-off is pending.

### Backend Readiness

- [x] `FE-0910` Inventory every mock query and mutation used by the frontend.
- [x] `FE-0911` Document request inputs, returned view models, validation errors, permission outcomes, pagination, sorting, and filters for every data interface.
- [x] `FE-0912` Map frontend domain types to the core entities in `project_requirement.md` without selecting the MySQL schema prematurely.
- [x] `FE-0913` Identify which interactions should later use server components, server actions, route handlers, background jobs, file storage, or real-time updates.
- [x] `FE-0914` Document authentication, role, division, project, field-level, government-project, salary/cost, and evaluation permission expectations at each boundary.
- [x] `FE-0915` Document calculation fixtures and expected results for backend parity tests.
- [x] `FE-0916` Confirm that no UI component imports fixture storage directly; the typed service boundary and single demo reset seam are documented in `backend-handoff.md`.
- [x] `FE-0917` Produce the backend milestone plan for MySQL persistence, authentication, authorization, business logic, reporting, files, notifications, integrations, audit, testing, and deployment.

### Phase 9 Exit Criteria

- [~] Stakeholders approve the frontend experience or all requested changes are tracked. Feedback register is ready; approval remains pending.
- [x] Every visible workflow has a typed backend contract and documented permission expectation.
- [x] Mock adapters can be replaced incrementally inside the same Next.js application.
- [x] The backend milestone can start without splitting the repository or redesigning approved screens.

## Phase 10 - Role Consolidation: Finance into HR

HR absorbs everything the Finance Manager role did, and the Finance Manager role stops existing. The product goes from six roles to five: Super Administrator, Team Lead, Employee, HR Manager, Management/View-Only.

**This is a permission change before it is a UI change.** Two things must not happen by accident, and both are easy to cause with a careless find-and-replace.

### The Two Traps

**1. Merging the role must not grant every HR user cost and salary data.**

`finance.cost.view` is granted per user today, not per role: `usr-4001` has it, `usr-4002` does not, and that pair is what proves `AC-AUTH-003` — the same screen renders money for one and `Restricted` for the other. HR currently holds none of it. If the merge lets the HR *role* imply the permission, every HR account silently gains salary, cost-rate and budget visibility.

`REQ-RBAC-017` already says cost data is exposed "only through separately granted financial permissions", and the capability matrix already marks HR's cost access as `F` (permission-gated), so keeping the permission separate is what the requirement already asks for. The role merges; the permission does not.

**2. Removing the role must not make historical records unreadable.**

`reviewerRole: 'finance_manager'` is stored on requisition and conveyance review rows, and appears in audit events. Deleting the value from `ReviewerRole` breaks every record that already carries it. The historical value must remain renderable even though no new record can be created with it.

### Tasks

- [x] `FE-1001` Decide and record what replaces the three-reviewer chain. HR + Finance + Super Administrator becomes **two** parallel reviewers, not three; `PARALLEL_REVIEWER_ROLES` in `src/contracts/approval.ts` shrinks and every "all three" label, count and sentence in requisition and conveyance changes with it.
- [x] `FE-1002` Remove `finance_manager` from `RoleKey` in `src/contracts/domain.ts`, keeping a readable historical label for stored `reviewerRole` values so past decisions still render.
- [x] `FE-1003` Fold the Finance navigation group into HR in `src/components/shell/navigation.ts`, deciding whether the section keeps the name "Finance" under HR or is renamed.
- [x] `FE-1004` Update the 11 rules in `src/features/access/route-access.ts` so every `/finance/*` route admits HR, and confirm each still denies Employee, Team Lead and Management.
- [x] `FE-1005` Keep `finance.cost.view` as a per-user grant. Every cost, rate, budget and payroll-money surface stays permission-gated exactly as it is; only the role check changes.
- [x] `FE-1006` Reassign the two Finance demo accounts to HR, preserving the with-permission and without-permission pair that `AC-AUTH-003` depends on. The demo needs an HR account that sees cost and an HR account that does not.
- [x] `FE-1007` Merge the Finance dashboard into the HR experience, deciding whether it becomes a section of `/hr` or stays at `/finance` under HR ownership.
- [x] `FE-1008` Update `src/services/mock/finance.ts`, `reporting.ts`, `admin.ts` and `workspace.ts` so authorization asks for the permission and the HR role rather than the Finance role.
- [x] `FE-1009` Update the requisition and conveyance fixtures, whose seeded review rows record a Finance decision, so the demo still tells a coherent story under the new chain.
- [x] `FE-1010` Update role management in `/admin/roles` and `/admin/users` so the Finance Manager role cannot be assigned, and existing assignments are presented as historical.
- [x] `FE-1011` Update every affected test: `route-access.test.ts`, `navigation.test.ts`, `workspace.test.ts`, `finance.test.ts`, `requisition.test.ts`, `conveyance.test.ts`, `task-review.test.ts`.
- [x] `FE-1012` Update the flow gates that sign in as Finance: `audit:flows6`, `audit:requisition`, `audit:conveyance`, `audit:journeys`, and the responsive, accessibility and content-stress route lists.
- [x] `FE-1013` Add a gate asserting the two traps directly — that an HR account **without** `finance.cost.view` still sees `Restricted` on every money surface, and that a stored Finance-era decision still renders on an existing requisition.
- [x] `FE-1014` Update `docs/frontend/phase-0/demo-setup.md`, `traceability-and-priority.md`, `information-architecture.md` and `terminology-and-formats.md`, all of which name six roles.

Evidence is recorded in `docs/frontend/phase-10/verification.md`: 34/34 role-consolidation checks, `verify` with 409 tests, and every existing gate re-run.

### Phase 10 Exit Criteria

- [x] No `finance_manager` role can be assigned, and the product presents five roles.
- [x] An HR user without `finance.cost.view` sees no cost, rate, budget or salary value anywhere — the merge granted nothing by itself.
- [x] An HR user with the permission can do everything a Finance Manager could.
- [x] A requisition or conveyance record that was decided by Finance still renders its history correctly.
- [ ] `project_requirement.md` has been amended and signed off (see below).

### This Contradicts the Requirements as Written

`project_requirement.md` is the source of truth and currently defines the Finance Manager role. These need amending and business sign-off **before** the build, not after:

| Location | What it says today |
|---|---|
| §4 role list, `REQ-RBAC-003` | Names Finance Manager as an assignable role |
| `REQ-RBAC-016`, `-017`, `-018` | Define the Finance Manager's capabilities |
| §4 capability matrix | Has a Finance column across eleven capability rows |
| `REQ-DASH-007` | Defines a Finance dashboard |
| `REQ-RPT-004`, `REQ-RPT-010` | Define Finance reports and Finance-facing defaults |
| §6.4 | Defines a four-step Finance workflow |

### Open Questions

1. **Does HR keep both halves of the separation of duties?** HR verifies payroll periods (`REQ-RBAC-015`) and Finance consumes the verified result (`REQ-RPT-010`, §6.4). After the merge one role both verifies the hours and produces the payroll cost from them. That may be exactly what a company this size wants, but it removes a check that currently exists, and it should be removed knowingly rather than as a side effect.
2. **Two reviewers or one on requisition and conveyance?** HR + Super Administrator is the direct consequence. If the intent is that HR alone decides, say so — it is a different chain, not a smaller one.
3. **Who inherits `finance.cost.view` on day one?** Named HR users, or nobody until an administrator grants it? Assumed: nobody by default, granted deliberately.
4. **Does the Finance dashboard survive as a screen?** Assumed yes, reachable by HR, because the hours and payroll views are used regardless of which role owns them.
5. **Do the `/finance/*` routes keep their paths?** Assumed yes — renaming them breaks every deep link and audit reference for no functional gain.

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
- [x] `DEMO-11` An Employee submits an in-house requisition, their Team Lead is notified and reviews it, and it then appears for HR, Finance, and the Super Administrator — while a second Employee cannot see it at all.
- [x] `DEMO-13` An Employee submits a conveyance claim with a receipt, their Team Lead reviews it, and it then reaches HR, Finance and the Super Administrator — while a second Employee can see neither the claim nor the receipt.
- [x] `DEMO-15` An Employee raises a task, cannot select it when recording time, and their Team Lead approves it — after which it becomes selectable.
- [x] `DEMO-16` A task the Team Lead does not approve carries the reason back to the employee and still refuses time.
- [x] `DEMO-14` A conveyance claim submitted without a receipt is accepted, because the upload is optional.
- [x] `DEMO-12` A Team Lead submits a new-item requisition and it reaches HR, Finance, and the Super Administrator without a Team Lead review step.

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
| Phase 7 - Shared Reporting and Supporting Modules | Done | 52/52 |
| Phase 8 - Responsive, Accessibility, and Quality Hardening | Done | 17/18 · 1 awaiting review |
| Phase 9 - Demo Packaging and Backend Handoff | In progress | 13/14 · stakeholder sign-off pending |
| Phase 10 - Role Consolidation: Finance into HR | Done | 14/14 · `project_requirement.md` amendment still owed |

Update this table whenever tasks change status. Exit-criteria checkboxes are gates and are not included in the task totals above.
