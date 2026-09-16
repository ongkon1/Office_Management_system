# Modify Phase F2 Verification

## Outcome

Phase F2 replaces the previous task list presentation with one shared,
role-scoped workflow experience for Employees and Team Leads. Tasks are shown
in the three stored states - Pending, In Progress, and Completed - while All,
Overdue, and Upcoming remain derived filters.

Every status change uses the same confirmation panel and transition service.
Dragging is available on larger screens, but every move also has a visible
button and keyboard path. A transition records workflow history only; active
minutes continue to come exclusively from a separate work log.

## Task Evidence

| Task | Evidence |
|---|---|
| `MFE-0201` | `src/features/tasks/task-workflow.tsx` provides the shared three-column board. Cards show status, task title, project, division, estimate, actual, due date, assignee, overdue/variance flags, and the latest transition note. |
| `MFE-0202` | Native card drag/drop and visible Start, Complete, Reopen, and Team Lead-only Complete directly buttons all open the same confirmation panel. `src/features/tasks/task-workflow.test.tsx` covers drag and Enter-key activation. |
| `MFE-0210` | The desktop board uses `md:grid`; below 768 px the same scoped records render as status-grouped lists with the same shared card actions. Shared buttons retain their 44 px effective target, while `min-w-0`, wrapping, and contained filter overflow prevent page-level horizontal scrolling. |
| `MFE-0209` | Employee pages load only assigned/supporting tasks through `mockTaskService.listForEmployee`; employee task detail returns the same not-found result for out-of-scope and nonexistent ids. Team Lead board/detail data comes from the team-scoped service. Counts are calculated only after the authorized task list reaches the board. |
| `MFE-0203` | Start has an optional note and a success state that states no active time was created, then offers **Log today's work** separately when the viewer is eligible. Eligibility is evaluated for the resulting In Progress state. |
| `MFE-0204` | Complete shows estimate, actual, signed variance, optional outcome note, and a separate **Log final work first** link before transition submission. |
| `MFE-0205` | Reopen requires a reason. The transition adapter preserves or reconstructs the original completion event before appending the reopen event and returning the task to In Progress. |
| `MFE-0206` | `TaskHistoryTimeline` renders transitions, duration work logs, and read-only historical clock entries in chronological order. Transitions include actor, role, timestamp, and note; work records retain their own dates and details. |
| `MFE-0207` | Positive estimate variance is shown as an over-estimate warning on cards and in Complete, but actual time is never capped and the completion note remains optional. |
| `MFE-0208` | The confirmation panel prevents concurrent submission, uses one stable idempotency key per attempt, renders stale-state conflicts with a Reload board action, and explains that a verified period blocks the separate work log but not a status transition. Service tests cover idempotent replay and stale moves; component tests cover stale and locked states. |

## Boundary and Accessibility Checks

- Board filters and column counts operate only on the already-authorized task
  array supplied by the service.
- Pending employee-raised work that still needs review cannot be started.
- Pending to Completed is exposed only to a Team Lead and requires a note.
- Start, Complete, and Reopen can be opened with keyboard activation; drag is
  an enhancement, never the only interaction.
- The mobile and desktop layouts share the same task-card action component, so
  their allowed moves cannot drift.
- Status is always shown with an icon/shape and text, never colour alone.
- Starting or completing a task is tested against the employee-day summary and
  changes neither active time, recognized break, nor daily total.
- A completed fixture with no task-based transition history receives a
  preserved historical completion event before its reopen event is appended.
- Historical clock rows remain visible in task history and retain their
  original range label; they are not converted into transition time.

## Verification Results

Run on 15 September 2026:

| Gate | Result |
|---|---|
| Next.js route type generation | Pass |
| TypeScript (`tsc --noEmit`) | Pass, zero errors |
| ESLint | Pass, zero errors and zero warnings |
| Focused F2 workflow suite | 20/20 tests passed after adding drag, keyboard, locked-period, stale-state, retry, and history coverage |
| Full frontend/shared suite | 446/446 tests passed across 26 files |
| WCAG contrast audit | 48/48 checks passed |
| Next.js production build | Pass, 60 routes generated |

The interactive browser connection was unavailable during this phase, so no
manual visual-browser result is claimed here. Responsive structure is covered
by component assertions and the existing task routes remain registered in the
responsive, accessibility, and content-stress scripts. The dedicated
cross-browser `audit:task-work` gate is intentionally delivered in Phase F4 as
`MFE-0409` and remains pending.
