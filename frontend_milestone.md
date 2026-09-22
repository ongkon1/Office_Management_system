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
| Team Lead | `/timesheets`, `/timesheets/[date]`, `/tasks`, `/tasks/[id]`, `/team`, `/team/timesheets`, `/projects`, `/projects/[id]`, `/workload`, `/requests`, `/evaluations`, `/reports` |
| HR | `/hr`, `/employees`, `/employees/[id]`, `/attendance`, `/hr/timesheets`, `/wfh`, `/leave`, `/evaluations`, `/reports`, `/clients` |
| Finance | `/finance`, `/finance/hours`, `/finance/overtime`, `/finance/project-costs`, `/finance/division-costs`, `/finance/payroll`, `/finance/reports` |
| Administration | `/admin/divisions`, `/admin/users`, `/admin/roles`, `/admin/policies`, `/admin/holidays`, `/admin/audit`, `/clients` |
| Requisition | `/requisitions`, `/requisitions/new`, `/requisitions/[id]` |
| Conveyance | `/conveyance`, `/conveyance/new`, `/conveyance/[id]` |
| Collaboration | `/documents`, `/messages` |
| Meeting Minutes | `/meeting-minutes`, `/meeting-minutes/new`, `/meeting-minutes/[id]`, `/meeting-minutes/[id]/edit` |

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
| 10 | Role consolidation: Finance into HR | The product presents five roles and HR performs every Finance task. Its original per-user cost policy remains historical evidence and is superseded by Phase 12. |
| 11 | Meeting Minutes and AI task generation | Every role can access authorized meeting minutes; permitted users can capture minutes and follow optional AI processing into traceable assigned tasks. |
| 12 | Client Panel | HR and Super Administrators review verified employee hours and internal labour cost by Client and export the same authorized result. |

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
- [x] `FE-0123` Build the top bar with page context, global search trigger, notifications, profile menu, and active timer indicator. **Original scope delivered; the timer-indicator portion is superseded by `modify_milestone.md` Phase F3 (`MFE-0306`).**
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
- [x] `FE-0302` Build today's divisions, active tasks, upcoming deadlines, active timer, and quick actions. **Original scope delivered; active-timer content is superseded by `MFE-0306`, which replaces it with today's active total and Log Work.**
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

- [x] `FE-0320` Build a time-entry drawer or page supporting manual start/end entry and direct duration entry. **Original scope delivered; manual start/end is superseded by `MFE-0301` and `MFE-0305`; duration entry is retargeted to task work logs.**
- [x] `FE-0321` Add date, division, project, task, work location, description, completed work, attachment/link, and break inputs.
- [x] `FE-0322` Dynamically constrain projects and tasks by the selected division and mock assignment dates.
- [x] `FE-0323` Show an immediate calculation preview for entry duration, daily active work, break, total, remaining time, and resulting status.
- [x] `FE-0324` Show field-level validation for invalid ranges, overlap, duplicates, inactive projects, unassigned divisions, approved leave, and missing information. **Original scope delivered; clock-range and overlap rules are superseded by `MFE-0105`; the remaining validation rules stay applicable to work logs.**
- [x] `FE-0325` Require and progressively reveal an overtime reason above eight total hours and a critical explanation above twelve hours.
- [x] `FE-0326` Build save-draft, save, cancel, discard-confirmation, and unsaved-change behavior.
- [x] `FE-0327` Build copy-previous-entry selection and present copied data as a clearly identified editable draft. **Original scope delivered; retargeted to copied work-log drafts by `MFE-0307`.**
- [x] `FE-0328` Build the timer start flow with division/project/task/location context. **Original scope delivered; superseded and removed by `MFE-0305`.**
- [x] `FE-0329` Build global running-timer presentation, elapsed time, pause/stop behavior if approved, and stop-to-draft review. **Original scope delivered; superseded and removed by `MFE-0305` and `MFE-0306`.**
- [x] `FE-0330` Prevent two visually active timers and show recovery UI for a timer restored after refresh. **Original scope delivered; superseded and removed by `MFE-0305`.**

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
- [x] `FE-0781` Build the personal task form, restricted to active projects in the creator's assigned divisions and validated at the service boundary. For Employees it names the reviewer and creates Pending Review. The Team Lead `New task` form includes an explicit `Self (me)` assignee option; choosing it removes supporting members and creates a Team-Lead-only task with no review or self-notification. **Amended 20 September 2026: the consolidated Team Lead assignee flow is implemented and tested.**
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
- [x] A Team Lead can create a self-assigned task without approval, move it through the normal workflow, and record work in their own timesheet once it is In Progress.

## Phase 8 - Responsive, Accessibility, and Quality Hardening

### Responsive QA

- [x] `FE-0801` Test every primary route at 375, 768, 1024, and 1440 px.
- [x] `FE-0802` Correct navigation, table, form, chart, dialog, drawer, sticky-action, and safe-area issues at every target width.
- [x] `FE-0803` Test long employee names, long project/task titles, many divisions, large currency values, translated-length labels, and empty values.
- [x] `FE-0804` Verify there is no unintentional page-level horizontal scrolling.
- [x] `FE-0805` Verify timer and primary actions remain reachable on small screens and with the on-screen keyboard visible. **Original scope delivered; the timer check is superseded by task-board and Log Work checks in `MFE-0408`–`MFE-0410`.**

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

> **Superseded in part, 20 September 2026.** The tasks and evidence below stay as the record of what shipped. Its central decision — that `finance.cost.view` remains a **per-user** grant (`FE-1005`) — is superseded by the amended `REQ-RBAC-017`, which gives HR Managers and Super Administrators that permission through their roles. Phase 12 adopts the new policy on the frontend and Backend Phase 14 on the server; the two must cut over together. Until then the running code is per-user, exactly as described here.

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

## Phase 11 - Meeting Minutes and AI Task Generation

Every active authenticated role can reach Meeting Minutes. Access to an individual minute still follows client, project, division, and sensitive-project scope. Employee and Management/View-Only are read-only; Team Lead, HR, and Super Administrator may create minutes, while editing, archival, retry, and AI processing are limited to the creator or an explicitly authorized administrator.

**Depends on** the shared shell and access states (Phases 1-2), projects/tasks and employee matching inputs (Phases 3-5), notifications/search (Phase 7), and requirements `REQ-MTG-001`-`024`. This phase defines frontend contracts and a mock-backed experience; the AI provider and durable processing belong to Backend Phase 13.

### Information Architecture and Contracts

> **Amended 2026-09-15:** Employee is read-only, like Management/View-Only. `/meeting-minutes/new` and `/meeting-minutes/*/edit` now admit only Team Lead, HR, and Super Administrator. The `FE-1101`–`FE-1104` evidence below predates this and describes Employee as a creator; the route rules, tests, contract, and documentation have been updated.

- [x] `FE-1101` Add Meeting Minutes to every active role's navigation, preserving Management/View-Only as read-only and enforcing feature-flag and route access consistently.
- [x] `FE-1102` Add `/meeting-minutes`, `/meeting-minutes/new`, `/meeting-minutes/[id]`, and `/meeting-minutes/[id]/edit` to route, breadcrumb, mobile-navigation, deep-link, and planned-screen documentation.
- [x] `FE-1103` Define typed models for Client, meeting-minute summary/detail, AI processing status, processing attempt, extracted decision, generated-task link, team-match outcome, and safe processing error.
- [x] `FE-1104` Define service operations for authorized list/search/filter, create, read, update, archive, request processing, retry processing, and opening linked tasks, all returning `Result<T>` values.
- [x] `FE-1105` Ensure raw prompts, raw AI JSON, provider diagnostics, match internals, and unauthorized record counts never enter ordinary UI models.

`FE-1101` evidence: the `meetingMinutes` flag (`src/contracts/feature-flags.ts`), one navigation entry per active role (`src/components/shell/navigation.ts`), and route rules in `src/features/access/route-access.ts` — every role reads `/meeting-minutes`, while `/meeting-minutes/new` and `/meeting-minutes/*/edit` exclude Management/View-Only through a new one-segment wildcard. Until `FE-1110` onward ship, `/meeting-minutes` is registered in `src/features/access/planned-routes.ts` so the link renders the Phase 11 planned screen instead of a 404. Verified by 7 new unit tests (22/22 in the two suites), `npm run verify` (459 tests, contrast 48/48, production build), and a browser probe of all five roles: one sidebar entry each, Management refused create and edit, the flag removing entry and route together, and no bottom-navigation slot or horizontal scroll at 375 px.

