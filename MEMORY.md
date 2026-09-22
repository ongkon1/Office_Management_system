# Project Memory

Durable context for anyone — human or AI — picking up this codebase. It records what the plan files don't: why things are the way they are, what's decided versus assumed, and the rules that are easy to break by accident.

Last updated: **21 September 2026** (Modify Phase B3 is complete: versioned task transitions, authorized history and derived actuals, shared transactional notifications and audits. B1 HR sign-off and B4 browser/production cutover remain pending).

---

## 1. What This Is

A centralized, responsive web application for tracking employee time and work across multiple divisions, for **PowerInAI**.

| Field | Value |
|---|---|
| Initial divisions | PowerInAI, PowerInAI Training, Government Projects, Computer Jagat, WesternCF |
| Roles | Super Administrator, Team Lead, Employee, HR Manager, Management/View-Only. Finance Manager is retired for new assignments; its stored value remains valid for history. |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 with semantic tokens |
| Database | MySQL (backend milestone only — not yet connected) |
| Business timezone | Asia/Dhaka |
| Currency | BDT |

The product connects working hours to divisions, projects, and tasks, and gives each role a consistent view of attendance, workload, performance, and labour cost.

---

## 2. Delivery Model

**One repository, frontend first.** The frontend milestone ships against typed mock adapters; the backend milestone later replaces those adapters *inside the same repo* without redesigning approved screens. The project is never split into separate frontend and backend applications.

Five files at the repo root are the plan of record:

| File | Contains |
|---|---|
| `project_requirement.md` | `REQ-*` business requirements, `AC-*` acceptance scenarios. The requirements source of truth. |
| `frontend_milestone.md` | `FE-*` tasks, Phases 0–9. |
| `backend_milestone.md` | `BE-*` tasks, Phases 0–9. Backend Phase 0 is blocked until frontend contracts are stable. |
| `modify_milestone.md` | Approved clock-to-task work-logging replacement: `MOD-*`, frontend `MFE-*`, and backend `MBE-*` tasks. Frontend Phases F1 and F2 are complete. |
| `organization_hierarchy_milestone.md` | Division → Department → effective Team Lead → employee assignment delivery: `OH-*`, `OH-FE-*`, `OH-BE-*`, and `OH-V-*`. |

Work proceeds **one phase at a time** — a phase is started by name, and every task in it is completed before moving on. Task status uses exactly one marker: `[ ]` pending, `[~]` in progress, `[x]` done. When status changes, update both the task line and the "Current Progress Summary" table at the bottom of the file.

---

## 3. Domain Rules That Are Easy to Get Wrong

Each of these has a natural-looking wrong implementation that would pass a casual review and corrupt payroll or leak protected data. Full detail is in `project_requirement.md` §3, §5.3 and §12; this is the short list.

- **A normal full day is 7 active hours + 1 separate break hour = 8 total.** Both thresholds must be met for "Complete". The break is **one recognized value per day** — it is never added per work log.
- **The standard working week is Sunday through Thursday.** Friday and Saturday are the default weekly holidays; calendar overrides remain effective-dated.
- **Classification:** Missing / Under-time / Complete / Overtime (above 8:00 through **exactly 12:00**, reason required) / Critical (above 12:00, explanation required plus Team Lead and HR notification). Exactly 12:00 is Overtime, not Critical.
- **There is no daily Team Lead approval, anywhere in the product.** Team Leads do exception-based review and correction requests; HR verifies and locks payroll periods. Approval language belongs only on WFH requests, leave requests, employee-raised task review, and HR period verification — never on a daily work log.
- **One general remark type.** Not multiple remark categories.
- **Departments are owned by divisions, and placement is per division assignment.** Every active EmployeeDivisionAssignment selects one same-division department. Each department has at most one effective lead at a time; any eligible active employee may be appointed, one employee may lead multiple departments, and the appointment grants only department-scoped Team Lead capabilities. Only Super Administrators manage departments and appointments.
- **New active time comes only from explicit duration work logs against eligible In Progress tasks.** Status transitions create no minutes. Pending and Completed tasks reject logs; reopening requires a reason.
- **All, Overdue, and Upcoming are task views, not stored statuses.** Stored workflow states remain Pending, In Progress, and Completed.
- **New work logs have no clock range, so overlap detection is not claimed.** Reject active time above 24:00 on one local date; keep overtime/critical and estimate-variance exception review.
- **Historical clock entries remain read-only and reproducible.** The audited B4 production deployment instant is the cutover boundary, determined by record creation time rather than reported work date.
- **Deny by default** for government-project, salary, cost, evaluation, export, attachment, and audit data. UI hiding is never the control. A restricted field is omitted or explicitly marked `Restricted` — never blanked, never zeroed.
- **Durations are integer minutes. Money is a fixed-precision decimal string plus a currency code.** Never floating-point hours, never a bare number for money. `6:59` must never render as `7:00`.
- **Status is never communicated by colour alone** — always shape + text + colour.
- Store work-log local date, timezone, integer duration and audit instants; keep task-transition timestamps separate from calculation inputs; retain original UTC ranges and policy versions for historical clock entries.

---

## 4. Repository Map

