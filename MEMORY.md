# Project Memory

Durable context for anyone — human or AI — picking up this codebase. It records what the plan files don't: why things are the way they are, what's decided versus assumed, and the rules that are easy to break by accident.

Last updated: **2 September 2026** (end of frontend Phase 1).

---

## 1. What This Is

A centralized, responsive web application for tracking employee time and work across multiple divisions, for **PowerInAI**.

| Field | Value |
|---|---|
| Initial divisions | PowerInAI, PowerInAI Training, Government Projects, Computer Jagat, WesternCF |
| Roles | Super Administrator, Team Lead, Employee, HR Manager, Finance Manager, Management/View-Only |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 with semantic tokens |
| Database | MySQL (backend milestone only — not yet connected) |
| Business timezone | Asia/Dhaka |
| Currency | BDT |

The product connects working hours to divisions, projects, and tasks, and gives each role a consistent view of attendance, workload, performance, and labour cost.

---

## 2. Delivery Model

**One repository, frontend first.** The frontend milestone ships against typed mock adapters; the backend milestone later replaces those adapters *inside the same repo* without redesigning approved screens. The project is never split into separate frontend and backend applications.

Three files at the repo root are the plan of record:

| File | Contains |
|---|---|
| `project_requirement.md` | `REQ-*` business requirements, `AC-*` acceptance scenarios. The requirements source of truth. |
| `frontend_milestone.md` | `FE-*` tasks, Phases 0–9. |
| `backend_milestone.md` | `BE-*` tasks, Phases 0–9. Backend Phase 0 is blocked until frontend contracts are stable. |

Work proceeds **one phase at a time** — a phase is started by name, and every task in it is completed before moving on. Task status uses exactly one marker: `[ ]` pending, `[~]` in progress, `[x]` done. When status changes, update both the task line and the "Current Progress Summary" table at the bottom of the file.

---

## 3. Domain Rules That Are Easy to Get Wrong

Each of these has a natural-looking wrong implementation that would pass a casual review and corrupt payroll or leak protected data. Full detail is in `project_requirement.md` §3, §5.3 and §12; this is the short list.

- **A normal full day is 7 active hours + 1 separate break hour = 8 total.** Both thresholds must be met for "Complete". The break is **one recognized value per day** — it is never added per entry.
- **Classification:** Missing / Under-time / Complete / Overtime (above 8:00 through **exactly 12:00**, reason required) / Critical (above 12:00, explanation required plus Team Lead and HR notification). Exactly 12:00 is Overtime, not Critical.
- **There is no daily Team Lead approval, anywhere in the product.** Team Leads do exception-based review and correction requests; HR verifies and locks payroll periods. Approval language belongs only on WFH requests, leave requests, and HR period verification — never on a daily time record.
- **One general remark type.** Not multiple remark categories.
- **Time aggregates across all divisions for the local day, but overlapping entries are rejected even across different divisions.**
- **Deny by default** for government-project, salary, cost, evaluation, export, attachment, and audit data. UI hiding is never the control. A restricted field is omitted or explicitly marked `Restricted` — never blanked, never zeroed.
- **Durations are integer minutes. Money is a fixed-precision decimal string plus a currency code.** Never floating-point hours, never a bare number for money. `6:59` must never render as `7:00`.
- **Status is never communicated by colour alone** — always shape + text + colour.
- Store UTC instants **plus** the local work date, timezone, and applied policy version, so historical and verified results stay reproducible after a policy change.

---

## 4. Repository Map