`FE-1102` evidence: `docs/frontend/phase-0/information-architecture.md` adds Meeting Minutes to all five role navigation maps (Section 1, with the drawer rather than a bottom-navigation slot) and a new Section 3.6. It covers the four routes with route-level roles, service-level record rules and owning tasks; `<h1>`, document titles, breadcrumbs and mobile back targets; back and post-save behaviour; deep links, including identical not-found for out-of-scope ids, archived minutes, notification and task links, and URL query keys; mobile navigation; and planned-screen status with its removal condition. Breadcrumb, title and deep-link rules are also referenced from Sections 3.2 and 3.4. `AGENTS.md` no longer says `PLANNED_ROUTES` is empty. All cited `FE`, `REQ` and `AC` ids were checked to exist, and table column counts were checked. The documented current behaviour was verified by a 12/12 browser probe: every path and any id renders the Phase 11 planned screen, all four routes show the "module is not enabled" denied screen with the flag off, and Management gets the role-denied screen on `/new` and `/[id]/edit` while the list and a record stay readable. Screen-to-requirement traceability rows and terminology stay with `FE-1136`.

`FE-1103` evidence: `src/contracts/meeting-minutes.ts` defines `Client`, `ClientRef` and `ProjectClientLink` (linked, unresolved legacy label, or none; `Project.client` stays untouched for historical reads); the stored `MeetingMinute` with sanitized content, archive fields and optimistic version; `MinuteProcessingStatus` with its legal moves held as data (`Processed` terminal, retry only from `Failed`); `ProcessingAttempt`; `MeetingSummary` and `ExtractedDecision`; `TeamMatchOutcome` (mentioned assignee, matched with named criteria in `REQ-MTG-013` order, or unassigned with no employee reference); `GeneratedTaskLink` (system-generated, immutable minute/attempt link, initial status Pending for the requirement's "Todo"); and `SafeProcessingError`, which has a closed code set and no free-text field, with wording only from `SAFE_PROCESSING_ERROR_MESSAGE`. View models cover list rows, detail, generated tasks and a task's source minute; restricted variants carry nothing identifying. Prompts, raw responses, provider/model ids, idempotency keys and match scores are not modelled. Verified by `src/contracts/meeting-minutes.test.ts` (12 tests, including type-level assertions confirmed to fail when a message field or an unassigned employee id is added), eslint, and `npm run verify` (471 tests, contrast, production build). Service operations remain `FE-1104`.

`FE-1104` evidence: `MeetingMinutesService` in `src/contracts/meeting-minutes.ts` defines thirteen operations, each taking the viewer and returning `Result<T>`: authorized `list` (search, client/project/processing-status/created-date/archived filters, newest-first default sort, post-authorization counts and client options, and the `appliedFilters` it actually used), `get`, `createContext`, `listProjectOptions` (active, authorized projects for one client), `create` (minute saved first, then an optional queued attempt; a queueing failure still succeeds with a `PROCESSING_NOT_STARTED` warning), `editContext`, `update` (no `processWithAi`, so an edit never starts or repeats AI), `archive`, `requestProcessing`, `retryProcessing`, `getProcessingSnapshot`, `openGeneratedTask` and `getTaskSourceMinute`. Creates, archives and processing requests carry an idempotency key; edits, archives and processing requests are version-checked. `MEETING_MINUTE_OPERATION_FAILURES` records which failures each operation may return: reads by id return not found and never permission denied, every write can refuse Management/View-Only, and every change to an existing minute can conflict. Field limits (provisional until `BE-1311`) and validation codes are defined for `FE-1114`. `QUERY_PARAM_KEYS` gains `client`, `processing` and `archived`, checked to collide with no existing key, and `docs/frontend/phase-0/information-architecture.md` Section 3.6 names them. Verified by 11 new tests (23/23 in the suite), including type-level assertions confirmed to fail when an edit input gains `processWithAi` or an operation returns a non-`Result`; eslint; and `npm run verify` (482 tests, contrast 48/48, 60-route production build). Mock implementation arrives with the screens and fixtures (`FE-1110` onward, `FE-1130`).

`FE-1105` evidence: `src/contracts/meeting-minutes.ts` adds two guards over one shared list of protected name patterns (`raw…`, `prompt`, `diagnostic`, `provider`, `score`, `confidence`, `candidate`, `idempotency`, `correlation`, `stacktrace`, `fingerprint`, `matchevidence`, `model`/`modelId`/`modelName`/`modelVersion`/`schemaVersion`) and one allowlist of count fields computed after authorization (`totalItems`, `totalPages`, `attemptCount`, `generatedTaskCount`); any other `…Count` or `total…` field is treated as a leak. `ProtectedKeysIn<T>` checks every nested property name at compile time and is asserted `never` for every view model and for the success data of all thirteen `MeetingMinutesService` operations. `findProtectedMeetingMinuteFields` scans real payloads at run time, reports offending paths without echoing values, and handles arrays and cycles, for reuse by `FE-1131` and `BE-1343`. The first version of the compile-time guard tested the whole key union at once and passed vacuously on nested fields; typecheck caught this, and the guard now checks one key at a time. A probe adding `providerDiagnostics` deep in the detail view and `rawAiJson` in list items is rejected by typecheck. Verified by 7 new tests (30/30 in the suite), eslint, and `npm run verify` (501 tests, contrast 48/48, 60-route production build).

### List and Capture Experience

- [x] `FE-1110` Build the responsive list showing title, client, project, creator, created date, AI requested Yes/No, text-labelled status, and permitted actions.
- [x] `FE-1111` Add authorized search and filters for client, dependent project, processing status, and created-date range, including clear-all and preserved URL state.
- [x] `FE-1112` Provide loading, empty, no-results, denied, recoverable-error, and populated states without revealing unauthorized counts or suggestions.
- [x] `FE-1113` Build the Add Meeting Minute form with required title, client, dependent active-project selection, accessible long-form/rich-text content, and Process with AI choice.
- [x] `FE-1114` Clear an incompatible project when the client changes and provide field-level message plus corrective guidance for every validation error.
- [x] `FE-1115` Make Save communicate that the minute is stored first; when AI is selected, show saved success and Pending status without blocking on AI completion.
- [x] `FE-1116` Build Edit and Archive flows with ownership/permission states, confirmation, focus restoration, optimistic-version conflict handling, and historical-preservation wording.

`FE-1110` evidence: `/meeting-minutes` is now a real page (`src/app/(app)/meeting-minutes/page.tsx`, `src/features/meeting-minutes/meeting-minutes-list.tsx`); the planned-route entry remains only for `/new`, `/[id]` and `/[id]/edit`. Each row shows title (with an Archived badge), client, project, creator, created date, AI requested Yes/No, and processing status through the new `ProcessingStatusIndicator` (shape + text + colour, from `describeMinuteProcessingStatus` in `src/lib/status.ts`). Rows offer View and, when the service allows, Edit, each with the minute's title in its accessible name. The table becomes cards below 768 px, paginates without unmounting the pager, and shows Add meeting minute only to creator roles; read-only roles see an explanatory note. `src/services/mock/meeting-minutes.ts` implements `list` over seed data in `src/fixtures/meeting-minutes.ts` (four clients from existing project labels, project-client links, and six minutes covering every processing status, a government-project minute and an archived one). It applies division and government-project scope before rows, counts, client options and applied filters, so a hidden project filters identically to a nonexistent one. It searches title, client and project but never content, and sets actions per viewer: none for Employee and Management/View-Only, edit/archive for a creator role's own minutes or any readable minute for the Super Administrator, processing only where the status allows, and nothing once archived. The service is registered in demo reset. Verified by 22 service tests (including the protected-field scan for all five roles); a 229/229 browser probe of five roles at 375, 768, 1024 and 1440 px checking row counts, Edit placement, the Add button, the read-only note, status text, 24 px targets, government-minute visibility, cards on phones and no console errors; the responsive audit (8/8 route and width combinations; route added for Employee and Team Lead); the accessibility audit (22/22; route added); eslint; and `npm run verify` (523 tests, contrast 48/48, 61-route production build). Search and filter controls are `FE-1111`; the remaining list states are `FE-1112`.

`FE-1111` evidence: the list (`src/features/meeting-minutes/meeting-minutes-list.tsx`) adds search (title, client and project, never content; applied 300 ms after typing stops) and Client, dependent Project, Status, Created from/to and Include archived filters, with removable chips, Clear all, a polite result count, a no-results state with its own clear action, and filters that collapse behind a Filters button on phones. The URL is the only list state: `src/features/meeting-minutes/list-url-state.ts` parses and serializes it with `QUERY_PARAM_KEYS` (comma-separated multi-values, defaults omitted, malformed or out-of-range values dropped), and every change uses `replace` and returns to page 1. The service now also returns `projectOptions` (every visible project linked to a client, inactive included, each with its `clientId`); choosing clients limits the Project options and clears incompatible projects. After each response the URL is rewritten to the filters the service actually applied, so a hidden project disappears exactly like a nonexistent one, and responses are tagged with the URL they answer so a late one cannot strip a newer filter. Browser testing found that controls bound directly to the URL briefly reverted after a click, because `router.replace` settles asynchronously; they now read a draft that changes immediately and resyncs from the URL. The page wraps the list in a Suspense boundary, as the bundled Next.js 16 docs require for `useSearchParams` in a prerendered route. Verified by 10 URL-state tests and 5 new service tests (37/37 across both suites); a 39/39 browser probe covering the real filter controls, dependent project clearing, reload persistence, debounced search keeping focus, Clear all, no results, hidden-versus-nonexistent project URLs, the date and archived filters, the checkbox updating immediately, malformed URLs, and 375 px with the filter panel open; the FE-1110 probe rerun (229/229); the responsive audit (8/8) and accessibility audit (22/22) on the final code; eslint; and `npm run verify` (538 tests, contrast 48/48, 61-route production build). `docs/frontend/phase-0/information-architecture.md` Section 3.6 records the URL format.

`FE-1112` evidence: `src/features/meeting-minutes/list-view-state.ts` resolves the list into exactly one state: loading, refreshing, populated, empty, no-results, denied, signed-out, error (retryable or not, with a safe reference) or invalid. `denied` and `signed-out` are typed to carry no list data at all, so they cannot show a count, a name, a filter option or a control. The list renders each state: a loading status on the first request; controls kept mounted with a loading table afterwards; distinct empty (with Add for creator roles) and no-results (with Clear all filters) messages; denied and signed-out as an alert with only the page title, signed-out linking to `/login?returnTo=` the same filtered address; a recoverable error with Try again; a non-retryable error without it; and invalid list settings with Reset the list. Failure messages are fixed copy, never the service's own text, and only the support reference is shown. After a later request fails, the filters stay usable from the viewer's own last answer, but no stale rows or count are shown. The result count is announced only once the service has answered for the current URL. Nothing in the seed data fails, so the mock adapter gained a demo- and test-only fault switch (`setMeetingMinutesListFault`, or the `oms.mock-fault.meeting-minutes-list` localStorage key), cleared by demo reset. Browser testing showed a first design could never display the error, because React's development double-invoke used up a fail-once fault on the discarded request; the fault is now read before the simulated latency and persists for 100 ms. Verified by 6 state-resolver tests (including type-level checks that denied and signed-out carry no data) and 9 rendered component tests covering every state and leak checks (82/82 across the five Meeting Minutes suites); a 43/43 browser probe at 1440 and 375 px covering the loading announcement, populated count, no results, denied, signed-out return link, recovery through Try again, the fatal error, Reset the list, the true empty state for a viewer who can read nothing, no leaked names or counts, no horizontal scroll and no console errors; the FE-1111 (39/39) and FE-1110 (229/229) probes on the final code; the responsive (8/8) and accessibility (22/22) audits, which cover the populated state; eslint; and `npm run verify` (553 tests, contrast 48/48, 61-route production build).


`FE-1113` evidence: `/meeting-minutes/new` is now a real page (`src/app/(app)/meeting-minutes/new/page.tsx`, `src/features/meeting-minutes/meeting-minute-form.tsx`); the planned-route entry now serves only `/[id]` and `/[id]/edit`. The form takes a required title, a client, a project dependent on that client, the minute itself, and a Process with AI choice, with a sticky action bar that stays reachable above the mobile keyboard. The client list is built from projects the viewer may actually use, so a client reachable only through a government project never appears as an option; choosing a client fetches its **active** projects from the service, and changing the client clears the project rather than leaving one client's project selected under another's name. The content editor is a long-form textarea, not a contenteditable surface: `REQ-MTG-006` asks for accessible long-form *or* rich text, and a textarea keeps platform labelling, error wiring and mobile keyboards instead of rebuilding them. Markup is sanitized in the service, never by the form. `src/lib/minute-content.ts` is the only producer of `SanitizedMinuteContent`: it drops `script`, `style`, `iframe`, `object` and `embed` **with their text**, keeps the text of any other disallowed tag, strips every attribute from the seven allowed tags, escapes what still looks like markup, and returns an empty string when nothing survives — which the service reports as `CONTENT_EMPTY_AFTER_SANITIZING` rather than storing a blank minute. `src/services/mock/meeting-minutes.ts` adds `createContext`, `listProjectOptions` and `create`: an unknown, inactive or invisible client returns an empty project list rather than an error, so it cannot be distinguished from one that does not exist; the client and project are re-validated on save rather than trusted from the picker, and a project outside the viewer's scope returns the same `PROJECT_NOT_FOR_CLIENT` answer as a genuine mismatch; the minute is committed before AI is considered, and the choice alone decides Pending versus Not Processed (`REQ-MTG-007`–`REQ-MTG-009`); a repeated idempotency key returns the first outcome and creates no second minute. Browser testing found two defects in the form's first version: `useAsync({ keepPrevious: true })` on the project list left one client's projects on screen labelled as another's, and the error summary's entries were buttons that moved focus nowhere — both are fixed and covered by tests. Verified by 9 sanitizer tests, 20 new service tests (48/48 in the suite) and 8 rendered form tests; a 50/50 browser probe of five roles covering the client and project option sets, the government client hidden from HR and Team Lead, the project select waiting for a client, the inactive project excluded, empty-save messages with their guidance, a real save opening the new minute, the minute appearing in the list as Pending, no horizontal scroll and a reachable Save at 375 px, and the role-denied screen for Employee and Management with no client name on it; the full responsive audit (319/320, route added for Team Lead and passing 4/4 — the single failure is `/tasks` at 768 px for a Team Lead, which reproduces unchanged on the tree without this work and belongs to the Tasks screen); the accessibility audit (331/331, route added and passing 10/10); eslint; and `npm run verify` (620 tests, contrast 48/48, a production build that prerenders `/meeting-minutes/new` as a static route). The per-screen document title in `docs/frontend/phase-0/information-architecture.md` Section 3.6 is still the root `Timesheet` title, as it is for every other `(app)` route; that gap is product-wide, not new here. Clearing an incompatible project and the full validation presentation continue in `FE-1114`; the save messaging and the Pending hand-off in `FE-1115`.

`FE-1114` evidence: every one of the six codes in `MeetingMinuteValidationCode` now reaches its own field carrying the service's message **and** its corrective guidance (`REQ-TIME-025`), wired through `Field`'s `aria-describedby` with `aria-invalid` set. `PROJECT_INACTIVE` was unreachable before this task — `src/services/mock/meeting-minutes.ts` answered every unusable project with `PROJECT_NOT_FOR_CLIENT` — and is now returned for the one case where it discloses nothing: a project the viewer can already see in the list's filters, under the client they chose, that is no longer active. A project of another client, one outside the viewer's scope, one that does not exist, and any project chosen under a client the viewer cannot use all keep the generic answer, so the pair still cannot be used to probe for projects. On the screen (`src/features/meeting-minutes/meeting-minute-form.tsx`): editing a field drops that field's error and leaves the others, since the service's answer describes the values it was sent rather than the ones on screen now; changing the client clears both the project and its error; a derived guard drops a selected project that the current option list no longer offers, so what is submitted is always something the list contains, computed during render rather than in an effect the React Compiler rules forbid; and one failure moves focus to its own control through the service's `focusField` while several focus the summary, which lists them in field order. The two length limits were unreachable from the UI because `maxLength` capped both controls — a pasted minute was silently truncated instead of refused — so the caps are gone and the over-limit state is stated in words ("5 characters over the limit", "10 over the limit") as well as in colour, which is what `AGENTS.md` requires of any status carried by colour. Verified by 13 new service tests covering each code's field, message, guidance and focus target, an assertion that the seven cases together exercise all six codes, and two non-disclosure cases (61/61 in the suite); 6 new form tests (14/14); a 25/25 browser probe reading each field's real `aria-describedby`, the summary taking focus for several failures and a field for one, error clearing on edit, the client change clearing the project, the inactive project absent from the options, both uncapped controls, and no horizontal scroll at 375 px with errors shown; the FE-1113 probe rerun unchanged (50/50); the accessibility audit (331/331, including the live-region announcement of a validation failure); the responsive audit filtered to this route (4/4 — the full 320-combination run under `FE-1113` is unaffected by a change confined to this screen, and its one failure, `/tasks` at 768 px, is pre-existing); eslint; and `npm run verify` (639 tests, contrast 48/48, production build). One `FE-1113` service test asserted `PROJECT_NOT_FOR_CLIENT` for an inactive project and now asserts `PROJECT_INACTIVE`; the narrowing is deliberate and noted in the test. Save messaging and the Pending hand-off remain `FE-1115`.

`FE-1115` evidence: a completed save is now a screen state rather than a toast, because the answer has to survive being read slowly — a toast saying processing is Pending is gone before anyone has decided what to do, and when a run could not be started at all, that sentence is the only notice the user gets until they open the minute. `SavedPanel` in `src/features/meeting-minutes/meeting-minute-form.tsx` leads with **the minute is saved** in every case — the fact `REQ-MTG-007` guarantees — and reports the processing outcome after it, never as a condition of it: Not Processed when AI was not asked for (`REQ-MTG-008`), Pending with "nothing here is waiting on it" when a run was queued (`REQ-MTG-009`), and a warning that the minute was saved but the run could not be started. It offers View the minute, Add another and Back to Meeting Minutes, and its first line is a `role="status"` so the replacement of the form is announced. There are three outcomes here, not two; a screen branching only on success versus failure gets the third wrong, because the save *succeeded*. The third was unreachable before this task: `create` in `src/services/mock/meeting-minutes.ts` always queued, so `MeetingMinuteWarningCode` and the `processingStarted: false` branch of `MeetingMinuteSavedView` had no producer. It now derives `processingStarted` from the stored status rather than from the user's choice, stores a refused job as `failed` with the safe retryable `queue_unavailable` error while keeping the minute, and returns the `PROCESSING_NOT_STARTED` warning — including on a repeat of the same idempotent save, so the second answer tells the same story as the first. A demo- and test-only create-fault switch (`setMeetingMinutesCreateFault`, or the `oms.mock-fault.meeting-minutes-create` localStorage key, cleared by demo reset) makes both the refused-queue and failed-save paths demonstrable. The form also now holds **one idempotency key per attempt at the same content**, kept across a retry and cleared when the content changes or the save succeeds: a fresh key per click is the natural-looking version and it is wrong, because a save that stored the minute but lost its response would write a second minute on the next click (`REQ-MTG-023`). Two smaller defects fixed on the way: the attempt id was built from `nextMinuteNumber` *after* the id had already incremented it, so it pointed at the next minute; and the Save button now says "Saving the minute" while in flight, with the AI card stating the order of operations before the button is ever pressed. Verified by 8 new service tests (69/69 in the suite) and 8 new form tests (22/22), covering all three outcomes, the failed save storing nothing, the repeated key, key reuse across a retry, a fresh key for the next minute, and a second click while the first save is in flight; a 19/19 browser probe covering the three outcomes, the save answering in the length of a write rather than a provider call, saved-before-status ordering in the DOM, input preserved after a failed save, a retry producing exactly one record, Add another emptying the form, and no horizontal scroll at 375 px; the FE-1114 (25/25) and FE-1113 (50/50) probes rerun; the accessibility audit (331/331); the responsive audit filtered to this route (4/4); eslint; and `npm run verify` (654 tests, contrast 48/48, production build). **One documented deviation:** `docs/frontend/phase-0/information-architecture.md` Section 3.6 has saving redirect to the new minute's detail page, which is still the Phase 11 planned screen — redirecting there today would hide every outcome this task exists to communicate. Section 3.6 now records the saved state as current behaviour and the redirect as correct once `FE-1120` ships the detail page; `View the minute` already links there, so it is a one-line change. Two earlier tests and the FE-1113 probe asserted that redirect and were updated to the saved state. **Updated by `FE-1120`:** the detail page now exists, so the redirect was restored and the saved panel removed, as promised here. What Save communicates is unchanged — the notice still distinguishes a queued run from one that could not be started, and the minute's own page carries the status and the safe error.

`FE-1116` evidence: `/meeting-minutes/[id]/edit` is now a real page (`src/app/(app)/meeting-minutes/[id]/edit/page.tsx`, `src/features/meeting-minutes/meeting-minute-edit.tsx`), so the list's Edit action reaches a screen instead of the planned placeholder, and `PLANNED_ROUTES` now serves only `/meeting-minutes/[id]`. The fields were **extracted rather than copied** into `src/features/meeting-minutes/minute-fields.tsx`, shared by Add and Edit: the client-to-project dependency, the two reachable length limits and every hint are rules, and a second copy drifts into one form accepting a pair the other refuses. Each form keeps only what differs — its service calls, its actions and what it does afterwards. `src/services/mock/meeting-minutes.ts` adds `editContext`, `update` and `archive` behind one `gateChange` helper, applied in the order the rules demand: a minute the viewer cannot read is `not_found`, identical to a nonexistent id (`AC-MTG-009`); `permission_denied` is reached only for a minute they can already read, so "you may not change this one" discloses nothing; and an archived minute is a **conflict**, not a denial, because the record is readable and the viewer entitled to it while its state no longer accepts changes. Stored content is converted back to plain text for the textarea through `minuteContentToPlainText`, the same module that sanitized it — the round trip has one owner. An edit leaves `processWithAi`, the processing status, the attempt link and the processed time exactly as they were, which is why `UpdateMeetingMinuteInput` has no `processWithAi` field; the version is checked **before** validation, so a user is never sent to fix text against a version they have not seen. One rule needed deciding and is now tested both ways: an **unchanged** client and project are accepted even if they would no longer be offered today, because a project deactivated after the meeting is not a reason to refuse a typo fix, while **changing** either still has to land on something currently valid. `editContext` therefore also offers the minute's own client and project even when they are no longer creatable. Archive keeps everything (`REQ-MTG-018`): content, processing history and generated-task links all survive, the minute leaves the default list and stays findable through Include archived, and both the page and the dialog say so in those words, because "Archive" alone reads as "remove". The confirmation is the shared `Dialog`, which traps focus and returns it to the trigger, and its request carries one idempotency key so a repeat returns the first outcome rather than a conflict. A stale version on either operation is refused with a **Reload the minute** action and the user's own text left on screen — their words are never written over someone else's silently, and never discarded by the refusal. Verified by 22 new service tests (91/91 in the suite) covering the load, the three refusals, hidden-equals-missing, the version check writing nothing, the unchanged-pair allowance, archive preserving content and processing, the repeated key, the second archive conflicting, and four role refusals; 15 new screen tests (15/15) including focus returning to the trigger and Escape archiving nothing; a 25/25 browser probe covering the list's Edit link, a real edit appearing in the list, all four refusals, the archived-minute message, the confirmation wording, focus restoration, archiving leaving and re-entering the list, and no horizontal scroll with a reachable confirm at 375 px; the FE-1115 (19/19), FE-1114 (25/25) and FE-1113 (50/50) probes rerun unchanged; the accessibility audit (341/341, route added and passing 10/10); the responsive audit filtered to the new route (4/4, route added to the full list); eslint; and `npm run verify` (692 tests, contrast 48/48, production build). `docs/frontend/phase-0/information-architecture.md` Section 3.6 records the edit and archive behaviour and now lists `/[id]` as the only remaining placeholder.

`FE-1120` evidence: `/meeting-minutes/[id]` is now a real page (`src/app/(app)/meeting-minutes/[id]/page.tsx`, `src/features/meeting-minutes/meeting-minute-detail.tsx`). It shows the title as the `<h1>`, the client, project, creator, created and last-updated times, the stored content, and — kept deliberately apart — the **AI choice** and the **processing status**, because a minute can have asked for AI and still be showing a failure, and reporting only one of the two hides which. The status carries shape, text and colour through `ProcessingStatusIndicator`; a missing processed time is written `—`, never blank and never zero. Edit appears only when the service says the viewer may change the minute, so a reader, another creator and an Employee all see the same page without it. An archived minute stays readable, as links from generated tasks require (`REQ-MTG-018`), and says what archiving kept. `src/services/mock/meeting-minutes.ts` adds `get`, which has **no** `permission_denied` branch by design: an out-of-scope id and a nonexistent one return the identical not-found result, and the page keeps a generic `Meeting minute` heading until the service has authorized the record, so no title leaks through the heading or the breadcrumb (`AC-MTG-009`, `AC-AUTH-004`). Stored content is rendered as markup through `dangerouslySetInnerHTML`, and the component says why in full: `content` is `SanitizedMinuteContent`, a value only the service produces and only by passing raw input through `sanitizeMinuteContent` — the page must never be handed a string from anywhere else and must never sanitize one itself. Two follow-through changes came with the page. First, the post-save **redirect is restored**: `FE-1115` could not open the minute while `/[id]` was a placeholder and used a saved state on `/new`, which its evidence recorded as temporary; saving now opens the new minute showing Pending, exactly as `docs/frontend/phase-0/information-architecture.md` Section 3.6 specifies, the saved panel and its Add another action are gone, and the queue-failure reassurance survives because the minute's own page carries the safe error. Second, `PLANNED_ROUTES` is **empty again** — all four Meeting Minutes routes are real pages — while the planned-screen mechanism stays for the next time navigation runs ahead of a screen. One defect was found by the full test run rather than by inspection: the edit screen routed even its **unchanged** project options through a promise, so the select rendered empty for a frame on a minute whose project was never in doubt; it now uses the options the edit context already carries and asks the service only when the client changes. Verified by 6 new service tests (97/97 in the suite) including the hidden-equals-missing pair and a sweep proving `get` never answers `permission_denied` for any of five roles against a readable, a hidden and a nonexistent id; 13 new screen tests covering the facts shown, content rendered as markup rather than escaped text, the em-dash processed time, the safe error without provider detail, the archived notice, Edit per viewer, and recovery from a failed load; a 30/30 browser probe across five roles covering the page, the never-processed and failed minutes, the archived minute, read-only roles, hidden-equals-missing, the list's View link, a save landing on its own minute showing Pending, and no horizontal scroll at 375 px; the FE-1116 (25/25), FE-1114 (25/25), FE-1115 (18/18, updated for the redirect) and FE-1113 (50/50, updated) probes rerun; the accessibility audit (351/351, route added); the responsive audit filtered to the new route (4/4, route added to the full list); eslint; and `npm run verify` (710 tests, contrast 48/48, production build). The AI summary and decisions (`FE-1122`), the generated-task table (`FE-1123`), traceability (`FE-1124`), retry (`FE-1125`) and live status refresh (`FE-1126`) attach to this frame; `toDetailView` still returns no interpretation and no generated tasks until those tasks wire them.

`FE-1121` evidence: the five states were already drawn by `ProcessingStatusIndicator` (`FE-1110`) as a label, a distinct icon and a tone, and this task proves that and adds the two things it lacked. **Meaning:** `ProcessingStatusDescriptor` in `src/lib/status.ts` — still the one place status presentation lives — now carries a plain-language `meaning` for each state, shown on the detail page under the processing facts, because a label names a state without saying what it implies or what happens next; every one of them keeps the minute apart from its processing, since the minute is saved in all five. **Announcement:** a new `ProcessingStatusAnnouncer` (`src/components/ui/processing-status-announcer.tsx`, in its own client module because the indicator's file is also imported by server components) speaks a change through a polite, atomic live region using the descriptor's `announcement` copy. What counts as meaningful is written down and tested: nothing on first sight of a record, since the badge is already on screen; nothing for an unchanged status; nothing when the record itself changes, which is navigation; and `null` means "not known right now", so the last known status is held through a reload and a refresh that lands on a new status is still announced as the change it is. The region is always rendered and empty until it has something to say, because a region that appears in the same update as its text is not reliably announced; it is polite even for a failure, since nothing is lost by finishing the current sentence first. The detail page mounts the announcer **outside** its loading, failure and success branches: a refresh passes through `loading`, and an announcer inside the success branch would remount there and mistake every change for first sight — an integration test drives exactly that path through the real page and the real refetch. Pending and Processing share a tone; a test asserts that any two states sharing a colour differ in both shape and label, which is what makes the shared colour acceptable. Measured contrast of each rendered badge label on its own opaque background: Not processed 7.77:1, Pending and Processing 4.92:1, Processed 6.81:1, Failed 4.58:1 — all clear AA, Failed with the least margin; the tokens are unchanged and still pass the stylesheet audit. The Processing icon is static, so reduced motion needs no special case. Verified by 5 new indicator tests (13/13), 14 announcer tests covering every rule above, 8 new detail-page tests (21/21) including all five seeded states with their meaning and the announcement arriving across a refresh; a 54/54 browser probe covering each state's text, icon, hidden-icon semantics, measured contrast and meaning, the live region present, polite and silent on arrival, navigation between minutes announcing nothing, all five badges on the list, and reduced motion at 375 px; the FE-1120 probe rerun (30/30) after the page was restructured; the accessibility audit (351/351, detail route 10/10); the responsive audit on the detail and list routes (4/4 and 8/8); eslint; and `npm run verify` (741 tests, contrast 48/48, production build). **Two limits, stated plainly.** A status *transition* cannot yet be produced in a browser — nothing in the mock moves a minute between states until `FE-1126` schedules refreshes — so the announcement is verified in jsdom through the real component tree, not heard in a browser. And port 3000 was found serving an unrelated application during this task, so every browser check here ran against this project's dev server on port 3100; the probes now read `PROBE_BASE`.

`FE-1122` evidence: the detail page now carries the AI's reading of a minute in its own section, `src/features/meeting-minutes/ai-interpretation.tsx`, placed directly after the human minute so the two can be compared and never interleaved. It is a named region with its own `h2`, labelled **AI-generated** in words beside a decorative icon, and states that it is not part of the minute; the summary and the decisions (an ordered list, by extracted position) sit under `h3`s styled a step below the section heading. It is a separate section from the generated tasks that `FE-1123` adds, because those are work created from the meeting, not a description of it. Model output is **rendered as plain text** — `REQ-MTG-012` treats it as untrusted, so it never goes near the `dangerouslySetInnerHTML` path that renders the service-sanitized minute; a test feeds it an `<img onerror>` and a `<script>` and finds neither element created. When there is no interpretation the section says why, per status, rather than disappearing. Data: `src/fixtures/meeting-minutes.ts` adds `MEETING_SUMMARIES` and `EXTRACTED_DECISIONS` for the processed `min-1001` (`FE-1130` extends the case list), and `toDetailView` in `src/services/mock/meeting-minutes.ts` now attaches an interpretation only for a `processed` minute and only from its **latest** attempt, since an earlier run's reading was superseded. It has no authorization of its own and no restricted variant, because it is derived only from content the viewer is already allowed to read — a reader and the owner receive the same value, and a minute outside scope is not found, interpretation included. **One contract addition:** `MeetingMinuteDetailView.interpretation` gains `basedOnEarlierContent`. Editing never re-runs AI (`FE-1116`), so without it a summary would silently describe text that is no longer on the page; the mock records the content each successful run read and compares it as plain text, so a title-only edit or a formatting-only round trip through the editor is not mistaken for drift. When it is set, a warning is shown **above** the summary so it is read first, and the interpretation is kept and labelled rather than discarded. The field name passes the `FE-1105` protected-key guard, and the contract test's sample view was updated. Verified by 10 new service tests (107/107 in the suite) covering the latest-attempt rule, no interpretation in the four other states, the same value for owner and reader, the drift flag set by a content edit and not by a title-only edit, and no protected field; 10 component tests covering the labelled region, ordered decisions, escaped model output, the per-status explanations, the warning's position, an empty decision list, and the section's separation from and position after the minute on the real page; a 23/23 browser probe covering all of that plus a live edit producing the warning, the heading outline and no horizontal scroll at 375 px; the FE-1121 (54/54) and FE-1120 (30/30) probes rerun; the accessibility audit (351/351, including no skipped heading level on the detail page); the responsive audit on the detail route (4/4); eslint; and `npm run verify` (761 tests, contrast 48/48, production build). Browser checks ran against this project's dev server on port 3100, as for `FE-1121`.

`FE-1123` evidence: the detail page lists the tasks a minute's run created in their own section, `src/features/meeting-minutes/generated-tasks.tsx`, separate from both the minute and the AI summary: title, assignee or **Unassigned** (never a blank), priority, due date, task status, how the assignee was chosen, a note when the task has been reassigned since, and an **Open task** link; below 768 px the table becomes cards. The seed gains the two tasks the processed `min-1001` created — `tsk-15` and `tsk-16` in `src/fixtures/index.ts`, ordinary Pending work under the ordinary rules — and their immutable links in `src/fixtures/meeting-minutes.ts`, one named in the minute and one matched on project membership and workload. **A task is listed only if the task page would open it for this viewer.** Rather than keep a second copy of task authorization, the task services now export their own rules as predicates — `employeeCanOpenTask` in `src/services/mock/work.ts` and `teamLeadCanOpenTask` in `src/services/mock/team-lead.ts` — and use them themselves, and Meeting Minutes calls the same two; every Open task link therefore lands, and a Super Administrator or HR Manager, whom the task pages do not show other people's tasks, sees these as restricted rows too. Restricted tasks keep their numbered place and are counted in one sentence, never named. `openGeneratedTask` answers not found unless the minute is readable, the link belongs to it and the task would open, and all three refusals are the same answer. `PRIORITY_LABEL` joins `TASK_STATUS_LABEL` in `src/lib/status.ts`. **One gap, recorded rather than worked around:** the core `Task` requires an assignee, so an unassigned generated task (`REQ-MTG-014`) cannot be seeded or created until that contract changes; the section renders Unassigned correctly and is tested with a view model that carries it, but `FE-1130`'s unassigned fixture needs a decision on the `Task` contract first.

`FE-1124` evidence: traceability runs both ways without implying AI decided anything about access. On the minute, the tasks section says each task was *proposed* by task generation and *assigned* by matching, and that who can see it and log time on it follows its project and assignment like any other task; match outcomes are worded as grounds for a proposal ("Named in the minute", "Matched on project membership and workload"), never as permission. On the task, `src/features/meeting-minutes/task-source-minute.tsx` is mounted on both task detail screens (`TaskDetail`, `TeamTaskDetail`): it links the source minute when the viewer can read it, says only "a meeting minute you do not have access to" when they cannot, and renders **nothing** for an ordinary task. `getTaskSourceMinute` answers not found for a task the viewer cannot open — its origin is not news about a task they cannot see — identically to an ordinary or nonexistent task, and keeps working after the minute is archived. Tanvir Ahmed, the matched assignee of `tsk-16`, cannot read `pia` minutes, so his task page is where the restricted view is seen (`AC-MTG-010`). A test and the browser probe both assert that no "approved by AI", "authorized by AI" or permission wording appears.

`FE-1125` evidence: `src/features/meeting-minutes/processing-failure.tsx` puts a failed run first on the page, before the minute, because it is the one thing that may need the reader to act: the safe message from `SAFE_PROCESSING_ERROR_MESSAGE` (never provider text), a separate plain sentence that the minute is saved and unchanged, and either a **Retry** button — only when the service's `canRetry` says so — or which of three reasons applies: the viewer may not retry, the failure is one a retry cannot fix, or the minute is archived. The button is busy for the whole request and ignores repeat clicks, and the request carries one idempotency key kept until it succeeds plus the failed run's id, which the contract now exposes as `processing.latestAttemptId`. `retryProcessing` in the mock refuses, in order: unreadable (not found), not allowed (denied), and as conflicts an archived minute, one not failed, a non-retryable failure, or a stale attempt id — so a second tab cannot start a second run (`REQ-MTG-023`); a repeated key returns the first outcome. Success moves the minute to Pending with the error cleared and the run counted; the page's announcer speaks it, so the toast is visual only. A conflict keeps the reader's place and offers **Reload the minute**.

`FE-1126` evidence: a stand-in for the durable worker drives runs started in the session — a save with AI or a retry — from Pending through Processing to Processed or Failed on timers, and notifies the minute's creator (`REQ-MTG-022`) through the existing notification store in the **Projects and tasks** group, naming the minute and none of its content; two notification types join `NotificationType`. The seeded Pending and Processing minutes are deliberately not moved, so every state stays demonstrable. A successful live run produces a summary from the minute's opening sentence, no decisions and no tasks — "finished, nothing to create" is a real outcome (`REQ-MTG-011`); the full case is the seeded `min-1001`. A run is advanced only while it is still the minute's current run and the minute is not archived, so a late timer is harmless, and demo reset stops every scheduled run. `src/features/meeting-minutes/use-processing-watch.ts` polls `getProcessingSnapshot` every 2 seconds for in-flight minutes only, reports a change **once** and stops — browser testing found the first version reporting the same failure twice while its reload was in flight — and resumes only if something is still in flight after the reload. The detail page reloads **in place**: its request keeps the previous answer during a refresh, which is safe only because the page now mounts it with `key={id}`, so one minute's data can never stand in for another's. The list reloads the same address, so filters, page and sort are untouched and rows stay mounted. A finished or failed run raises a notice: visual only on the detail page, where the `FE-1121` announcer already speaks — which needed a new `announce: false` option on the shared toast in `src/components/feedback/toast.tsx` — and announced on the list, where it is the only voice.

`FE-1123`–`FE-1126` verification: 36 new service tests (131/131 in the suite); 20 component tests for the three sections; 5 integration tests driving real runs through the detail page and the list, asserting each move is announced once, one notice per outcome, and — with a MutationObserver, since jsdom cannot scroll — that neither the page heading nor any list row is ever unmounted by a refresh; a 43/43 browser probe covering every field, Open task landing on the task, the source link and its restricted form on Tanvir's page, no origin on an ordinary task, a double-clicked retry producing exactly one run, a live run announced as started and finished, the creator's notification, a live failure with one notice, the list keeping its address and a scrolled position, cards at 375 px and no horizontal scroll; every earlier Meeting Minutes probe rerun (`FE-1113` 50/50 with one expectation updated because saved runs now progress, `FE-1114` 25/25, `FE-1115` 18/18, `FE-1116` 25/25, `FE-1120` 30/30, `FE-1121` 54/54, `FE-1122` 23/23); the accessibility audit 362/362 with `/tasks/tsk-15` added; the responsive audit on the detail, list, both task pages and dashboard — all pass except `/tasks` at 768 px for a Team Lead, the pre-existing overflow recorded under `FE-1113`; and, because the task dataset grew, the Phase 3 flows (all pass), Phase 4 flows (20/20), task-work audit (pass) and content-stress audit (83/83). **Pre-existing failures, not caused by this work:** `task-review-flows` fails five `FE-0780`/`FE-0781` checks and `journey-audit` fails "sees a live calculation preview before saving"; both fail identically on the committed tree without these changes, run against the same server. Typecheck, eslint, contrast 48/48 and the production build pass; the unit suite passes 810/810 at three workers, and at the default of eleven the two `work-log-drawer` tests time out under this machine's load — they fail the same way, alongside several more, on the committed tree, and this batch removed the others by making the Meeting Minutes form tests paste rather than type and by dropping nested service round trips from the minute's load. Browser checks ran against this project's dev server on port 3100.

`FE-1130` evidence: every case in the task has a seeded minute, catalogued at the top of `src/fixtures/meeting-minutes.ts`: no AI `min-1002`, pending `min-1003`, processing `min-1005`, processed with a mentioned assignee `min-1001`, failed and retryable `min-1004`, and three new ones — `min-1007` processed with a summary and decisions but **no valid tasks** (also the long-content case), `min-1008` with **two unassigned tasks** for both reasons matching may give, a matched task, and **one duplicate proposal** dropped, and `min-1009`, a processed **government-project** minute that only viewers with that permission can find. Four tasks join the core dataset in `src/fixtures/index.ts` (`tsk-17`–`tsk-20`) with their immutable links. **The unassigned case needed a contract decision, and the user chose to allow unassigned tasks across the task module:** `Task.assigneeEmployeeId` is now `string | null`, and the task view models' `assignee` is nullable. The rule is deliberately narrow — only task generation creates an unassigned task; a Team Lead's save must name an assignee, including when assigning one that arrived unassigned. An unassigned task accepts no time (`taskAcceptsTime` in `src/contracts/domain.ts` and the server's `validateTaskForTime` in `src/server/organization/rules.ts` both require an assignee), cannot be started (`TASK_UNASSIGNED` from the transition service, with guidance to assign it), is on no employee's own list, notifies nobody, and reads **Unassigned** on the Team Lead's board, on its own page, in search results and on the minute. When a Team Lead later assigns it, the minute says "Assigned since it was created" and keeps the original outcome. `tasks.assignee_employee_id` has been nullable since migration `0001`, so no migration is needed; the server-side follow-through is recorded against `BE-1305`. A skipped duplicate had nowhere to live in the contract, so `MeetingMinuteDetailView` gains `duplicateProposalCount`, reviewed into `AUTHORIZED_COUNT_FIELDS` because it is about a minute the viewer can read, and the tasks section says one proposal repeated another and was not added. The client contact the minute names is deliberately not named in the task outcome.

`FE-1131` evidence: every active role — Employee, both Team Leads, HR, Management/View-Only, Super Administrator — lists and reads exactly the minutes in its scope, each asserted by id. Employee and Management/View-Only are offered no action on any minute they can read, and **every write through a direct service call** — `createContext`, `listProjectOptions`, `create`, `editContext`, `update`, `archive`, `requestProcessing`, `retryProcessing` — returns `permission_denied` against a minute they can read, with nothing changed afterwards. On screen, a component test finds no Edit, Add, Archive, Retry, Start or Save control for either role on a failed, a not-processed and a processed minute, and none on the list. `requestProcessing` had no implementation, so this task added it — Not Processed to Pending, refused when archived, not Not Processed, or stale, idempotent by key — and a **Start task generation** control that appears only when the service allows it, so a minute saved without AI can still be processed later.

`FE-1132` evidence: the creator may change their own minute and another creator may not (a denial, since they can read it); the Super Administrator may change any minute they can read; processing actions appear only where the status allows. The Add form offers each creator only clients reachable through a project they may use, and a project from another client is refused with the same answer as one outside scope. For a viewer without the government permission, a government minute and a nonexistent id give identical answers on the detail read, the edit context, the status snapshot and the generated-task link, and government minutes are absent from search, counts and client options; a sweep across all six roles and four ids confirms no record lookup ever answers with a denial that could confirm an id exists.

`FE-1133` evidence: the responsive audit gains the long-content minute, the failure panel, the unassigned-task minute and an unassigned task's page. Its first run found a real defect: `min-1007`'s minute overflowed a phone by 16 px, because a pasted address with no spaces could not wrap; the minute, the AI summary and the decisions now use the codebase's `break-words`, and the route passes at all four widths. A dedicated probe covers what the audit cannot reach without a click, at 375, 768, 1024 and 1440 px: the list as cards or a table with its filters opened, the form with every error shown and with an over-long title, the Save button staying in the viewport, the long address wrapping inside its own paragraph, the failure panel, and generated tasks as three cards or a table with both unassigned rows labelled — with no horizontal scroll and every target at least 24 px.

`FE-1130`–`FE-1133` verification: 40 service tests in `src/services/mock/meeting-minutes-access.test.ts`; 10 component tests in `src/features/meeting-minutes/meeting-minutes-controls.test.tsx`; a new server rule test for the unassigned refusal (19/19 in the two backend unit suites run); the pinned list expectations in the existing suites updated to the three new minutes; a 70/70 browser probe; every earlier Meeting Minutes probe rerun unchanged (`FE-1113` 50/50, `FE-1114` 25/25, `FE-1115` 18/18, `FE-1116` 25/25, `FE-1120` 30/30, `FE-1121` 54/54, `FE-1122` 23/23, `FE-1123`–`FE-1126` 43/43); the accessibility audit 393/393 with three routes added; the responsive audit on every Meeting Minutes route, the four task pages, dashboard, team and workload — all pass except `/tasks` at 768 px for a Team Lead, the pre-existing overflow recorded under `FE-1113`; the Phase 3 flows, Phase 4 flows (20/20), task-work audit and content-stress audit (83/83) with the larger task set, while `task-review-flows` and `journey-audit` show only the same pre-existing failures recorded under `FE-1126`; and typecheck, eslint, contrast 48/48, the unit suite 860/860 at both three workers and the default, and the production build. Browser checks ran against this project's dev server on port 3100.
### Detail, Processing, and Generated Tasks

- [x] `FE-1120` Build the detail page with title, client, project, sanitized content, creator/date, AI choice, processing status, processed time, and authorized actions.
- [x] `FE-1121` Present Not Processed, Pending, Processing, Processed, and Failed with text, shape, and color; announce meaningful changes accessibly.
- [x] `FE-1122` Show the authorized meeting summary and extracted decisions separately from generated tasks so AI interpretation is distinct from the human minute.
- [x] `FE-1123` Show linked tasks with title, assigned employee or Unassigned, priority, due date, status, match outcome, and Open Task action.
- [x] `FE-1124` Make AI origin and source-minute traceability visible on both minute and task detail without implying AI made an authorization decision.
- [x] `FE-1125` Build Failed state with safe error, preserved-minute reassurance, retry eligibility, retry-in-progress feedback, and duplicate-click protection.
- [x] `FE-1126` Notify the user when background processing succeeds or fails and refresh detail/list state without losing filters or scroll context.

### All-Role, Responsive, and Quality Coverage

- [x] `FE-1130` Add fixtures for no-AI, pending, processing, processed, failed/retry, no-valid-tasks, unassigned-task, mentioned assignee, duplicate suggestion, and inaccessible sensitive-project cases.
- [x] `FE-1131` Verify every active role can access the module and authorized records, while Employee and Management/View-Only cannot create, edit, archive, request AI, or retry through controls or direct service calls.
- [x] `FE-1132` Verify creator versus non-creator actions, client/project scope, government-project denial, and safe not-found behavior for direct links.
- [x] `FE-1133` Add responsive checks at 375, 768, 1024, and 1440 px for list, filters, form, long content, status panel, and generated-task table/cards.
- [ ] `FE-1134` Add accessibility checks for labels, rich-text semantics, keyboard operation, focus, errors, status announcements, target size, contrast, reduced motion, and 200% zoom.
- [ ] `FE-1135` Add a role-journey gate covering create without AI, create with AI, status changes, linked tasks, unassigned fallback, failure/retry, archive, and read-only access.
- [ ] `FE-1136` Update Phase 0 traceability, information architecture, terminology, demo accounts, feature flags, and backend handoff documentation for this module and Client model.

### Phase 11 Exit Criteria

- [ ] Every active authenticated role can reach Meeting Minutes and view only authorized records.
- [ ] A permitted user can save a minute without AI or follow non-blocking AI processing to linked tasks.
- [ ] Failed processing never makes the original minute unavailable and an authorized retry is understandable and duplicate-safe.
- [ ] Client-to-project dependency, creator permissions, view-only restrictions, sensitive-project boundaries, and safe redaction are covered by tests.
- [ ] New screens pass responsive, accessibility, lint, type-check, test, and production-build gates.

## Phase 12 - Client Panel

A single authorized screen at `/clients` answering one question: **for a verified payroll period, how many active hours did each employee contribute to each client, and what did those hours cost us internally?** It is HR and Super Administrator only, it reads verified data by default, and it reports internal labour cost — never billing, revenue, invoices, or margin (`REQ-CLIENT-001`-`REQ-CLIENT-010`, `AC-CLIENT-001`-`AC-CLIENT-006`).

**Depends on** the shared shell and access states (Phases 1-2), the calculation engine and client attribution (Phase 3), payroll-period verification (Phase 5), the protected money and export behaviour (Phases 6-7), and the first-class `Client` model introduced for Meeting Minutes (Phase 11, `FE-1103`). It consumes existing results; it defines no new way to measure time.

### This Phase Reverses a Phase 10 Decision

Phase 10 deliberately kept `finance.cost.view` a **per-user** grant, so merging Finance into HR gave nobody cost access. `REQ-RBAC-017` has since been amended: HR Manager and Super Administrator now receive `finance.cost.view` **through their roles**, and this phase is where the frontend adopts it.

Three consequences that are easy to miss:

1. **The grant is not scoped to this screen.** Giving the HR role the permission opens every existing cost, rate, budget, salary and protected-export surface to every HR account, not only `/clients`. That is the approved intent, not a side effect to be worked around by hiding controls.
2. **`AC-AUTH-003` loses its demo pair.** The with-permission and without-permission HR accounts that Phase 10 created (`FE-1006`) stop differing once the role carries the grant. The scenario needs a different pair — an active role that does not carry it — or the acceptance scenario itself needs amending.
3. **It must land atomically with Backend Phase 14.** A frontend that assumes the role grant while the server still checks a per-user permission shows money surfaces that the API then refuses, and the reverse leaks. Neither half ships alone.

Until both phases cut over, the running code stays per-user, and Phase 10's evidence stays valid as the record of what shipped then.

### Access, Navigation, and Contracts

- [ ] `FE-1201` Add `/clients` to the route map, information architecture, breadcrumbs, mobile back behaviour, and deep links, with **Client Panel** as the navigation label (`REQ-NAV-009`).
- [ ] `FE-1202` Add the HR and Super Administrator route rule, and confirm Team Lead, Employee and Management/View-Only receive the same safe denial through navigation, direct URL and any service call (`REQ-CLIENT-001`, `AC-CLIENT-001`).
- [ ] `FE-1203` Define the typed contracts: `ClientPanelQuery` (period, client, employee, sort, pagination), summary view, employee-by-client row, applied filters, and export request, every operation returning `Result<T>`.
- [ ] `FE-1204` Adopt the amended `REQ-RBAC-017`: HR Manager and Super Administrator hold `finance.cost.view` through their roles, every other active role continues to need an explicit grant, and the change is recorded as superseding `FE-1005`.
- [ ] `FE-1205` Keep cost rates, salary components and rate history out of the panel's view models entirely; the row carries a computed `RedactableMoneyView` and nothing a viewer could reconstruct a rate from.
- [ ] `FE-1206` Prove that unauthorized rows, counts, totals, filter options and empty groups are unreachable, with authorization applied before aggregation (`REQ-CLIENT-008`, `AC-CLIENT-006`).

### Data, Calculation, and Fixtures

- [ ] `FE-1207` Add deterministic fixtures: clients, employees spanning more than one client, a verified and an unverified payroll period, effective-dated cost rates, government-project work, and work on a project with no mapped client.
- [ ] `FE-1208` Read active minutes from the calculation engine's existing results and attribute them through `Project` to `Client`; never recompute hours and never derive minutes from task transitions (`REQ-CLIENT-004`).
- [ ] `FE-1209` Exclude the recognized daily break from every hour and cost figure, and state in the UI that the panel reports active work only.
- [ ] `FE-1210` Compute internal labour cost through `src/lib/money.ts` using the rate effective for each contributing period, in BDT, rounding once per reported aggregate rather than per row (`REQ-CLIENT-005`).
- [ ] `FE-1211` Report work whose project has no mapped client under **Not assigned to a client**, inside authorized totals, never merged into a named client (`REQ-CLIENT-006`, `AC-CLIENT-003`).

### Screen

- [ ] `FE-1212` Default to the latest HR-verified payroll period and offer only verified periods in the period filter (`REQ-CLIENT-002`).
- [ ] `FE-1213` Build the summary cards — employees, active hours, internal labour cost — in plain language, using the shared formatting helpers for every duration and money value.
- [ ] `FE-1214` Build the flat table with Client, Employee, Active Hours and Labour Cost, one row per authorized client-employee pair (`REQ-CLIENT-003`).
- [ ] `FE-1215` Add period, client and employee filters with removable applied-filter chips, clear-all, and URL-persisted state through `QUERY_PARAM_KEYS` (`REQ-CLIENT-007`).
- [ ] `FE-1216` Add authorized sorting, pagination and totals that describe the filtered, authorized result rather than the whole dataset.
- [ ] `FE-1217` Cover loading, populated, empty, no-results, denied, signed-out and recoverable-error states, plus the distinct **no verified period** state that never silently falls back to unverified data.
- [ ] `FE-1218` Make the table become cards below 768 px with no page-level horizontal scrolling at 375, 768, 1024 or 1440 px (`REQ-CLIENT-007`, `REQ-NFR-UX-001`).
- [ ] `FE-1219` Add Excel, CSV, PDF and print outputs through the existing export experience, carrying period, filters, timezone, generation timestamp, currency and policy version (`REQ-CLIENT-009`, `REQ-CLIENT-010`).
- [ ] `FE-1220` Update HR and Super Administrator financial navigation to reflect the role-based grant, so no cost entry is hidden from a role that now holds the permission.

### Quality and Handoff

- [ ] `FE-1221` Add authorization tests: role access, record scope, government-project restriction, export refusal, and identical denial for direct URL and service call.
- [ ] `FE-1222` Add reconciliation tests proving the panel's hours and cost match the authoritative hour and labour-cost reports for identical filters (`AC-CLIENT-002`, `AC-CLIENT-005`).
- [ ] `FE-1223` Add responsive and accessibility checks for the summary, table, filters, states and export controls at the four widths, including 200% zoom and reduced motion.
- [ ] `FE-1224` Add a role-journey gate covering an HR review, a Super Administrator review, the unmapped-client row, an export, and a refused role.
- [ ] `FE-1225` Update Phase 0 traceability, information architecture, terminology, demo accounts and feature-flag documentation, and record evidence in `docs/frontend/phase-12/verification.md`.

### Phase 12 Exit Criteria

- [ ] HR Managers and Super Administrators reach Client Panel; every other active role is refused identically through navigation, direct URL, service call and export.
- [ ] The default period is the latest verified one, and the absence of a verified period is stated rather than worked around.
- [ ] Hours and internal labour cost reconcile with the authoritative reports for identical filters, and unmapped work is visible rather than dropped.
- [ ] Excel, CSV, PDF and print outputs carry the same authorized rows, totals and provenance metadata as the screen.
- [ ] The role-based `finance.cost.view` grant is adopted together with Backend Phase 14, with no window in which the two halves disagree.
- [ ] New screens pass responsive, accessibility, lint, type-check, test and production-build gates.

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
- [x] `DEMO-21` A Team Lead creates a personal task without approval, moves it to In Progress, and records duration work in My Timesheet.
- [x] `DEMO-14` A conveyance claim submitted without a receipt is accepted, because the upload is optional.
- [x] `DEMO-12` A Team Lead submits a new-item requisition and it reaches HR, Finance, and the Super Administrator without a Team Lead review step.

- [ ] `DEMO-17` An authorized user creates a meeting minute without AI and sees it retained as Not Processed.
- [ ] `DEMO-18` An authorized user creates a meeting minute with AI, sees Pending/Processing, and opens linked generated tasks after completion.
- [ ] `DEMO-19` A failed AI run preserves the original minute and offers an authorized retry without duplicate tasks.
- [ ] `DEMO-20` Every active role can access authorized meeting minutes, while Employee and Management/View-Only remain read-only and protected records remain undiscoverable.
- [ ] `DEMO-22` An HR Manager opens Client Panel on the latest verified period, sees employee hours and internal labour cost by client including a **Not assigned to a client** row, and exports the same authorized result.
- [ ] `DEMO-23` A Team Lead, an Employee and a Management/View-Only user each find no Client Panel entry and receive the same safe denial on the direct `/clients` URL.

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
| Phase 11 - Meeting Minutes and AI Task Generation | In progress | 23/26 |
| Phase 12 - Client Panel | Pending | 0/25 |

Update this table whenever tasks change status. Exit-criteria checkboxes are gates and are not included in the task totals above.