```
project_requirement.md          Requirements (REQ-*, AC-*)
frontend_milestone.md           Frontend plan (FE-*)
backend_milestone.md            Backend plan (BE-*)
modify_milestone.md             Task-based replacement plan (MOD-*, MFE-*, MBE-*)
organization_hierarchy_milestone.md Division/department/lead plan (OH-*)
MEMORY.md                       This file

docs/
  architecture.md               System architecture, drivers, open decisions
docs/frontend/phase-0/
  traceability-and-priority.md  Screen -> route, roles, REQ ids, MVP/P2/P3/P4
  demo-setup.md                 Demo accounts, org, projects, time scenarios
  information-architecture.md   Role navigation, screen flows, nav rules
  terminology-and-formats.md    Approved wording and display formats
docs/frontend/phase-1/
  contrast-audit.md             WCAG results and the corrections made

src/
  app/                          Routes, globals.css (design tokens), showcase
  contracts/                    Domain types, view models, service interfaces,
                                result shapes, query shapes, feature flags
  components/
    ui/ forms/ feedback/        Primitives, controls, cards, alerts, overlays
    data/ charts/ layout/       Table, filters, charts, page scaffolding
    shell/                      Sidebar, top bar, mobile nav, navigation model
  lib/                          cn, formatters, status presentation
  lib/calculation/              THE daily calculation engine and entry validation
  features/access/              Session provider and store, route-access rules,
                                auth forms, account-state screens, demo tools
  features/timesheet/           Views, entry drawer, timer
  features/tasks/               Task list/detail, divisions, remarks, profile
  features/dashboard/           Employee dashboard
  features/admin/departments.tsx Super Admin department catalogue and lead assignment
  services/mock/department-store.ts Division-owned department demo state
  services/mock/                Accounts, auth, store, timesheet, organization
  fixtures/                     The deterministic demo dataset
  test/                         Vitest setup

scripts/
  contrast-audit.mjs            WCAG gate (reads tokens from globals.css)
  responsive-audit.mjs          Playwright gate at 375/768/1024/1440 px
  phase2-flows.mjs              Auth and access-control flow gate
```

---

## 5. Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on :3000. The component showcase is at `/showcase`. |
| `npm run verify` | typecheck → lint → contrast audit → tests → production build |
| `npm run typecheck` | Runs `next typegen` first — Next 16 generates the `LayoutProps` global |
| `npm run audit:contrast` | WCAG 2.2 AA across every token pairing |
| `npm run audit:responsive` | Needs a dev server already running |
| `npm run audit:flows` | Phase 2 auth and access flows. Needs a dev server already running |
| `npm run audit:flows3` | Phase 3 employee and calculation flows. Needs a dev server already running |
| `npm run audit:flows4` | Phase 4 Team Lead flows. Needs a dev server already running |
| `npm run audit:flows5` | Phase 5 HR flows. Needs a dev server already running |
| `npm run audit:flows6` | Phase 6 Finance and Management flows. Needs a dev server already running |
| `npm run audit:flows7` | Phase 7 reporting and supporting-module flows. Needs a dev server already running |
| `npm run audit:a11y` | Keyboard, focus, structure, semantics, zoom, reduced motion. Needs a dev server |
| `npm run audit:stress` | Extreme content, interaction feedback, type-scale consistency. Needs a dev server |
| `npm run audit:journeys` | End-to-end role journeys. Needs a dev server |
| `npm run audit:perf` | DOM size and layout stability. Needs a dev server |
| `npm run test` | Vitest |
| `npm run verify:backend` | Typecheck → lint → migration validation → backend suites → dependency audit → production build |
| `npm run test:e2e` | Playwright browser workflow tests; starts the development server |
| `npm run db:validate` | Validates ordered migrations, recovery scripts, destructive SQL, and prohibited floating types |

Environment: Windows + WAMP, PowerShell. **Not currently a git repository.**

---

## 6. Conventions

**The service boundary is absolute.** UI components never import fixtures. Pages and feature modules consume data only through the typed interfaces in `src/contracts/services.ts`, so the MySQL implementation can replace the mock adapters without touching screens. Every operation returns `Result<T>` — failures are values, not thrown exceptions.

**Authorization lives in the service, never in the component.** A service returns `permission_denied` or omits restricted fields; the UI never decides what a viewer may see. A record the viewer cannot access returns the *same* not-found presentation as a nonexistent one, so identifiers cannot be probed.

**Styling.** Tailwind v4 with semantic tokens in `@theme` (`src/app/globals.css`). The palette is the PowerInAI identity (violet `#6c63ff`, pink `#ff3c7e`, ink `#18192b`) on a light canvas; the five day-status colours are deliberately *not* brand-tinted. The September 2026 SaaS enhancement standardizes rounded elevated surfaces, responsive page rhythm, brand-rule metric cards, active navigation pills, polished controls, and more scannable tables through shared components. Utilities stay inside typed component wrappers — screens compose `<Button variant="primary">`, not raw utility strings. No component library was added; overlays, tabs, tables and charts are hand-built against the tokens. Icons come from `lucide-react` only; never emoji.

> Tailwind scans source text, so an interpolated class (`` `text-${tone}` ``) is never generated and the style silently vanishes. Use an explicit static map — there's one in `src/components/ui/status-indicator.tsx`.

