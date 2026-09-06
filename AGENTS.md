<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Multi-Division Employee Timesheet and Work Management System

A centralized web application for tracking employee time and work across multiple divisions, for **PowerInAI**. It connects working hours to divisions, projects, and tasks, and gives Employees, Team Leads, HR, Finance, Management, and Administrators a consistent view of attendance, workload, performance, and labour cost.

| Field | Value |
|---|---|
| Divisions | PowerInAI, PowerInAI Training, Government Projects, Computer Jagat, WesternCF |
| Roles | Super Administrator, Team Lead, Employee, HR Manager, Finance Manager, Management/View-Only |
| Stack | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Vitest |
| Database | MySQL — **backend milestone only, not yet connected** |
| Business timezone / currency | Asia/Dhaka · BDT |
| Environment | Windows + WAMP, PowerShell. **Not a git repository.** |

---

## 1. Read This First — Document Map

Everything below already exists. Read the relevant one *before* starting work rather than re-deriving it.

| Document | Read it when |
|---|---|
| `project_requirement.md` | You need the authoritative business rule. `REQ-*` requirements and `AC-*` acceptance scenarios. **The source of truth — never contradict it.** |
| `docs/architecture.md` | You need to know how the system is structured and why. Architectural drivers, module boundaries, calculation engine, authorization model, data strategy, open technical decisions. |
| `MEMORY.md` | You want fast orientation: project state, conventions, decision log, what's assumed vs decided. |
| `frontend_milestone.md` | You are doing frontend work. `FE-*` tasks, Phases 0–9, progress table. |
| `backend_milestone.md` | You are doing backend work. `BE-*` tasks, Phases 0–9. Backend Phase 0 is blocked until frontend contracts are stable. |
| `docs/frontend/phase-0/traceability-and-priority.md` | You need a screen's route, roles, requirement ids, or MVP/Phase-2/3/4 label. |
| `docs/frontend/phase-0/information-architecture.md` | You are building navigation, a screen flow, breadcrumbs, deep links, or mobile behavior. Covers all six roles and ten flows. |
| `docs/frontend/phase-0/terminology-and-formats.md` | You are about to display a date, time, duration, money, percentage, status, name, or empty value. **Also lists forbidden wording.** |
| `docs/frontend/phase-0/demo-setup.md` | You need demo accounts, the sample org, or a named time scenario. Demo "today" is pinned to **2026-09-02**. |
| `docs/frontend/phase-1/contrast-audit.md` | You are changing a colour token or need the WCAG results. |
| `docs/frontend/phase-4/verification.md` | You need what Phase 4 delivered and how it was verified. |
| `docs/frontend/phase-5/verification.md` | You need what Phase 5 delivered and how it was verified, including the HR permission boundaries. |
| `docs/frontend/phase-6/verification.md` | You need what Phase 6 delivered and how it was verified, including the money-precision and redaction rules. |
| `docs/frontend/phase-7/verification.md` | You need what Phase 7 delivered and how it was verified, including the runtime feature-flag store and the print rules. |
| `docs/frontend/phase-8/verification.md` | You need the hardening evidence: the four QA gates, the nine defects they found, and the three checks that were wrong and removed. |
| `src/contracts/*.ts` | You are calling or implementing a data operation. Domain types, view models, service interfaces, result shapes, query shapes, feature flags. |

---

## 2. Domain Rules You Must Not Break

Each of these has a natural-looking wrong implementation that passes casual review and corrupts payroll or leaks protected data. Full detail in `project_requirement.md` §3, §5.3, §12.

