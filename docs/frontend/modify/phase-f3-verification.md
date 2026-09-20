# Modify Phase F3 Verification

## Outcome

Phase F3 completes the frontend change from clock-based capture to explicit,
duration-only work logging. Employees record `H:MM` against eligible In
Progress tasks, daily views present task rows rather than time-of-day ranges,
and the dashboard and application shell expose no timer state or timer action.

Historical clock entries remain visible and read-only with their original
ranges. Verified periods continue to block create, edit and delete operations;
the service returns a structured locked-period conflict that identifies the
period and confirms that the audited amendment path is available.

## Task Evidence

| Task | Evidence |
|---|---|
| `MFE-0301` | `src/features/timesheet/work-log-drawer.tsx` provides the duration-only Log Work form and saves through `TimesheetService.createWorkLog`. |
| `MFE-0302` | Division, project and task options are constrained by effective assignment, active project and the shared eligible-task predicate; direct-id validation enforces the same boundary. |
| `MFE-0303` | The drawer uses the shared calculation preview for active, break, total, remaining and classification, including progressive overtime and critical reasons. |
| `MFE-0307` | Copy previous returns an unsaved duration-only draft, clears day-specific evidence and revalidates on save. |
| `MFE-0308` | Edit requires a correction reason, uses optimistic versioning and records immutable before/after revisions; delete uses the work-log operation. |
| `MFE-0304` | `src/features/timesheet/day-view.tsx` renders task, division, duration, location, description and completed work with no time-of-day column. |
| `MFE-0309` | Historical clock rows are labelled “Recorded before task-based logging,” retain their original range and expose no mutation menu. |
| `MFE-0310` | `src/lib/timesheet-period.ts` supplies one reconciled read model for week/list and month/calendar totals and filters; reconciliation tests cover fixed datasets. |
| `MFE-0311` | Locked days expose no Log Work or row-mutation action, including through a task deep link. Create, edit and delete return `PERIOD_LOCKED` with the verified period identity and `amendmentPathAvailable: true`; the existing HR amendment workflow retains reason and before/after history. |
| `MFE-0305` | The start/end drawer mode, timer panel, timer hook, browser recovery and mock timer state are absent from the frontend capture path. |
| `MFE-0306` | `AppShellView` and `EmployeeDashboardView` no longer carry a running timer. The top-bar timer pill and mobile timer action were removed; the dashboard displays the authoritative active total and provides **Log work**. |

## Locked-Period Checks

- The day view uses the calculation summary's `isLocked` state and removes
  create, copy, edit and delete controls before rendering them.
- A task query parameter cannot force the Log Work drawer open on a locked
  date.
- `createWorkLog`, `updateWorkLog` and `deleteWorkLog` all return the same
  `PERIOD_LOCKED` result shape with corrective amendment guidance.
- The result includes the locked period id, label, verification instant and an
  explicit amendment-path flag.
- HR's existing authorized amendment path remains separately permissioned,
  requires a reason and preserves before/after values.

## Removal Check

A source scan of frontend components, features, app screens, frontend view
models and the dashboard service finds no running-timer view, timer pill,
timer floating action, **Start timer**, **Stop timer**, or **Timer running** UI.
The only matching frontend text is a negative assertion that prevents those
labels from returning. Backend compatibility endpoints remain owned by Modify
Phases B1-B2 and were not changed in this frontend phase.

## Verification Results

Run on 19 September 2026:

| Gate | Result |
|---|---|
| Next.js route type generation | Pass |
| TypeScript (`tsc --noEmit`) | Pass, zero errors |
| ESLint | Pass, zero errors and zero warnings |
| Focused work-log, day-view and HR amendment tests | 44/44 passed |
| Full frontend/shared suite | 579/579 passed across 35 files |
| WCAG contrast audit | 48/48 checks passed |
| Phase 3 browser flows | Pass, including duration preview, daily cap, verified-period lock, task separation and dashboard Log Work behavior |
| Full responsive and rendered-contrast audit | 316/316 route/width combinations passed at 375, 768, 1024 and 1440 px; 22,162 rendered elements checked |
| Next.js production build | Pass, 62 routes generated |