**Mock state the calculation reads lives in the store.** Assignments, holidays and payroll periods are held in `src/services/mock/store.ts` rather than as fixture constants, because HR mutates them and the daily calculation reads them. Adding an assignment must immediately widen which divisions accept time; verifying a period must immediately lock its dates. `mockStore.isDateLocked` is the single lock check.

**Department placement is service-owned and belongs to EmployeeDivisionAssignment.** The approved model requires `Department` and effective-dated `DepartmentLeadAssignment` records. Department names/codes are unique within a division, the same name may exist elsewhere, and the service validates every assignment's division/department relationship. A lead appointment produces a bounded authorization scope rather than a global role. The current `employees.department` string, direct employee/assignment Team Lead fields, and preliminary primary-department mock are transitional and must be removed through `organization_hierarchy_milestone.md`.

**Money arithmetic is exact and centralised.** `src/lib/money.ts` is the only place a money value is computed — `bigint` minor units, rounded half-up once at the end, never per row, never `number`. Cost reaches the UI as `RedactableMoneyView`, whose restricted variant carries no value at all, so redaction is enforced by the type rather than by a component remembering to hide something.

**Feature flags are runtime state.** `src/features/settings/flag-store.ts` is what the layout guard and shell read, not `DEMO_FEATURE_FLAGS`. Documents, messages, global search and integrations ship **off** — a screen that looks missing is usually a flag, and `/settings` toggles it.

**Client time is regrouped, never recalculated.** `src/lib/client-time.ts` re-buckets the minutes the calculation engine already assigned to each project, so a client total cannot disagree with the day it came from. Time on a project with no client, and time on no project at all, land in one reported `null` bucket rather than being dropped, so the parts still sum to the day — that bucket is what the Client Panel reports as **Not assigned to a client**.

> A client is now a **first-class record** (`Client`, `project_requirement.md` §7.1), introduced for Meeting Minutes (`FE-1103`, `BE-1301`). The free-text `Project.client` label stays readable until every label is mapped, so historical reports reconcile; new work attributes time through the project-to-Client relationship. Client Panel (Frontend Phase 12, Backend Phase 14) reads the same regrouped minutes — it must never recompute hours of its own.

**Formatting is centralised.** `src/lib/format.ts` is the single implementation of every date, time, duration, money, and percentage rule. No component builds one of those strings by hand — a duration rendered two ways is a defect, and a rounded one is a calculation defect.

**Quality gates are hard.** When an audit fails, fix the token or the component — never lower a threshold, add an exception, or narrow the checked set to make a run pass. The contrast script deliberately parses the real stylesheet rather than holding its own palette copy, so a colour changed without re-checking its pairings fails the build.

---

## 7. Current State

| Milestone | Phase | Status |
|---|---|---|
| Frontend | 0 — Product and UX foundation | Done (19/19) |
| Frontend | 1 — Next.js foundation and design system | Done (26/26) |
| Frontend | 2 — Authentication and role-based shell | Done (10/10) |
| Frontend | 3 — Employee core experience | Done (28/28) |
| Frontend | 4 — Team Lead experience | Done (21/21) |
| Frontend | 5 — HR experience | Done (17/17) |
| Frontend | 6 — Finance and Management experience | Done (11/11) |
| Frontend | 7 — Shared reporting and supporting modules | Done (52/52 · requisition, conveyance and employee-raised tasks included) |
| Frontend | 8 — Responsive, accessibility and quality hardening | Done (17/18 · `FE-0825` awaiting visual review) |
| Frontend | 9 — Demo packaging and backend handoff | In progress (13/14; stakeholder sign-off pending) |
| Frontend | 10 — Role consolidation: Finance into HR | Done (14/14); its per-user cost decision is superseded by Phase 12 |
| Frontend | 11 — Meeting Minutes and AI task generation | In progress (23/26) |
| Frontend | 12 — Client Panel | Pending (0/25) — new milestone; cuts over with Backend Phase 14 |
| Backend | 0 — Architecture and delivery foundation | Done (25/25) |
| Backend | 1 — MySQL schema and data foundation | Done (26/26) |
| Backend | 2 — Authentication, authorization, and audit | Done (23/23) |
| Backend | 3 — Organization, projects, and tasks | Done (27/27) |
| Backend | 4 — Timesheet calculation and correction | Done (33/33) |
| Backend | 5 — HR workflows | Implementation done (26/26); browser cutover gate pending Phase 9 |
| Backend | 6 — Reporting, Finance and exports | Implementation done (19/19); browser cutover gate pending Phase 9 |
| Backend | 7–9 | Pending |
| Backend | 10 — Requisition | Pending (0/20) — new milestone |
| Backend | 11 — Conveyance | Pending (0/22) — new milestone, depends on 10 |
| Backend | 12 — Role consolidation: Finance into HR | Pending (0/11); `BE-1203` keeps cost access per-user, superseded by Phase 14 |
| Backend | 13 — Meeting Minutes and AI task generation | Pending (0/34) |
| Backend | 14 — Client Panel reporting | Pending (0/23) — new milestone; cuts over with Frontend Phase 12 |
| Modify | B1 — Backend schema and data migration | In progress (9/10); technical delivery complete, HR sign-off pending |
| Modify | B2 — Backend work-log use cases, validation and calculation | Done (11/11); browser/production cutover remains B4 |
| Modify | B3 — Backend task transitions, history and notifications | Done (9/9); browser/production cutover remains B4 |
| Organization hierarchy | 0 — Product rules and architecture | Done (10/10); implementation F1 is next |