- **A normal full day is 7 active hours + 1 separate break hour = 8 total.** Both thresholds must be met for "Complete".
- **The break is one recognized value per day.** It is *never* added per entry. This is the single most common misreading of the domain.
- **Classification:** Missing / Under-time / Complete / Overtime (above 8:00 through **exactly 12:00**, reason required) / Critical (above 12:00, explanation required + Team Lead and HR notification). Two traps: exactly 12:00 is **Overtime**, and Under-time triggers on failing *either* threshold, not both.
- **There is no daily Team Lead approval anywhere in this product.** Team Leads do exception review and correction requests; HR verifies and locks payroll periods. Approval wording is allowed only on WFH requests, leave requests, and HR period verification — never on a daily time record. Do not add an approve button, an "awaiting approval" state, or approval language to a timesheet.
- **One general remark type.** Not multiple remark categories.
- **Time aggregates across all divisions for the local day, but overlapping entries are rejected even across different divisions.** An employee cannot be in two places at once.
- **Deny by default** for government-project, salary, cost, evaluation, export, attachment, and audit data. Hiding it in the UI is *not* the control. A restricted field is omitted or explicitly marked `Restricted` — never blanked, never zeroed.
- **Durations are integer minutes. Money is a fixed-precision decimal string plus a currency code.** No floating-point hours, no bare numbers for money. `6:59` must never render as `7:00`.
- **Status is never colour alone** — always shape + text + colour.
- Store UTC instants **plus** local work date, timezone, and applied policy version, so verified history stays reproducible after a policy change.
- **Authorization is applied before aggregation.** Counts, totals, empty groups, search results, file names, and error timings must not reveal records the viewer cannot see. An unauthorized record returns the same not-found response as a nonexistent one.

---

## 3. Code Conventions

### The service boundary is absolute

UI components **never** import fixtures. Pages and feature modules consume data only through the typed interfaces in `src/contracts/services.ts`. This is what lets the MySQL implementation replace mock adapters without redesigning screens — breaking it defeats the entire delivery strategy.

### Results are values, not exceptions

Every operation resolves to `Result<T>` from `src/contracts/results.ts`: success, validation failure (with field-level `guidance`), permission denied, unauthenticated, not found, conflict (including locked-period), or error. Components branch on `status`.

### Authorization lives in the service

A service returns `permission_denied` or omits restricted fields. The UI never decides what a viewer may see.

### The calculation engine is the single implementation

`src/lib/calculation/engine.ts` produces every daily total, classification and
contribution split. The preview, timesheet views, dashboards and later reports
all call it. Never recompute hours anywhere else — not in a component, not in a
service, not in an aggregate.

**A task an employee raised accepts no time until their Team Lead approves it.**
`taskAcceptsTime` in `src/contracts/domain.ts` is the single predicate; it is
read by `selectableTasks`, by `validation.ts` and by the review service, so the
rule cannot drift between them. This is *not* the approval chain below — one
person endorses a task and it then becomes ordinary work.

Requisition and conveyance share **one** approval chain —
`src/contracts/approval.ts` and `src/services/mock/approval-chain.ts`. A second
copy of the stage machine is how the two silently diverge, and the divergence
shows up as a record reaching a reviewer it should not have. Add a workflow by
extending `Approvable`, never by rewriting the transitions.

`src/lib/client-time.ts` regroups that output by client and is the only place
that happens. A client is a free-text label on a project (`Project.client`),
not an entity — so time reaches a client only through its project, work on a
project with no client and work on no project at all share one reported "Not
recorded" bucket, and the split always sums back to the day's active total.
It adds integer minutes; it never derives a duration.

`src/lib/calculation/validation.ts` holds the entry rules. Every error it
returns carries a field, a message **and** corrective guidance, because
`REQ-TIME-025` requires all three.

### Mock state the calculation reads lives in the store

Assignments, holidays and payroll periods are held in `src/services/mock/store.ts`, not as fixture constants, because HR mutates them and the daily calculation reads them. Adding an assignment must immediately widen which divisions accept time; verifying a period must immediately lock its dates. That only holds while both sides read the same state — `mockStore.isDateLocked` is the single lock check, and nothing re-derives it.

### Money arithmetic is exact and centralised

