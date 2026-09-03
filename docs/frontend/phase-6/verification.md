# Phase 6 — Finance and Management Experience Verification

Phase 6 replaces the Finance and Management placeholders with mock-backed workspaces. UI modules consume `FinanceService` and `ManagementService` (`src/contracts/finance.ts`); only `src/services/mock/finance.ts` imports fixtures or mutable mock storage.

Two constraints shaped almost every decision in this phase: **money must be exact**, and **the Finance role is not the financial permission**.

## Deliverable Map

| Tasks | Routes / implementation | Evidence |
|---|---|---|
| `FE-0601` | `/finance`, `finance-dashboard.tsx` | Verified employee, division, project and overtime hours, defaulting to the most recent verified period |
| `FE-0602` | `/finance` | Project cost, division cost, billable and non-billable hours, payroll total and budget variance, each keeping its label when withheld |
| `FE-0603` | `/finance/hours`, `/finance/overtime` | Employee-hours and overtime tables with payroll-period, employee, division, project and status filters |
| `FE-0604` | `/finance/project-costs`, `/finance/division-costs` | Totals, trend across periods, budget and estimate variance, employee drill-down, permission-redacted states |
| `FE-0605` | `/finance/billable` | Billable versus non-billable split with an exact minute-level reconciliation to total verified hours |
| `FE-0606` | `/finance/payroll` | Verification status, exception visibility, export readiness, export history and audit trail |
| `FE-0610` | `/finance/payroll`, `/finance/reports` | Report preview and export configuration that records a job and produces no file |
| `FE-0611` | `/finance/reports` | Report and grouping filters, saved presentation state, loading, no-results, unverified warning and restricted-column behaviour |
| `FE-0612` | `/dashboard` (management), `management-dashboard.tsx` | Company metrics, division summaries, employee summaries, time allocation and project progress |
| `FE-0613` | `ManagementService` | The interface exposes one reader and no mutation at all |
| `FE-0614` | Every financial chart | `ChartContainer` pairs each chart with an always-present data table and an accessible name; the billable screen adds a tabular reconciliation |

## Domain Rules Held

- **Money is exact.** `src/lib/money.ts` works in minor units on `bigint` and divides once, rounding half-up at the end. `1250.75/hour × 420 minutes` is exactly `8755.25`. A rate with more precision than the currency holds is rejected rather than truncated, so the stored rate and the computed cost cannot disagree. 12 unit tests cover this, including that a hundred separately-rounded minutes (`167.00`) differs from one division over the whole duration (`166.67`).
- **The role is not the permission.** A Finance viewer without `finance.cost.view` gets full hours and no money at all: the service never reads a rate, so no money value exists in the view model to leak. `RedactableMoneyView` has no `value` or `display` on its restricted variant, which makes that a type-level guarantee rather than a convention.
- **Restricted is not zero.** A withheld metric keeps its label and renders `Restricted`. A withheld report column stays in the table, marked, with `Restricted` cells — so the report's shape stays honest.
- **Finance reads verified periods.** Every view carries `isVerifiedPeriod` and an explicit warning; a cost export from an unverified period is refused with guidance. Verification is read from the timesheet period in the mock store, never copied, so a period HR verifies mid-session becomes payroll-ready immediately.
- **The break is one daily value.** Where a day spans several divisions, the recognized break is attributed *proportionally* across the rows of that day — never added once per row. The screen says so where it could be misread.
- **Management is read-only by construction.** The screen imports one service whose interface has no mutating method. The flow gate asserts zero edit, approve, verify, override, export or destructive controls, and finds zero.
- **Exports are honest.** No file is produced in this milestone. The job is recorded, its state stays `queued`, and both the dialog and the toast say so.

## A Deliberate Change to a Phase 2 Rule

`/finance/payroll` and `/finance/reports` were permission-gated on `finance.cost.view` from Phase 2. `FE-0611` requires restricted-field behaviour *inside* a report — the cost column present, its cells reading `Restricted`, the hours still usable. Denying the whole screen would make that behaviour unreachable and would withhold hours the Finance role is entitled to.

Both routes are now role-gated only; the service redacts the money. Screens that are wholly about money (`/finance/project-costs`, `/finance/division-costs`, `/finance/billable`) stay permission-gated. Four Phase 2 unit tests and one Phase 2 flow check encoded the old rule and were updated to assert the new one, keeping the boundary assertion on the routes that still carry it.

## Defects Found and Fixed During the Phase

| Defect | How it surfaced | Fix |
|---|---|---|
| `DataTable`'s scroll region is a flex child, whose default `min-width: auto` let it grow to the table's content width and silently defeated its own `overflow-x: auto`. Present since Phase 1; exposed by the first table with enough columns | `audit:responsive`, `/finance/hours` @ 768 and 1024 | `min-w-0` on the scroll region |
| `sr-only` text is absolutely positioned; `.table-scroll` was `static`, so those spans escaped the container's clipping and stretched the document's scroll width to the full table width even though the visible content clipped correctly | `audit:responsive`, `/finance/hours` @ 1024 (`scrollWidth` 1150 while `body` measured 1024) | `position: relative` on the `.table-scroll` utility |
| A precise money value (`BDT -13,528,567.00`, 248 px, non-breaking) overflowed a dense summary tile at exactly 768 px, where the sidebar appears and leaves ~180 px per column | `audit:responsive`, `/finance/project-costs` and `/finance/division-costs` @ 768 | Added a `compact` form to `RedactableMoneyView`; summary tiles show `BDT 13.5M` with the exact figure in `title` and in `sr-only` text, while every reconciling table keeps full precision |
| The React Compiler rejected reading a `useRef` during render to seed saved report state from `localStorage` | `npm run lint` | Replaced with an external store read through `useSyncExternalStore`, matching the session-store precedent — no hydration mismatch and no `setState` in an effect |

The first two are the more interesting pair: both were latent component defects that no amount of source review would have surfaced, and both required a table wide enough to scroll before they became visible.

## Dataset Change

July 2026 — the verified period Finance defaults to — held two days for one employee. Every cost, billable split and payroll figure would have been trivially small, and the division and project mix these screens exist to show would not have existed. July now carries 46 locked complete days across all four reported employees and five projects, using the same 3:00 + 4:00 shape as the rest of the dataset. All 164 tests pass unchanged against it.

## Automated Evidence

| Gate | Result |
|---|---:|
| `npm run audit:flows6` | 40/40 Finance and Management checks pass |
| `npm run audit:responsive` | 200/200 route × width combinations pass |
| Rendered contrast | 14,918 elements checked; 385 documented skips |
| `npm run audit:flows` | 16/16 authentication and access checks pass |
| `npm run audit:flows3` | 18/18 employee and calculation checks pass |
| `npm run audit:flows4` | 20/20 Team Lead checks pass |
| `npm run audit:flows5` | 51/51 HR checks pass |
| `npm run audit:contrast` | 48/48 token pairings pass |
| `npm run test` | 164/164 tests pass (12 money, 26 finance) |
| `npm run verify` | Type check, lint, contrast, tests and a 47-route production build pass |

The flow gate runs three viewers — Finance with the financial permission, Finance without it, and Management — because the interesting assertions in this phase are all about what the *second* and *third* viewers cannot see.

`tsconfig.json` moved from `ES2017` to `ES2020` for `bigint` literals, which the exact money arithmetic needs.