Gate results: contrast 48/48, accessibility 279/279, content-stress 73/73, role journeys 41/41, performance 16/16, Phase 2–7 flows 16/18/20/51/40/55, requisition 45/45, conveyance 45/45. Modify Phase F3 passes route type generation, TypeScript, ESLint with zero warnings, contrast 48/48, all 579 frontend/shared tests across 35 files, every Phase 3 browser flow, all 316 responsive route/width combinations, and a 62-route production build. Detailed evidence is in `docs/frontend/modify/phase-f3-verification.md`; the dedicated task-work browser gate remains an F4 deliverable.

Modify Phase B1 passes migration validation for 11 forward/recovery pairs, route type generation, TypeScript, ESLint, and 7/7 focused real-MySQL migration/foundation tests. It fingerprints all legacy time-entry facts, reconciles every counted employee-day and verified/amended period, and verifies guarded recovery and runtime grants. Evidence and the pending HR approval record are in `docs/backend/modify/phase-b1-verification.md`. The retired Phase 4 clock/timer scenarios have now been replaced by B2 work-log and retirement coverage. The three HR regression fixtures now exercise scheduled Sunday–Thursday days while preserving their original assertions.

Those gate results predate the preliminary hierarchy prototype. Its nullable legacy-department lookup now type-checks, but the prototype is still not completion evidence for the approved per-assignment hierarchy. Treat `OH-FE-0101`–`OH-FE-0112` and all applicable rerun gates as mandatory before claiming that milestone complete.

Sign in at `/login`; every demo account uses `Demo1234!` and the sign-in page carries a picker. Auth fixtures — 2FA code, reset tokens, lockout threshold — are in `docs/frontend/phase-0/demo-setup.md` §1.1.

---

## 8. Open Items — Assumptions, Not Decisions

These read as settled in the deliverable files, but no stakeholder has confirmed them:

- **Demo accounts and sample dataset** (`docs/frontend/phase-0/demo-setup.md`) — 11 employees, 5 divisions, 6 projects, 3 payroll periods, 16 time scenarios, demo date pinned to 2026-09-02. Invented to be internally consistent and to exercise every rule; **not supplied by the business.**
- **The MVP vs Phase 2 boundary** for attendance, HR reports, and the Finance cost tiles (`docs/frontend/phase-0/traceability-and-priority.md`). `project_requirement.md` §2.3 doesn't name these explicitly; they were read as Phase 2 by association.
- **Stakeholder approval of the component showcase** — the one Phase 1 exit criterion left at `[~]`, since approval isn't self-certifiable.

Per `project_requirement.md` §11, the product owner still owes the authoritative employee list, every employee-division-to-department mapping, department list for every division, effective department Team Lead mapping, holiday calendars, schedules, leave balances, and initial projects. HR must approve work policies, payroll periods, and leave rules. Finance must approve cost-rate handling and payroll export fields.

**Open items from Meeting Minutes (`FE-1123`–`FE-1133`):**

- **Unassigned generated tasks — resolved 22 Sep 2026** (see the decision log). The frontend `Task` now allows no assignee. The MySQL column `tasks.assignee_employee_id` was nullable from migration `0001`, so no migration is needed, but the server's task mapping must accept null before `BE-1305` can store an unassigned generated task.
- **The frontend unit suite is load-sensitive on this machine.** At Vitest's default parallelism (11 workers on 12 cores) two `work-log-drawer` tests time out while the machine is busy; they pass alone and pass at `--maxWorkers=3` (810/810). They fail the same way on the committed tree, so it predates `FE-1123`. Separately, `task-review-flows` (five `FE-0780`/`FE-0781` checks) and `journey-audit` ("sees a live calculation preview before saving") fail on the committed tree too. Setting `maxWorkers` in `vitest.config.ts` would steady the suite at roughly double the run time; that is a project decision and has not been made.

Later phases harden screens and fixtures around these assumptions, so the cost of changing them grows with every phase built on top.

---

