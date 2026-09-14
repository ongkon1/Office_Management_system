# Modify Phase F1 Verification

## Outcome

Phase F1 establishes the duration-only frontend boundary for task-based work
logging. New work logs contain integer minutes and task attribution, task
transitions contain workflow history, and only work logs can contribute active
minutes.

The existing clock/timer implementation remains temporarily available only
through explicitly labelled legacy compatibility types and concrete adapters so
the already-built screens continue to compile until their planned replacement
in Phase F3 and the backend cutover in Phase B2. It is not part of the public
`TimesheetService` contract introduced by this phase.

## Task Evidence

| Task | Evidence |
|---|---|
| `MFE-0101` | `src/contracts/work-log.ts` defines `WorkLogInput`, `WorkLog`, and `WorkLogView` with duration-only capture and no start, end, or timer field. |
| `MFE-0102` | `src/contracts/task-transition.ts` defines append-only transition/history contracts in a module not imported by `src/lib/calculation/engine.ts`. |
| `MFE-0103` | `TASK_TRANSITION_RULES`, `transitionRule`, `canTransition`, and `transitionRequiresNote` are the shared transition policy; `src/contracts/task-transition.test.ts` covers every allowed and refused move. |
| `MFE-0109` | `src/contracts/services.ts` exposes work-log CRUD, preview, copy, transition, and history operations on `TimesheetService`; timer and clock-entry operations are absent from that interface. `src/services/mock/timesheet.ts` supplies the F1 adapter. |
| `MFE-0104` | `taskAcceptsTime` in `src/contracts/domain.ts` requires both an approved/not-required review state and `in_progress` status. It is used by organization selection and both frontend and server validation. |
| `MFE-0105` | `validateWorkLog` in `src/lib/calculation/validation.ts` validates integer duration, the 24-hour daily cap, retry key, assignment/availability, project/task eligibility, leave/holiday conflicts, and overtime/critical reasons. Every failure is a field/message/guidance tuple. |
| `MFE-0106` | `src/lib/calculation/engine.ts` accepts duration-only work logs and historical entries through separate inputs. `src/lib/calculation/work-log-engine.test.ts` covers `AC-CALC-001`–`004`, `006`, and `007`. |
| `MFE-0107` | `HistoricalClockEntry` preserves clock fields for read-only history; the engine accepts historical rows without exposing clock fields on new work-log input. `src/services/mock/work-log.test.ts` proves historical ranges still render and new duration rows render without a range. |
| `MFE-0108` | `TaskSummaryView` and `TaskHistoryView` carry derived actual time, signed variance, and dated daily actuals. `src/services/mock/work.ts` derives them from saved rows and formats variance with `formatDurationDelta`; the service test reconciles the daily split to the task total. |

## Important Boundary Checks

- `WorkLogInput` contains no start time, end time, entry method, or timer
  reference.
- `TaskStatusTransition` contains a timestamp for history, but the calculation
  engine has no dependency on the transition module.
- Moving a task changes only workflow state. A service test confirms the
  employee-day active total is unchanged by a transition.
- Pending, Completed, unapproved, unassigned, and unavailable tasks are refused
  even when their ids are submitted directly.
- New duration records are deduplicated by idempotency key and are not subjected
  to clock-range overlap checks.
- Historical clock rows retain their original range labels and continue to
  contribute their recorded integer minutes.

## Verification Results

Run on 14 September 2026:

| Gate | Result |
|---|---|
| Next.js route type generation | Pass |
| TypeScript (`tsc --noEmit`) | Pass, zero errors |
| ESLint | Pass, zero errors and zero warnings |
| Focused F1 suite | 26/26 tests passed |
| Full frontend/shared suite | 435/435 tests passed across 25 files |
| Existing backend unit safety regression | 84/84 tests passed across 14 files |
| WCAG contrast audit | 48/48 checks passed |
| Next.js production build | Pass, 60 routes generated |

The production build required network access for the existing Google-hosted DM
Sans font. No font or design behavior was changed in this phase.
