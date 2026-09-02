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

### Formatting is centralised

`src/lib/format.ts` is the single implementation of every date, time, duration, money, and percentage rule. Never build one of those strings by hand — a duration rendered two ways is a defect, and a rounded one is a calculation defect. Status presentation lives in `src/lib/status.ts`.

### Styling

Tailwind v4 with semantic tokens in `@theme` (`src/app/globals.css`). Utilities stay inside typed component wrappers — screens compose `<Button variant="primary">`, not raw utility strings. Build new UI from `src/components/{ui,forms,feedback,data,charts,layout,shell}`; if something is missing, add it *there*, not inline in a feature screen.

> **Tailwind scans source text.** A class built by interpolation (`` `text-${tone}` ``) is never generated and the style silently vanishes. Use an explicit static map — see `src/components/ui/status-indicator.tsx`.

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
  lib/                          cn · format · status
  features/ services/ fixtures/ Empty placeholders — filled from Phase 2 on
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

### Quality gates are hard

When an audit fails, fix the **token or component** — never lower a threshold, add an exception, or narrow the checked set to make a run pass. The contrast script deliberately parses the real stylesheet instead of holding its own palette copy, so a colour changed without re-checking its pairings fails the build.

React Compiler lint errors (`set-state-in-effect`, render-phase mutation) are real. Fix the pattern; do not suppress the rule.

---

## 6. Current State

| Milestone | Phase | Status |
|---|---|---|
| Frontend | 0 — Product and UX foundation | Done (19/19) |
| Frontend | 1 — Foundation and design system | Done (26/26) |
| Frontend | 2 — Authentication and role-based shell | **Next** (0/10) |
| Frontend | 3–9 | Pending |
| Backend | 0–9 | Pending — blocked on frontend contracts |

Phase 1 gates: contrast 47/47, responsive 8/8, `verify` passing with 23 tests.

Phase 2 (`FE-0201`–`FE-0210`) replaces the temporary index at `/` with `/login` and role-based redirection.

---

## 7. Assumptions, Not Decisions

These read as settled in the deliverable files, but **no stakeholder has confirmed them**. Flag them when a phase starts depending on them; do not silently expand them.

- **Demo accounts and dataset** (`docs/frontend/phase-0/demo-setup.md`) — invented to be internally consistent and to exercise every rule, not supplied by the business.
- **The MVP vs Phase-2 boundary** for attendance, HR reports, and Finance cost tiles — `project_requirement.md` §2.3 doesn't name these; they were read as Phase 2 by association.
- **Stakeholder approval of the component showcase** — the one Phase 1 exit criterion still at `[~]`.

Still owed by the business (`project_requirement.md` §11): authoritative employee list, division membership, Team Lead mapping, holiday calendars, schedules, leave balances, initial projects; HR approval of work policies and payroll periods; Finance approval of cost-rate and payroll-export rules.

Also open: ORM, auth library, validation library, job runner, file storage, email provider, runtime topology, and MySQL environment settings (`BE-0007`–`BE-0014`). **Do not invent these choices** — see `docs/architecture.md` §18 for the selection criteria.

---

## 8. How Work Is Run Here

The user drives delivery **one phase at a time** — "Start Phase 2" means complete every task in that phase, not a representative subset.

**Task markers.** Exactly one per task: `[ ]` pending, `[~]` in progress, `[x]` done. When status changes, update both the task line *and* the "Current Progress Summary" table at the bottom of the milestone file. Record which deliverable file satisfies which task id.

**Definition of done** (frontend, `frontend_milestone.md` §6): implemented against the typed service boundary; normal/loading/empty/validation/error/denied/success states covered; keyboard, focus, target-size, label, contrast and reduced-motion checked; verified at the relevant responsive widths; uses shared tokens and components with no one-off styling; totals and statuses agree with requirements and fixtures; tests pass with no lint, type-check, or build regression.

**Do not mark a task `[x]` you cannot substantiate.** An exit criterion needing human sign-off stays `[~]` with a note saying why — that is expected and correct, not a failure.

**Verify, don't assert.** Claims about contrast, responsiveness, or passing tests should come from a command that was actually run. Both audit scripts exist because their first runs found real defects that looked fine by inspection.