## 9. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 16 Sep 2026 | Department placement belongs to every EmployeeDivisionAssignment; effective lead appointment grants scoped capability | Preserves correct organization structure for employees working across several divisions. Any eligible active employee may lead multiple departments without receiving unrelated company-wide access, and effective dates preserve historical responsibility. Delivery is tracked in `organization_hierarchy_milestone.md`. |
| 16 Sep 2026 | One administrator-managed organization logo feeds a shared `BrandLogo` component | Removes hardcoded marks from authentication, desktop and mobile chrome. The current mock frontend persists a validated PNG/JPEG/WebP asset (maximum 1 MB) in browser storage and updates every mounted logo immediately; production-wide persistence and private object storage remain part of backend/browser cutover. |
| Phase 0 | Durations as integer minutes, money as decimal string + currency code | Floating-point hours and JS numbers produce payroll errors |
| Phase 0 | Restricted fields typed `Redactable<T>` | Makes "you may not see this" representable, so it can't be mistaken for zero or absent |
| Modify Phase 0 | Replaced new clock/timer capture with duration-based task work logs | The user reports how much work was done against an eligible task; exact attendance intervals are outside this milestone |
| Modify Phase 0 | Task transitions and work logs are separate records | Dragging or changing status must never create or infer active minutes |
| Modify Phase 0 | Pending rejects logs; Completed rejects logs until reopened | Keeps workflow state and recorded work consistent; reopen requires a reason and preserves completion history |
| Modify Phase 0 | All/Overdue/Upcoming are derived views | Prevents filter concepts from becoming incompatible stored workflow statuses |
| Modify Phase 0 | Reuse `time_entries` for duration work logs and preserve historical clock rows | Avoids permanent two-source reconciliation while keeping verified history reproducible |
| Modify Phase 0 | Reject daily active time above 24:00 | Duration-only logs cannot detect overlap; 24 hours is the physically certain hard ceiling while >12:00 remains Critical |
| Modify Phase 0 | Cutover is the audited B4 production deployment UTC instant | Record creation time determines the capture model; backdated work dates do not rewrite historical/new classification |
| Modify Phase F2 | Employees and Team Leads share one task workflow board and transition panel | One presentation and one transition policy keep drag, buttons, keyboard actions, scoped counts, notes, and locked/stale states from drifting; transitions still create no minutes |
| Modify Phase F3 | Frontend time capture is duration-only and locked-period conflicts expose the amendment path | Shell and dashboard timer state was removed, task deep links cannot bypass period locks, and create/edit/delete identify the verified period without weakening the audited HR amendment workflow |
| Phase 1 | Tailwind v4 + tokens over CSS Modules or shadcn/ui | Fastest to the premium spec; reshaping a vendored library's conventions costs more than building to tokens |
| Phase 1 | Hand-built charts (inline SVG) instead of a charting library | Full control of the colour-safe series and the always-present data-table equivalent |
| Phase 1 | Added two custom audit gates | Both found real defects on first run — a 1.70:1 control border, two chart series 1.02 apart in luminance, 8 undersized touch targets, and a component stealing focus on mount |
| Phase 1 | Native `<select>` rather than a custom listbox | Free platform keyboard behavior, mobile pickers, and screen-reader support |
| Phase 2 | Session in an external store read via `useSyncExternalStore`, not React state | Hydration flag and user must move atomically; tracking them separately let the guard see "signed out" for one frame and bounce a signed-in user to login |
| Phase 2 | Denied routes render in place instead of redirecting | Keeps the URL visible, which is the point of direct-route access testing |
| Phase 2 | Registered placeholder screens for unbuilt destinations | An authorized user following a nav link should not hit a 404 that reads as a defect; unregistered paths still 404 |
| Phase 3 | One pure calculation engine, materialised nowhere else | The only way `AC-RPT-001`/`-002` reconciliation is achievable; it is a pure function so results are reproducible and exhaustively testable at boundaries |
| Phase 3 | Registered the type scale with `tailwind-merge` | `twMerge` read `text-body-sm` as a colour and stripped `text-ink-inverse`, shipping a 1.07:1 primary button — a class present in source, removed at runtime |
| Phase 3 | Rendered-contrast check added to the responsive audit | The token audit proves the palette is sound but cannot see what a component actually renders; only opaque backgrounds are judged, and skipped elements are counted rather than hidden |
| Phase 4 | `docs/frontend/phase-<n>/verification.md` per phase | Records what was built, which defects the gates caught, and the numbers — so a later phase can trust or re-check them rather than re-deriving |
| Phase 5 | Assignments, holidays and periods moved from fixture constants into `mockStore` | HR mutates them and the calculation reads them; a copy on either side would let a new assignment or a verified period silently fail to take effect |
| Phase 5 | `selfEvaluationState` distinguishes `restricted` from `not_submitted` | A single nullable field would let an unauthorized read render identically to an absent one, which is exactly the leak `REQ-NFR-SEC-004` forbids |
| Phase 5 | `LinkButton` added beside `Button` | Navigation must be an anchor — openable in a new tab and announced as a link — while looking identical; both share one base-class constant so the 44 px hit area cannot drift |
| Phase 5 | Routes branch by role where one audience is built and another is planned | `/wfh`, `/leave` and `/evaluations` are HR administration now and employee self-service in Phase 7; showing an employee a permission denial would be the wrong explanation |
| Phase 6 | Money as `bigint` minor units in `src/lib/money.ts` | Rate x minutes / 60 in floating point drifts by fractions of a paisa and produces payroll disputes; one rounding at the end also stops a total being the sum of separately-rounded parts |
| Phase 6 | `RedactableMoneyView`'s restricted variant carries no value | A nullable money field renders identically to "this cost nothing", and a component could still leak a value it was asked to hide |
| Phase 6 | `/finance/payroll` and `/finance/reports` relaxed to role-only | `FE-0611` needs restricted-field behaviour *inside* a report; denying the screen makes it unreachable and withholds hours the role is entitled to. Screens wholly about money stay permission-gated |
| Phase 6 | July 2026 enriched to 46 locked days | Finance defaults to the verified period; two days would have made every cost and billable figure trivially small and hidden the division mix the screens exist to show |
| Phase 6 | `position: relative` on `.table-scroll` | `sr-only` text is absolutely positioned and escaped a static scroll container, stretching the document's scroll width even though the visible content clipped correctly |
| Phase 7 | Feature flags moved to a runtime store | Four Phase 7 modules ship off; without a way to switch them on they would be unreachable, and a settings screen whose switches changed nothing would be worse than none. It is also how `FE-0006` is demonstrated rather than asserted |
| Phase 7 | A report the viewer cannot run is absent, and `getReport` returns not-found | A disabled catalogue entry turns the catalogue into a directory of what other roles can see, which is the same disclosure as the data |
| Post-8 | Finance merged into HR; the role is retired, not deleted | `RoleKey` is what can be assigned and `RetiredRoleKey` what can be stored, so the compiler separates the two. `PARALLEL_REVIEWER_ROLES` shrank to two, which is the only change the approval chain needed |
| Post-8 | ~~HR must not inherit `finance.cost.view`; the role merges, the permission does not~~ — **superseded 20 Sep 2026** | Recorded as the Phase 10 decision and still the behaviour of the running code. The amended `REQ-RBAC-017` now grants the permission through the HR Manager and Super Administrator roles, so this constraint applies only until Frontend Phase 12 and Backend Phase 14 cut over together. The second half of the original decision stands unchanged: `finance_manager` remains a legal *stored* value, or every historical review row and audit event becomes unreadable |
| 22 Sep 2026 | A task may be **unassigned** (`Task.assigneeEmployeeId: string | null`) | Chosen by the user for `FE-1130`, because `REQ-MTG-014` requires task generation to leave a task unassigned rather than give it to someone unsuitable. The rule is narrow: only task generation creates an unassigned task; a Team Lead saving a task must name an assignee, including when assigning one that arrived unassigned. An unassigned task accepts no time — `taskAcceptsTime` and the server's `validateTaskForTime` both now require an assignee — cannot be started (`TASK_UNASSIGNED`), is on no employee's own list, notifies nobody, and reads "Unassigned" wherever a task is shown. The original match outcome is kept when someone is later assigned, so the minute can still say the task arrived unassigned |
| 21 Sep 2026 | Generated-task visibility follows the task pages, not the minute | A viewer sees a generated task only if `/tasks/[id]` would open it for them — Team Leads by division, everyone else their own — so every Open task link lands. The task services export those rules as predicates (`employeeCanOpenTask`, `teamLeadCanOpenTask`) and Meeting Minutes calls the same two, so there is one copy of task authorization. Consequence: a Super Administrator or HR Manager sees other people's generated tasks as restricted rows, because the task pages do not open them either; widening that belongs to the task module |
| 20 Sep 2026 | Client Panel at `/clients`, for HR Managers and Super Administrators only | Approved by the user. One flat table — Client, Employee, Active Hours, Internal Labour Cost — defaulting to the latest HR-verified payroll period, with Excel, CSV, PDF and print output. Cost means active minutes × effective internal rate, never billing, revenue, invoices or margin; breaks and task transitions contribute nothing. Work on a project with no mapped Client stays in the totals as **Not assigned to a client** rather than being dropped. Hours come from the authoritative calculation results, never a second SQL sum. Tracked as Frontend Phase 12 and Backend Phase 14; documentation only so far, no code |
| 20 Sep 2026 | `REQ-RBAC-017` amended: HR Manager and Super Administrator hold `finance.cost.view` by role | Approved by the user, and deliberately wider than Client Panel — it opens every existing cost, rate, budget, salary and protected-export surface to those roles. Other roles still need an explicit grant. It reverses the Phase 10 decision above, needs a reversible audited migration (`BE-1402`), and must land atomically on both sides or the client and server disagree about who may see money. It also removes the with/without-permission HR pair that `AC-AUTH-003` relies on (`FE-1204`) |
| Post-8 | An employee-raised task accepts no time until endorsed, enforced in three places | The dropdown, the entry validation and the review service each leave a gap the others cover; without the validation rule someone could raise a task, log a full day and be reviewed afterwards |
| Post-8 | Task review deliberately does *not* use the shared approval chain | One endorser, and the record stops being a request afterwards. Forcing it in would add a reviewer stage and three roles to a shape with neither, plus a branch in four transition functions for one workflow |
| 20 Sep 2026 | Team Leads retain personal tasks and their own timesheet | Leadership adds team scope rather than replacing employee self-service. The Team Lead `New task` form has a `Self (me)` assignee option. A self-task is forced to the creator, has no supporting members, starts Pending with no review required, sends no approval or self-assignment notification, and accepts work only after moving to In Progress. |
| Post-8 | Backend suites excluded from the frontend vitest config | The backend config gives integration tests 60s and serial execution; the frontend pattern also matched them and ran them in jsdom at 5s concurrent, so they passed alone and timed out under load |
| Post-8 | The approval chain extracted to `approval.ts` + `approval-chain.ts` before conveyance was built | Two copies of one workflow drift, and the drift surfaces as a record reaching a reviewer it should not have. The requisition suite was re-run unchanged to prove the extraction preserved behaviour |
| Post-8 | Conveyance added to frontend Phase 7 and as backend Phase 11 | Requested by the user. It travels the *identical* chain to requisition, so the first task on both sides is to extract that chain into one shared implementation rather than copy it — two copies of one workflow drift, and the drift shows up as a claim reaching a reviewer it should not have |
| Post-8 | A conveyance receipt is deny-by-default attachment data | `AGENTS.md` §2 lists attachments among the deny-by-default categories, so a receipt must be reachable by exactly the people who can see its claim — including against a direct file id, which is the access path a UI check never covers |
| Post-8 | Requisition added to frontend Phase 7 and as backend Phase 10 | Requested by the user. Reopening a completed phase rather than inventing a Phase 10 frontend keeps the feature with the supporting modules it belongs to; the backend chain is self-contained enough to be its own milestone |
| Post-8 | Requisition is allowed approval wording | A requisition is a real decision, like WFH and leave. The prohibition in §2 is specifically on daily time records, and this does not weaken it |
| Post-8 | Re-skinned to the PowerInAI palette on a light canvas | Requested by the user. Values taken from powerinai.com's own stylesheet; because the site is dark-ground, each brand hue is split by job — full strength where 3:1 suffices, one step deeper where a label must be read |
| Post-8 | Pink `#ff3c7e` excluded from controls and status | It reads as the Critical red beside a status badge, and Critical means an employee worked over twelve hours. It appears only on the mark, the sign-in panel and the chart palette |
| Post-8 | The five day-status colours left untouched by the re-skin | They are semantic, not decorative, and Missing and Critical already sit within 0.1 of the 4.5:1 floor |
| Post-8 | `Project.clientOrStakeholder` renamed to `client`, and time filterable by client on My Timesheet | Requested by the user. `REQ-WORK-001` already stores the field; the rename removes the ambiguity, and the filter answers "how much time went to this client" from the existing project split without a new entity |
| Post-8 | The client filter's options come from the viewer's own rows, not from a project list | Options built from all projects would name clients whose work the viewer is not authorized to see — the same disclosure `REQ-SRCH-003` forbids in counts |
| Phase 7 | `IntegrationPlaceholderView.state` has only a `not_configured` variant | A demo that appears to be posting to payroll is the specific failure the screen exists to avoid; the type makes the claim impossible |
| Phase 7 | Print styles assert computed styles in the flow gate | Print behaviour is invisible to every other gate — chrome removal, repeating header rows and page-break avoidance can only be checked under `emulateMedia` |
| Phase 8 | Four new QA gates rather than a manual checklist | Each looks for a defect class the existing gates structurally cannot see; together they found nine, including a clickable row that had been keyboard-unreachable since Phase 1 |
| Phase 8 | `min-w-0` placed on `Card`, the chart figure and the table scroll region | The same overflow defect appeared in three phases in three places; the constraint belongs to the component, not to every layout that uses one |
| Phase 8 | `CardHeader` defaults to `h2` | Defaulting to `h3` under the page `h1` skipped a heading level on 14 routes, leaving heading navigation unusable |
| Phase 8 | The script-transfer budget was removed, not tuned | It measured dev-server compilation order — identical code read 5 MB cold and 1 KB warm. A check that flips with cache state is worse than none; bundle size moves to Phase 9 packaging |
| Phase 8 | `FE-0825` left at `[~]` | Its measurable half is automated and passing; spacing, alignment and hierarchy need a person to look, and that is the same walkthrough the Phase 1 showcase criterion awaits |
| Visual enhancement | Modern SaaS polish belongs in shared tokens and components | Card elevation, page rhythm, navigation state, controls, charts, and table scanning improve across all screens without changing routes, permissions, feature logic, or the PowerInAI palette. UI/UX Pro Max database search was unavailable because Python is not installed, so its documented enterprise SaaS defaults and accessibility priority rules were applied. |
| Backend Phase 3 | Effective organization/work rules belong in one application service over transaction-aware repositories | This keeps assignment dates, scope, optimistic conflicts, derived actual time, task review, audit, and notifications consistent across future Server Actions and Route Handlers. Task review decisions are append-only and time validation calls the shared `taskAcceptsTime` predicate. |
| Theme refresh | Full-white and aquatic light theme replaced the warm neutral and gold palette | Superseded by the PowerInAI re-skin above; kept because it records why a brand colour is split by job rather than used at one strength |
| Backend Phase 0 | Contract inventory maps every current `ServiceRegistry` operation to a server use-case family | Preserves the frontend boundary and exposes missing later-phase contracts before database work |
| Backend Phase 0 | Domain/application/infrastructure/delivery/composition dependency direction | Keeps calculations, authorization and transactions framework-independent and testable |
| Backend Phase 0 | Drizzle/mysql2, Better Auth, Zod, BullMQ/Redis, private S3, Resend, Node 24 containers and MySQL 8.4 | Satisfies the documented transaction, security, durable-work, protected-file and deployment criteria while keeping providers behind ports |