`src/lib/money.ts` is the only place a money value is computed. It works in minor units on `bigint` and rounds half-up once, at the end — never per row. A rate carrying more precision than the currency holds is rejected rather than truncated. Never use `number` for money, and never derive a cost from an already-rounded hours figure.

Cost reaches the UI as `RedactableMoneyView`, whose restricted variant carries **no** value or display string. A viewer without `finance.cost.view` therefore has no money in the view model at all — redaction is a type-level guarantee, not a rendering convention.

### Formatting is centralised

`src/lib/format.ts` is the single implementation of every date, time, duration, money, and percentage rule. Never build one of those strings by hand — a duration rendered two ways is a defect, and a rounded one is a calculation defect. Status presentation lives in `src/lib/status.ts`.

### Styling

The palette is the **PowerInAI brand** (powerinai.com) inverted onto a light
canvas: violet `#6c63ff`, pink `#ff3c7e`, ink `#18192b`. Neither brand colour
clears 4.5:1 on white, so each identity hue is split by job — full strength for
indicators, focus and charts, one step deeper (`#5b52e6`) for anything carrying
a label. Pink never appears on a control or a status, because it reads as the
Critical red. `docs/frontend/phase-1/contrast-audit.md` records the reasoning
and every ratio.

Tailwind v4 with semantic tokens in `@theme` (`src/app/globals.css`). Utilities stay inside typed component wrappers — screens compose `<Button variant="primary">`, not raw utility strings. Build new UI from `src/components/{ui,forms,feedback,data,charts,layout,shell}`; if something is missing, add it *there*, not inline in a feature screen.

> **Tailwind scans source text.** A class built by interpolation (`` `text-${tone}` ``) is never generated and the style silently vanishes. Use an explicit static map — see `src/components/ui/status-indicator.tsx`.

> **The type scale is registered with `tailwind-merge`** in `src/lib/cn.ts`. Without it, `twMerge` reads a custom size class such as `text-body-sm` as a text *colour* and drops the colour class before it — which shipped a 1.07:1 button once. Add any new named `text-*` size to `TYPE_SCALE` there.

Icons come from `lucide-react` only. Never emoji as interface icons.

### Accessibility is not optional

WCAG 2.2 AA. Visible labels, field-level errors, `aria-describedby` wiring (handled by `Field`), focus trapping and restoration in overlays, 24 px minimum effective target size, no page-level horizontal scrolling, reduced-motion support.

---

## 4. Repository Map

```
project_requirement.md          Requirements (REQ-*, AC-*)
frontend_milestone.md           Frontend plan (FE-*)
backend_milestone.md            Backend plan (BE-*)
MEMORY.md                       Project context and decision log
AGENTS.md                       This file (CLAUDE.md imports it)

docs/
  architecture.md               Architecture, drivers, open decisions
  frontend/phase-0/             Traceability, demo setup, IA, terminology
  frontend/phase-1/             Contrast audit

src/
  app/                          Routes; globals.css holds all design tokens
  contracts/                    domain · view-models · services · results ·
                                query · feature-flags
  components/
    ui/                         Button, badge, status, avatar, skeleton,
                                progress, tooltip, misc
    forms/                      Field wrapper, all input controls
    feedback/                   Card, alert, empty state, overlays, toast,
                                tabs/accordion/steps
    data/                       DataTable, filters, pagination
    charts/                     ChartContainer, BarChart, DonutChart
    layout/                     PageHeader, breadcrumbs, grids, sticky bars
    shell/                      Sidebar, top bar, mobile nav, navigation model
  lib/                          cn · format · status · money · use-async
  features/                     access · dashboard · timesheet · tasks ·
                                team-lead · hr · finance · management ·
                                reports · workspace · admin · settings
  services/mock/                auth · organization · timesheet · work ·
                                team-lead · hr · finance · reporting ·
                                workspace · admin · store
  fixtures/                     index.ts (core dataset) · hr.ts (employees,
                                evaluations, amendments) · finance.ts (rates,
                                billability, payroll periods, exports) ·
                                workspace.ts (notifications, documents,
                                messages, audit events)
  test/                         Vitest setup

scripts/
  contrast-audit.mjs            WCAG gate; parses tokens from globals.css
  responsive-audit.mjs          Playwright gate at 375/768/1024/1440 px
```

