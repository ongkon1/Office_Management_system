# Phase 7 — Shared Reporting and Supporting Modules Verification

Phase 7 is the widest phase in the milestone: nineteen tasks across reporting, notifications, search, employee self-service, collaboration prototypes and administration. It is also the phase that closes the placeholder registry — every navigation destination now resolves to a real screen, a feature-flag exclusion, or a prototype that says so on the page.

Three services carry it: `ReportingService`, `WorkspaceService` and `AdminService` (`src/contracts/reporting.ts`, `workspace.ts`, `admin.ts`).

## Deliverable Map

| Tasks | Routes / implementation | Evidence |
|---|---|---|
| `FE-0701` | `/reports`, `report-catalogue.tsx` | Eight categories; a report the viewer cannot run is absent, not disabled |
| `FE-0702` | `/reports/[key]`, `report-builder.tsx` | One builder driven by each report's filter definition: date range, employee, division, project, task, Team Lead, employment type, work location, overtime and status |
| `FE-0703` | `/reports/[key]` | Applied filters, timezone, policy version, generated timestamp, totals, table, and a chart where it adds something |
| `FE-0704` | Export dialog | Excel, CSV, PDF and Print, with queued, processing, ready, expired and failed states |
| `FE-0705` | `/reports/exports` | Requester, filters, format, timestamp, state, advance, retry, and download permission states |
| `FE-0706` | `globals.css` print block | Chrome removed; title, filters, headers and totals kept; header/footer row groups repeat; rows and figures avoid page breaks |
| `FE-0710` | `/notifications` | Role-aware groups with actionable items lifted to the top, unread handling, related-record links, permission-safe bodies |
| `FE-0711` | Command palette + `/search` | Palette in the top bar and a full results page across seven record types |
| `FE-0712` | `/search` | Type filters, locally stored recent searches, `aria-activedescendant` keyboard navigation, no-results guidance |
| `FE-0720` | `/wfh` (employee) | History, request form, and pending / information-requested / approved / rejected / cancelled presentation |
| `FE-0721` | `/leave` (employee) | Balances, history, request form, half-day choice, conflicts, decisions |
| `FE-0722` | `/evaluations` (employee) | Self-evaluation form, draft, submitted and published-result states, plus the automatic facts |
| `FE-0723` | `/documents` | Company/division/project grouping, search, scope filters, metadata, preview placeholder, download and denied states |
| `FE-0724` | `/messages` | Division, project, direct and task-comment threads, labelled a prototype with sending disabled |
| `FE-0730` | `/admin/divisions` | Create, edit, and deactivation blocked by pre-computed blockers |
| `FE-0731` | `/admin/users`, `/admin/roles` | Scope and sensitive permissions per account; every grant states its consequence and confirms before applying |
| `FE-0732` | `/settings`, `/admin/policies` | Work policy (read-only, versioned), notification delivery, and live feature flags |
| `FE-0733` | `/admin/audit` | Actor, action, resource, scope, date filters, before/after detail and redacted values |
| `FE-0734` | `/admin/integrations` | Ten categories, none presented as connected |

## Domain Rules Held

- **The catalogue cannot be used to enumerate.** A report the viewer may not run is absent from `listReports`, and `getReport`/`runReport` return `not_found` — never `permission_denied` — so the catalogue does not become a directory of what other roles can see.
- **Contains-protected differs from about-protected.** A payroll report is listed for any Finance viewer with its cost column present and its cells reading `Restricted`; a cost-rate report is not listed at all without `finance.cost.view`. `willRedactFields` tells the viewer which case they are in before they run it.
- **Search counts after filtering.** Results the viewer may not see are removed before `totalCount` is computed, so the count itself cannot betray a hidden record.
- **Notifications carry no restricted content.** Each names the record and links to it; the access check happens when it is opened (`REQ-NOT-004`). A recipient's notification is `not_found` to anyone else.
- **An audit event survives redaction.** Before/after values are `Redactable`; when withheld the event still shows actor, action, resource, time and reason. Hiding the event would make the log an unreliable account of what happened.
- **Deactivation is blocked before it is offered.** Division blockers are computed by the service and rendered with the switch disabled, rather than failing after the click.
- **A sensitive grant states its consequence.** "The holder can read every employee hourly rate…" rather than the permission key alone, and confirmation repeats it.
- **Nothing pretends to be connected or sent.** `IntegrationPlaceholderView.state` has only a `not_configured` variant — a placeholder cannot claim a live connection even by mistake. Messaging is labelled a prototype with a disabled composer. No export produces a file.