Backend Phases 0–4 are complete. Phase 3 adds migration `0006`, transaction-aware organization/work repositories and services, protected profile-photo delivery, effective assignment and allocation validation, derived project/task actual time, and append-only employee-task endorsement. Evidence lives in `docs/backend/phase-3/verification.md`. Backend Phase 4 adds authoritative MySQL time entries/timers, shared calculation and UTC validation, transactional summaries/audit/outbox, general remarks, and frozen HR verification/amendment history. All 33 tasks are done; evidence and migration reconciliation notes are in `docs/backend/phase-4/verification.md`. Final checks: 168 backend tests, 409 frontend tests, typecheck/lint/build passing. The local MySQL test runtime is WAMP 9.1; the approved deployment target remains 8.4 LTS. Backend Phase 5 now implements all 26 numbered tasks: authoritative HR requests, attendance, holidays, workload and evaluations, migration 0009 and durable scheduled jobs. Evidence: `docs/backend/phase-5/verification.md`. Backend tests pass 195/195. Browser cutover remains Phase 9, including wiring `EvaluationScore.competencies` into the review form; submission requires all nine qualitative competencies beneath the six weighted groups. Production policies and live Redis worker setup remain deployment inputs. Seed identities and organization data are demonstrations, not authoritative production inputs; provider credentials, production domains, capacity sizing, and RTO/RPO remain deployment/business inputs.