---

## 5. Commands

| Command | Notes |
|---|---|
| `npm run dev` | Dev server on :3000. Component showcase at `/showcase`. |
| `npm run verify` | typecheck → lint → contrast audit → tests → production build |
| `npm run typecheck` | Runs `next typegen` first — Next 16 generates the `LayoutProps` global |
| `npm run lint` | ESLint incl. React Compiler rules |
| `npm run test` | Vitest |
| `npm run audit:contrast` | Requires no server |
| `npm run audit:responsive` | **Requires a dev server already running** |
| `npm run audit:flows` | Phase 2 auth and access flows. **Requires a dev server already running** |
| `npm run audit:flows3` | Phase 3 employee and calculation flows. **Requires a dev server already running** |
| `npm run audit:flows4` | Phase 4 Team Lead flows. **Requires a dev server already running** |
| `npm run audit:flows5` | Phase 5 HR flows. **Requires a dev server already running** |
| `npm run audit:flows6` | Phase 6 Finance and Management flows. **Requires a dev server already running** |
| `npm run audit:flows7` | Phase 7 reporting and supporting-module flows. **Requires a dev server already running** |
| `npm run audit:a11y` | Keyboard, focus, structure, semantics, zoom and reduced motion. **Requires a dev server already running** |
| `npm run audit:stress` | Extreme content at three widths, interaction feedback, type-scale consistency. **Requires a dev server already running** |
| `npm run audit:journeys` | End-to-end role journeys. **Requires a dev server already running** |
| `npm run audit:perf` | DOM size and layout stability. **Requires a dev server already running** |

### Layout constraints belong to the component

Three separate phases found the same defect in a new place: a flex or grid child sizes itself to its content's min-content width unless told not to. `min-w-0` is therefore already on `Card`, the chart `figure`, `DataTable`'s scroll region and the shell's content column — put it on the container, not on the forty call sites. The matching rule for a header row is `flex-wrap` plus `min-w-0` on the actions, never `shrink-0`.

`.table-scroll` is also `position: relative`, because `sr-only` text is absolutely positioned and escapes a static scroll container, stretching the document's scroll width.

### Quality gates are hard

When an audit fails, fix the **token or component** — never lower a threshold, add an exception, or narrow the checked set to make a run pass. The contrast script deliberately parses the real stylesheet instead of holding its own palette copy, so a colour changed without re-checking its pairings fails the build.

React Compiler lint errors (`set-state-in-effect`, render-phase mutation) are real. Fix the pattern; do not suppress the rule.

---

## 6. Current State

| Milestone | Phase | Status |
|---|---|---|
| Frontend | 0 — Product and UX foundation | Done (19/19) |
| Frontend | 1 — Foundation and design system | Done (26/26) |
| Frontend | 2 — Authentication and role-based shell | Done (10/10) |
| Frontend | 3 — Employee core experience | Done (28/28) |
| Frontend | 4 — Team Lead experience | Done (21/21) |
| Frontend | 5 — HR experience | Done (17/17) |
| Frontend | 6 — Finance and Management experience | Done (11/11) |
| Frontend | 7 — Shared reporting and supporting modules | Done (52/52 · requisition, conveyance and employee-raised tasks included) |
| Frontend | 8 — Responsive, accessibility and quality hardening | Done (17/18 · `FE-0825` awaiting visual review) |
| Frontend | 9 — Demo packaging and backend handoff | **Next** (0/14) |
| Backend | 0 — Architecture and delivery foundation | Done (25/25) |
| Backend | 1 — MySQL schema and data foundation | Done (26/26) |
| Backend | 2 — Authentication, authorization, and audit | **Next** (0/23) |
| Backend | 3–9 | Pending |
| Backend | 10 — Requisition | Pending (0/20) — new milestone |
| Backend | 11 — Conveyance | Pending (0/22) — new milestone, depends on 10 |

