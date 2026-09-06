# Phase 4 — Team Lead Experience Verification

Phase 4 replaces the Team Lead placeholders with scoped, responsive mock-backed workflows. UI modules consume `TeamLeadService`; only the mock adapter imports fixtures or mutable mock storage.

## Deliverable Map

| Tasks | Routes / implementation | Evidence |
|---|---|---|
| `FE-0401`–`FE-0403` | `/dashboard`, `team-overview.tsx` | Headcount, attendance states, exceptions, division hours, projects, tasks, requests, workload, recent entries, evaluation progress |
| `FE-0404`–`FE-0406` | `/team`, `/team/timesheets`, `/team/timesheets/[employeeId]/[date]` | Responsive table/cards, saved filters, safe selection, calculation breakdown, entries, attachments, anomalies, remarks, history |
| `FE-0410`–`FE-0413` | Team timesheet detail | One general remark composer, correction confirmation, notification preview, four states, clarification and before/after corrected values |
| `FE-0420`–`FE-0422` | `/projects`, `/projects/[id]` | Scoped list/cards, protected budget state, create/edit form, overview/team/tasks/time/files/activity tabs |
| `FE-0423`–`FE-0425` | `/tasks`, `/tasks/[id]` | Pending/In Progress/Completed board and list, create/edit form, checklist/files, actual-time history, overdue and status feedback |
| `FE-0430`–`FE-0431` | `/requests`, `/requests/[kind]/[id]` | WFH/leave state queues, detail, decision, general remark, confirmation, notification and audited override presentation |
| `FE-0432`–`FE-0433` | `/workload` | Capacity cards, warnings, deadlines, responsive calendar, division/project attribution and leave-adjusted capacity |
| `FE-0434` | `/evaluations`, `/evaluations/[id]` | Queue, supporting facts, six weighted areas, draft/submit feedback and submitted/published read-only states |

## Scope and Safety

- Every Team Lead screen labels the assigned employee/division/project scope.
- The mock service filters unauthorized employees and restricted government-project divisions before constructing counts or aggregates.
- Project budget is explicitly rendered `Restricted` without financial permission.
- Team timesheets support review, general remarks, and correction requests only. No daily timesheet approval or rejection action exists.
- Weighted evaluation scoring is calculated inside the service, not the component.
- Time totals continue to come from the authoritative calculation engine through `summaryFor` / `buildDayView`.

## Automated Evidence

| Gate | Result |
|---|---:|
| `npm run audit:flows4` | 20/20 Team Lead checks pass |
| `npm run audit:responsive` | 112/112 route × width combinations pass |
| Rendered contrast | 6,628 elements checked; 198 documented skips |
| Focused correction-detail responsive rerun | 4/4 widths; 272 rendered elements checked |
| `npm run audit:flows` | 16/16 authentication and access checks pass |
| `npm run audit:flows3` | 18/18 employee and calculation checks pass |
| `npm run test` | 105/105 tests pass |
| `npm run verify` | Type check, lint, contrast, tests, and 26-route production build pass |

The responsive gate covers 375, 768, 1024, and 1440 px. It found and drove the correction of a desktop overflow in the narrow correction-workflow sidebar before this phase was closed.