## Backend Phase 6 handoff — 13 September 2026

`src/server/reporting` supplies the report catalogue/query layer, reporting and Finance contract adapters, exact effective-dated financial configuration, and durable export processing. `/api/reporting` is the session-derived HTTP boundary. Browser services remain mock-backed until Phase 9. See `docs/backend/phase-6/verification.md` for task mappings, API/worker setup, explicit engineering defaults and gate evidence.

Finance defaults to verified data; open-period reads require `report.finance.unverified`. Cost access remains separately granted through `finance.cost.view`, settings changes additionally require `finance.settings.manage`, and sensitive exports require `reporting.export.protected`. Migration 0010 registers capabilities without granting them. Rates/billability may be superseded from a later unverified date with an audit trail. Payroll field configuration must be supplied by an authorized owner; engineering fixtures are not business approval.

Excel/CSV/PDF/print artifacts are generated by the persistent worker, stored privately in S3, and revalidated at download. Configure a Unicode PDF font, worker startup, private storage and lifecycle cleanup before production deployment. Queries are bounded to 367 dates, 20,000 employee-days and 32 MiB of retained source context; larger requests must be split. The production performance gate remains Phase 8.

Verification: full backend regression 223/223 before the last two additional cases; final Phase 6 suite 30/30; frontend/shared 409/409; type generation, TypeScript, lint, contrast 48/48, migration validation 10/10, dependency high/critical gate and 60-page production build passed. The ExcelJS UUID advisory was fixed with a scoped compatible override; four pre-existing moderate Drizzle Kit development findings remain. Checks used the Windows Node 24 runtime and isolated WAMP test databases.