## Feature Flags Became Real

`DEMO_FEATURE_FLAGS` was a build constant read directly by the layout guard and the shell. Four Phase 7 modules — documents, messages, global search, integrations — default to **off**, so building them without a way to switch them on would have made them unreachable.

Flags now live in a runtime store (`src/features/settings/flag-store.ts`), read through `useSyncExternalStore` for the same reason the session store is. The settings screen switches a module on or off and the consequence is immediate: the navigation entry disappears and the route stops resolving. The flow gate asserts exactly that, in both directions.

This is also how `FE-0006` — that the MVP stands alone — becomes demonstrable rather than asserted: the **MVP only** preset turns every post-MVP module off in one action.

## Defects Found and Fixed During the Phase

| Defect | How it surfaced | Fix |
|---|---|---|
| A queued export vanished from the history: `page.goto` is a full page load, which resets the in-memory mock, so a state that depended on the viewer having just created a job was unreachable on a cold open | `audit:flows7` FE-0704 | Seeded a `queued` job so every state is demonstrable without a prior action |
| `print` revealed *every* `[hidden]` element, including dialog contents and collapsed panels the reader never opened | Writing the print block | Scoped the reveal to `.table-scroll[hidden]`, which is the chart's tabular equivalent |
| The Phase 5 flow gate asserted that an employee sees a planned-screen notice at `/wfh` | `audit:flows5` after `FE-0720` | Updated to assert the boundary that still matters — an employee sees their own self-service, not the HR administration view |

## Placeholder Registry Closed

`PLANNED_ROUTES` is now empty. Every entry it held has a real screen:

- Phase 4 built `/team`, `/projects`, `/workload`, `/requests`
- Phase 5 built `/employees`, `/hr/timesheets`, `/attendance`, `/admin/holidays`
- Phase 6 built the `/finance/*` set
- Phase 7 built `/reports`, `/notifications`, `/search`, `/documents`, `/messages`, `/settings`, `/admin/divisions`, `/admin/users`, `/admin/roles`, `/admin/policies`, `/admin/audit`, `/admin/integrations`, and the employee views of `/wfh`, `/leave` and `/evaluations`

The mechanism stays. `PlannedScreen` still renders an entry and `findPlannedRoute` still falls back to the closest registered ancestor, because it is the right answer whenever navigation runs ahead of a screen again — which it will in the backend milestone.

## Automated Evidence

| Gate | Result |
|---|---:|
| `npm run audit:flows7` | 55/55 shared-reporting and supporting-module checks pass |
| `npm run audit:responsive` | 268/268 route × width combinations pass, including 17 new Phase 7 routes |
| Rendered contrast | 22,686 elements checked; 538 documented skips |
| `npm run audit:flows` | 16/16 authentication and access checks pass |
| `npm run audit:flows3` | 18/18 employee and calculation checks pass |
| `npm run audit:flows4` | 20/20 Team Lead checks pass |
| `npm run audit:flows5` | 51/51 HR checks pass |
| `npm run audit:flows6` | 40/40 Finance and Management checks pass |
| `npm run audit:contrast` | 48/48 token pairings pass |
| `npm run test` | 213/213 tests pass (49 new in `workspace.test.ts`) |
| `npm run verify` | Type check, lint, contrast, tests and a 61-route production build pass |

The print check is worth noting: it runs under `page.emulateMedia({ media: 'print' })` and asserts computed styles — chrome hidden, `thead` as `table-header-group`, `tfoot` as `table-footer-group`, rows `break-inside: avoid`, title still visible. Print behaviour is otherwise invisible to every other gate.