Gates: contrast 48/48, responsive 268/268, accessibility 217/217, content-stress 63/63, role journeys 41/41, performance 16/16, Phase 2 flows 16/16, Phase 3 flows 18/18, Phase 4 flows 20/20, Phase 5 flows 51/51, Phase 6 flows 40/40, Phase 7 flows 55/55, `verify` passing with 264 tests.

Signing in: `/login`, password `Demo1234!` for every demo account, picker on the sign-in page. Auth fixtures (2FA code, reset tokens, lockout) are in `docs/frontend/phase-0/demo-setup.md` §1.1.

**`PLANNED_ROUTES` is empty as of Phase 7** — every navigation destination now resolves to a real screen, a feature-flag exclusion, or a labelled prototype. The mechanism stays: register a route in `src/features/access/planned-routes.ts` and `PlannedScreen` (`src/features/access/planned-screen.tsx`) renders it, which is the right answer whenever navigation runs ahead of a screen again.

Several routes serve more than one audience and branch on role rather than denying: `/wfh`, `/leave` and `/evaluations` are HR administration for HR and self-service for everyone else; `/dashboard` resolves to four different screens.

**Feature flags are runtime state**, not a build constant. `src/features/settings/flag-store.ts` is what the layout guard and shell read; `/settings` switches a module on or off and the navigation entry and route follow immediately. `DEMO_FEATURE_FLAGS` is only the default. Four modules — documents, messages, global search, integrations — ship **off**, so a screen that looks missing is usually a flag.

---

## 7. Assumptions, Not Decisions

These read as settled in the deliverable files, but **no stakeholder has confirmed them**. Flag them when a phase starts depending on them; do not silently expand them.

- **Demo accounts and dataset** (`docs/frontend/phase-0/demo-setup.md`) — invented to be internally consistent and to exercise every rule, not supplied by the business.
- **The MVP vs Phase-2 boundary** for attendance, HR reports, and Finance cost tiles — `project_requirement.md` §2.3 doesn't name these; they were read as Phase 2 by association.
- **Stakeholder approval of the component showcase** — the one Phase 1 exit criterion still at `[~]`.

Still owed by the business (`project_requirement.md` §11): authoritative employee list, division membership, Team Lead mapping, holiday calendars, schedules, leave balances, initial projects; HR approval of work policies and payroll periods; Finance approval of cost-rate and payroll-export rules.

Backend Phase 0 selected Drizzle/mysql2, Better Auth, Zod, BullMQ/Redis, private Amazon S3, Resend, persistent Node.js 24 LTS containers, and MySQL 8.4 LTS. See `docs/backend/phase-0/technology-decisions.md`; do not silently replace these choices.

---

## 8. How Work Is Run Here

The user drives delivery **one phase at a time** — "Start Phase 2" means complete every task in that phase, not a representative subset.

**Task markers.** Exactly one per task: `[ ]` pending, `[~]` in progress, `[x]` done. When status changes, update both the task line *and* the "Current Progress Summary" table at the bottom of the milestone file. Record which deliverable file satisfies which task id.

**Definition of done** (frontend, `frontend_milestone.md` §6): implemented against the typed service boundary; normal/loading/empty/validation/error/denied/success states covered; keyboard, focus, target-size, label, contrast and reduced-motion checked; verified at the relevant responsive widths; uses shared tokens and components with no one-off styling; totals and statuses agree with requirements and fixtures; tests pass with no lint, type-check, or build regression.

**Do not mark a task `[x]` you cannot substantiate.** An exit criterion needing human sign-off stays `[~]` with a note saying why — that is expected and correct, not a failure.

**Verify, don't assert.** Claims about contrast, responsiveness, or passing tests should come from a command that was actually run. Both audit scripts exist because their first runs found real defects that looked fine by inspection.