## Modify Phase B2 handoff — 21 September 2026

All 11 tasks and three exit criteria are complete. `src/server/time` now accepts the typed duration-only work-log contract, rejects unavailable/Pending/Completed/unapproved tasks, enforces the 24:00 active cap, stores create retry keys, and serializes corrections, summaries, outbox, audit and replay results. Updates require a reason and version; verified periods use the existing authorized amendment/unlock paths. Historical clocks remain immutable, including during period state changes. Preserved timer drafts convert once to a new duration record while retaining their original facts and audit provenance.

`/api/time` identifies HTTP contract version 2. Timer operations and clock payloads receive 410 `OPERATION_RETIRED`, with no runtime timer repository methods remaining. Work-log history is protected by the audit grant; attachment identifiers remain separately protected. Task transition/history services were subsequently delivered in B3; browser adapter and production cutover remain B4. The explicit B2 request did not complete F4 or supply B1 HR sign-off.

Verification: Node 24.20.0 production build and TypeScript pass; 241/241 backend tests and 57/57 final focused time tests pass; 582/582 frontend/shared tests pass with two workers; full lint and final affected-file lint pass; 11/11 migration/recovery pairs validate. Detailed task mapping and HTTP usage are in `docs/backend/modify/phase-b2-verification.md`.


## Modify Phase B3 handoff — 21 September 2026

All nine tasks and three exit criteria are complete. `src/server/task-work` implements required-version, idempotent transitions and assignment, deriving authority from the session and effective scope rather than client roles. Reopen requires a reason and clears current completion time while retaining immutable completion events. Transitions cannot create time. Authorized chronological history derives actual/variance from readable logs before grouping; historical clock facts remain intact. The `/api/time` v2 boundary adds `task.transition`, `task.assign`, and `view=task-history`.

`src/server/notifications/service.ts` supplies the shared transactional in-app notification foundation required by B3, including recipient-filtered positive variance and overtime/critical alerts with fixed safe text. It does not complete the rest of Backend Phase 7. Audits and delivery are atomic with workflow writes; refused locked-period mutations retain an independent audit record. Existing metadata services reject status/assignee bypasses. The current effective division lead model remains in use until the separate organization-hierarchy replacement.

Verification: 306/306 backend tests, final focused task-work/time 120/120, frontend/shared 582/582, full lint, Node 24.20.0 production build/TypeScript (62 pages), migration validation 11/11 and contrast 48/48 passed. Evidence and task mapping: `docs/backend/modify/phase-b3-verification.md`. F4, B1 HR rehearsal sign-off and B4 cutover remain outstanding.