```
project_requirement.md          Requirements (REQ-*, AC-*)
frontend_milestone.md           Frontend plan (FE-*)
backend_milestone.md            Backend plan (BE-*)
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
  features/ services/ fixtures/ Empty placeholders — filled from Phase 2 onward
  test/                         Vitest setup

scripts/
  contrast-audit.mjs            WCAG gate (reads tokens from globals.css)
  responsive-audit.mjs          Playwright gate at 375/768/1024/1440 px
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
| `npm run test` | Vitest |

Environment: Windows + WAMP, PowerShell. **Not currently a git repository.**

---

## 6. Conventions

**The service boundary is absolute.** UI components never import fixtures. Pages and feature modules consume data only through the typed interfaces in `src/contracts/services.ts`, so the MySQL implementation can replace the mock adapters without touching screens. Every operation returns `Result<T>` — failures are values, not thrown exceptions.

**Authorization lives in the service, never in the component.** A service returns `permission_denied` or omits restricted fields; the UI never decides what a viewer may see. A record the viewer cannot access returns the *same* not-found presentation as a nonexistent one, so identifiers cannot be probed.

**Styling.** Tailwind v4 with semantic tokens in `@theme` (`src/app/globals.css`). Utilities stay inside typed component wrappers — screens compose `<Button variant="primary">`, not raw utility strings. No component library was added; overlays, tabs, tables and charts are hand-built against the tokens. Icons come from `lucide-react` only; never emoji.

> Tailwind scans source text, so an interpolated class (`` `text-${tone}` ``) is never generated and the style silently vanishes. Use an explicit static map — there's one in `src/components/ui/status-indicator.tsx`.

**Formatting is centralised.** `src/lib/format.ts` is the single implementation of every date, time, duration, money, and percentage rule. No component builds one of those strings by hand — a duration rendered two ways is a defect, and a rounded one is a calculation defect.

**Quality gates are hard.** When an audit fails, fix the token or the component — never lower a threshold, add an exception, or narrow the checked set to make a run pass. The contrast script deliberately parses the real stylesheet rather than holding its own palette copy, so a colour changed without re-checking its pairings fails the build.

---

## 7. Current State

| Milestone | Phase | Status |
|---|---|---|
| Frontend | 0 — Product and UX foundation | Done (19/19) |
| Frontend | 1 — Next.js foundation and design system | Done (26/26) |
| Frontend | 2 — Authentication and role-based shell | **Next** (0/10) |
| Frontend | 3–9 | Pending |
| Backend | 0–9 | Pending — blocked on frontend contracts |

Phase 2 replaces the temporary index at `/` with `/login` and role-based redirection.

Gate results at the end of Phase 1: contrast audit 47/47, responsive audit 8/8 route × width combinations, `npm run verify` passing with 23 tests.

---

## 8. Open Items — Assumptions, Not Decisions

These read as settled in the deliverable files, but no stakeholder has confirmed them:

- **Demo accounts and sample dataset** (`docs/frontend/phase-0/demo-setup.md`) — 11 employees, 5 divisions, 6 projects, 3 payroll periods, 16 time scenarios, demo date pinned to 2026-09-02. Invented to be internally consistent and to exercise every rule; **not supplied by the business.**
- **The MVP vs Phase 2 boundary** for attendance, HR reports, and the Finance cost tiles (`docs/frontend/phase-0/traceability-and-priority.md`). `project_requirement.md` §2.3 doesn't name these explicitly; they were read as Phase 2 by association.
- **Stakeholder approval of the component showcase** — the one Phase 1 exit criterion left at `[~]`, since approval isn't self-certifiable.

Per `project_requirement.md` §11, the product owner still owes the authoritative employee list, division membership, Team Lead mapping, holiday calendars, schedules, leave balances, and initial projects. HR must approve work policies, payroll periods, and leave rules. Finance must approve cost-rate handling and payroll export fields.

Later phases harden screens and fixtures around these assumptions, so the cost of changing them grows with every phase built on top.

---

## 9. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| Phase 0 | Durations as integer minutes, money as decimal string + currency code | Floating-point hours and JS numbers produce payroll errors |
| Phase 0 | Restricted fields typed `Redactable<T>` | Makes "you may not see this" representable, so it can't be mistaken for zero or absent |
| Phase 1 | Tailwind v4 + tokens over CSS Modules or shadcn/ui | Fastest to the premium spec; reshaping a vendored library's conventions costs more than building to tokens |
| Phase 1 | Hand-built charts (inline SVG) instead of a charting library | Full control of the colour-safe series and the always-present data-table equivalent |
| Phase 1 | Added two custom audit gates | Both found real defects on first run — a 1.70:1 control border, two chart series 1.02 apart in luminance, 8 undersized touch targets, and a component stealing focus on mount |
| Phase 1 | Native `<select>` rather than a custom listbox | Free platform keyboard behavior, mobile pickers, and screen-reader support |
