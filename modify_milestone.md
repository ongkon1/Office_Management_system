# Modify Milestone Plan

## Task-Based Daily Work Logging (replaces clock-based time entry)

| Field | Decision |
|---|---|
| Change | Replace start/end clock entry and the timer with task status transitions plus daily work logs |
| Source proposal | "Recommended Task-Based Timesheet Model", supplied 14 September 2026 |
| Affects | `frontend_milestone.md` Phases 3 and 8, and `backend_milestone.md` Phase 4 — **all already implemented** |
| Requirements source | `project_requirement.md` Version 1.2 — task-based amendment approved in Phase 0 on 14 September 2026 |
| Delivery order | Phase 0 decision gate → Frontend Phases F1–F4 → Backend Phases B1–B4 → cutover |
| Task identifiers | `MOD-*` shared gate · `MFE-*` frontend · `MBE-*` backend · `MOD-AC-*` acceptance scenarios |
| Unchanged | 7 active + 1 break = 8; one daily break; classification thresholds; no daily approval; deny by default; integer minutes |

## 1. Task Status Convention

Use exactly one status marker on every tracked task:

- `[ ]` Pending - work has not started.
- `[~]` In progress - work is actively being implemented or reviewed.
- `[x]` Done - work is implemented, checked, and satisfies its acceptance criteria.

Status rules:

- A task must have only one marker.
- Change `[ ]` to `[~]` when work starts, and `[~]` to `[x]` only after the applicable Definition of Done (§6) is met.
- Return a completed task to `[~]` if a material regression or requirement change reopens it.
- Phase progress is calculated from numbered `MOD-*`, `MFE-*` and `MBE-*` tasks. Exit criteria and acceptance scenarios are gates and are not counted.
- A phase is complete only when every task and exit criterion in it is done.
- **No build phase (F1–F4, B1–B4) may start until Phase 0 is complete. Phase 0 was completed on 14 September 2026.**

## 2. What Changes and What Does Not

### 2.1 The model

| Concept | Represents | Feeds the calculation engine? |
|---|---|---|
| Task status transition | Workflow state — Pending, In Progress, Completed | **No.** A transition never creates, changes or proves minutes. |
| Daily work log | Actual work: employee, local date, division, project, task, integer minutes, location, description | **Yes.** The only source of new active time. |
| Transition timestamp (`started_at`, `completed_at`) | Workflow history for reporting | **No.** Must be unreachable from the engine by type and module boundary. |
| Historical clock entry | A record made before cutover, with its original start and end | Yes, exactly as it was recorded, so verified periods reproduce. |

A task's **actual time** is always the sum of its work logs — never a stored, overwriteable total. `REQ-WORK-002` and `REQ-WORK-007` already require this, so the direction is consistent with them.

### 2.2 Business rules that must not change

- 7 active hours plus 1 separate break hour make a complete 8-hour day; both thresholds apply.
- The recognized break is one daily value, never added per task or per log.
- Missing / Under-time / Complete / Overtime (above 8:00 through exactly 12:00, reason required) / Critical (above 12:00, explanation required, Team Lead and HR notified).
- Active time aggregates across divisions for the local day while preserving division, project and task attribution.
- There is no daily Team Lead approval. Work logs never gain an approve button, an awaiting-approval state or approval wording.
- Deny by default; authorization before aggregation; unauthorized ids return the same not-found response as nonexistent ones.
- Durations are integer minutes, entered as `H:MM`, never decimal hours.

### 2.3 What the product will no longer be able to do

Removing clock ranges means the system records **how much** work was reported, not **when** it happened. On 14 September 2026 the business accepted the following capability changes for this milestone:

- Clock-range overlap detection (`REQ-TIME-020`, `AC-CALC-005`).
- Exact attendance intervals and proof of when a person started or stopped.
- Break-timing verification.
- Real-time timer tracking and timer recovery.

`REQ-ATT-007` survives unchanged: attendance is derived from approved leave and WFH, holidays, schedule, work location and valid timesheets, none of which need a clock. If exact attendance compliance is still required, it becomes a **separate** future capability (presence confirmation, office access, calendar evidence) — task start/end times must not be reintroduced to provide it.

### 2.4 Rules this change must hold

- **A status change never logs time.** Moving a card to In Progress or Completed writes a transition only. "Log today's work" is always a separate, explicit action.
- **One predicate decides whether a task may receive work.** `taskAcceptsTime` in `src/contracts/domain.ts` already enforces employee-raised task review; it is extended to cover task status. A second, parallel check is how the dropdown and the server drift apart.
- **History is preserved, not rewritten.** No migration changes the minutes, ranges or verified snapshots of a record made before cutover.
- **Superseded work in the other milestone files is annotated, not unmarked or deleted.** Those tasks were genuinely delivered; they are now retired by this plan.

## 3. Impact Inventory

Measured against the repository on 14 September 2026.

### 3.1 Already-built work this supersedes

| Area | Task ids | Where it lives |
|---|---|---|
| Manual start/end entry | `FE-0320` (clock half), `BE-0420` (clock half) | `src/features/timesheet/entry-drawer.tsx`, `src/server/time/application.ts` |
| Range and overlap validation | `FE-0324` (range and overlap half), `BE-0425` (range and overlap half) | `src/lib/calculation/validation.ts` (`OVERLAPPING_ENTRY`), `src/server/time/validation.ts` |
| Timer start, running state, stop-to-draft, recovery | `FE-0328`–`FE-0330`, `BE-0422`, `BE-0423` | `timer-panel.tsx`, `use-timer.ts`, timer state and `localStorage` recovery in `src/services/mock/store.ts`; `startTimer`, `stopTimer`, `cancelTimer`, `runningTimer` in `src/server/time/application.ts` |
| Running-timer indicator and quick action | `FE-0123`, `FE-0302` | `src/components/shell/app-shell.tsx`, `src/features/dashboard/employee-dashboard.tsx` |
| Timer reachability on small screens | `FE-0805` | `scripts/stress-audit.mjs` |
| Copy previous entry | `FE-0327`, `BE-0421` | Retargeted to work logs, subject to decision D8 |
| Cross-midnight clock attribution | `BE-0410` | `src/lib/calculation/instants.ts`; retained for historical rows only |
| HTTP timer view | — | `src/app/api/time/route.ts` (`view=timer`) |
| Schema | Backend Phase 1 | `time_entries.start_at_utc`, `end_at_utc`, `entry_method`; table `timer_sessions` with the `uq_one_running_timer` invariant |
| Browser gates | — | `scripts/phase3-flows.mjs` (21 timer, clock or overlap references), `scripts/stress-audit.mjs` (timer at 375 px), `scripts/phase5-flows.mjs` (1) |
| Demo dataset | — | Clock-based entry specs and Nadia's running timer in `src/fixtures/index.ts`; the "Overlap rejection" and "Running timer" scenarios in `docs/frontend/phase-0/demo-setup.md` |

### 3.2 Requirements that must be amended

| Requirement | Says today | Must become |
|---|---|---|
| `REQ-TIME-004` | Entry stores an entry method | Work log stores task, duration and source; entry method retired for new records |
| `REQ-TIME-005` | Clock entries store start and end | Historical only |
| `REQ-TIME-006` | Manual start/end, duration, timer, copy | Log work by duration; copy per D8; no timer |
| `REQ-TIME-008`, `REQ-TIME-009` | One running timer; stop creates a draft | Retired |
| `REQ-TIME-020` | Detect overlapping entries across divisions | Retired for new records |
| `REQ-TIME-021` | Reject duplicates and end ≤ start | Reject duplicate submissions by idempotency; range rule historical only |
| `REQ-RMK-007` | Team Leads review overlapping records | Overlap category removed |
| `REQ-DASH-001`, `REQ-DASH-003` | Dashboard shows active timer; "start a timer" action | Today's active total; "Log work" action |
| `REQ-RBAC-011` | Employees operate their timers | Employees log work and move their tasks |
| `REQ-NFR-PERF-004` | Timer capture stays consistent after retry | Work-log and transition saves stay consistent after retry |
| `REQ-NFR-UX-002` | Mobile users operate timers | Mobile users log work and move tasks |
| `AC-CALC-005` | Overlap across divisions is rejected | Retired; replaced by `MOD-AC-07` |
| `AC-QUAL-002` | Accessibility testing covers timer | Covers task board and Log Work |
| §2.2, §9 | MVP includes "timer operation" / "timesheets and timers" | Task-based work logging |
| §6.1 steps 2 and 4 | Select entry method; validate overlap | Select task; validate task availability and daily cap |
| §7.1 | `TimerSession` entity | Retired; add `TaskStatusTransition` |
| §10 risks | "Timer/network retries" | "Work-log and transition retries" |

New requirements are also needed, because `REQ-WORK-004` only lists the three statuses: allowed transitions and who may make them, append-only transition history with notes, reopen with a required reason, the work-log model, estimate-versus-actual variance handling, and the rule that a completed task receives no work until reopened.

### 3.3 Existing gaps this change depends on

- **Closed in F1 — completed-task guard.** `taskAcceptsTime` now requires In Progress status and the work-log validator enforces it even when a task id is submitted directly. Backend endpoint enforcement remains `MBE-0204`.
- **Closed in F1 — assignment/availability guard.** Work-log validation now requires the employee to be the assignee, a supporting member, or explicitly included in the available-task set. Backend endpoint enforcement remains `MBE-0204`.

## 4. Milestone Overview

| Phase | Name | Demonstrable outcome |
|---|---|---|
| 0 | Decision and requirements gate | The business has accepted the lost capabilities, the requirements are amended and signed off, and decisions D1–D11 are recorded. |
| F1 | Frontend contracts, calculation and validation | Work-log and transition contracts exist with no clock or timer field; the engine aggregates logs; every existing calculation acceptance scenario still passes. |
| F2 | Frontend task board and status transitions | Tasks move through Pending, In Progress and Completed with notes, history and reopen, fully operable without dragging. |
| F3 | Frontend Log Work and timesheet rework | Employees log work by duration; the timesheet shows task rows; the timer and start/end entry are gone. |
| F4 | Frontend downstream surfaces, demo data and gates | Reports, reviews and exports agree; the demo dataset and every gate reflect the task-based model. |
| B1 | Backend schema and data migration | New records cannot carry clock times; historical and verified data is byte-for-byte reproducible. |
| B2 | Backend work-log use cases, validation and calculation | The server records, validates and aggregates work logs idempotently; timer operations are retired. |
| B3 | Backend task transitions, history and notifications | Transitions are enforced, append-only, concurrency-safe, audited and notified. |
| B4 | Backend downstream, cutover and verification | Every consumer reads one query path; the frontend runs on real services; production smoke passes. |

## 5. Detailed Phase Tasks

## Phase 0 - Decision and Requirements Gate

This phase is shared. Neither milestone may start building until it is complete.

### Business Decision

- [x] `MOD-0001` Obtain a written product-owner decision to stop recording clock times and timers for all new records, explicitly accepting each capability lost in §2.3. **Approved through the project-owner instruction on 14 September 2026.**
- [x] `MOD-0002` Confirm with HR whether exact attendance intervals are a compliance obligation. If they are, record a separate attendance capability and its owner before cutover, rather than retaining clock entry to satisfy it. **Decision for this milestone: exact attendance intervals are not required; any later compliance need becomes a separately approved attendance capability.**
- [x] `MOD-0003` Record decisions D1–D11 (§8) with owner, date and chosen option. **All choices were approved for milestone delivery on 14 September 2026 and are recorded in §8.**
- [x] `MOD-0004` Define the cutover date and the rule for records on either side of it: before is historical and read-only in its original form, after is task-based only. Include what happens to timers running and drafts open at cutover (D11). **The audited production deployment instant after B4 approval is the cutover boundary; its UTC value must be persisted as release metadata during deployment.**

### Requirements and Documentation

- [x] `MOD-0005` Amend `project_requirement.md` per §3.2, add the new requirements listed there with `REQ-*` ids, and obtain business sign-off. **`project_requirement.md` Version 1.2 was approved on 14 September 2026.**
- [x] `MOD-0006` Update `docs/frontend/phase-0/terminology-and-formats.md`: "Log work", "work log", transition labels, "Reopen", variance format `+1:15` / `-0:30`, and confirmation that no approval wording applies to work logs. **Evidence: `docs/frontend/phase-0/terminology-and-formats.md` §§1, 4, and 7.**
- [x] `MOD-0007` Update `docs/frontend/phase-0/information-architecture.md`: the employee time flow, the task flow, and Team Lead exception review without the overlap category. **Evidence: `docs/frontend/phase-0/information-architecture.md` §§2.1–2.4, 2.7, 3.5, and 4.**
- [x] `MOD-0008` Annotate every task listed in §3.1 in `frontend_milestone.md` and `backend_milestone.md` as superseded by this plan, leaving its `[x]` marker and evidence intact. **Evidence: inline annotations on the listed `FE-*` and `BE-*` tasks; their original completion markers remain unchanged.**

### Phase 0 Working Record

| Item | Recorded position | Status |
|---|---|---|
| Product direction | Stop collecting start/end clock ranges and remove timers for all new records. Use explicit task work-log durations instead. | Approved 14 September 2026 |
| Historical records | Preserve every pre-cutover clock entry and verified result in its original form; display historical rows read-only. | Approved |
| Post-cutover records | Accept duration-only work logs against eligible In Progress tasks. Status transitions never create minutes. | Approved |
| Cutover point | The audited production deployment instant after B4 verification is the cutover boundary. Persist the exact UTC instant as release metadata and use record creation time, not work date, to distinguish legacy and new capture. | Approved; UTC value assigned at deployment |
| Running timers at cutover | Stop to an audited draft for employee review; do not count the draft until saved. | Approved |
| Existing timer drafts | Preserve as reviewable drafts, convert to duration only when the employee saves, and retain source provenance. | Approved |
| Attendance intervals | Work logs provide duration and location, not exact presence intervals. Exact intervals are outside this milestone; any later requirement needs a separate approved capability. | Approved |
| Requirements | `project_requirement.md` Version 1.2 contains the approved task-based amendment. | Approved 14 September 2026 |

### Phase 0 Exit Criteria

- [x] The requirement amendment is signed off and every §3.2 row is resolved.
- [x] Decisions D1–D11 are recorded with owners.
- [x] The attendance-compliance position is recorded: exact intervals are outside this milestone and require a separate future capability if later mandated.
- [x] The cutover boundary and in-flight handling are agreed; the exact UTC deployment value is operational release metadata assigned after B4 approval.

## Phase F1 - Frontend Contracts, Calculation and Validation

### Contracts

- [x] `MFE-0101` Define `WorkLogInput`, `WorkLog` and `WorkLogView` in `src/contracts`: local date, division, project, task, integer minutes, work location, description, completed work, optional link or attachment, source (`manual`, `migrated_clock_entry`, `imported`) and idempotency key. The types carry **no** start or end field. **Evidence: `src/contracts/work-log.ts`.**
- [x] `MFE-0102` Define `TaskStatusTransition` (task, from, to, actor, changed-at, optional note, idempotency key) and `TaskHistoryView` as append-only, in a module the calculation engine does not import, so a transition timestamp cannot reach a duration calculation. **Evidence: `src/contracts/task-transition.ts`; boundary recorded in `docs/frontend/modify/phase-f1-verification.md`.**
- [x] `MFE-0103` Define the allowed transition map as data — Pending → In Progress, In Progress → Completed, Completed → In Progress with a required reason, Pending → Completed only as decided in D5 — and a single `canTransition` predicate used by every screen and service. **Evidence: `TASK_TRANSITION_RULES` and 6 transition-policy tests.**
- [x] `MFE-0109` Replace the timer operations on `TimesheetService` in `src/contracts/services.ts` with work-log and transition operations, keeping `Result<T>` shapes, field-level guidance and the locked-period conflict response. **Evidence: `src/contracts/services.ts` and `src/services/mock/timesheet.ts`; legacy compatibility stays outside the public interface until F3/B2.**

### Rules and Calculation

- [x] `MFE-0104` Extend `taskAcceptsTime` to cover task status as decided in D3 and D4, and enforce it in `validation.ts` — closing the §3.3 gap where a completed task submitted directly is accepted. **Evidence: `src/contracts/domain.ts`, both validation paths, and the direct-id test.**
- [x] `MFE-0105` Replace the clock rules for new records in `validation.ts`: remove `OVERLAPPING_ENTRY` and the range rules; add positive integer duration, the daily cap from D7, duplicate-submission protection by idempotency key, and assignment or availability checks. Every error carries a field, a message and corrective guidance (`REQ-TIME-025`). **Evidence: `validateWorkLog` and 8 validation tests.**
- [x] `MFE-0106` Feed work-log minutes to `src/lib/calculation/engine.ts` and prove with engine tests that `AC-CALC-001`–`004`, `006` and `007` still hold with identical results. **Evidence: `src/lib/calculation/work-log-engine.test.ts`.**
- [x] `MFE-0107` Keep historical clock entries valid and renderable exactly as recorded, including cross-midnight attribution from `instants.ts`, while no new record can be created with a clock range. **Evidence: `HistoricalClockEntry`, mixed-input engine test, historical-render service test, and the unchanged instant-attribution path.**
- [x] `MFE-0108` Add actual, variance and a dated daily breakdown to the task view models, derived from work logs and formatted through `formatDurationDelta`, never stored as a total. **Evidence: `src/contracts/view-models.ts`, `src/services/mock/work.ts`, and reconciliation coverage in `src/services/mock/work-log.test.ts`.**

### Phase F1 Exit Criteria

- [x] No public F1 contract allows a new record to carry a start time, end time or timer reference; deprecated compatibility types remain isolated for the planned F3/B2 cutover.
- [x] Every applicable existing calculation acceptance scenario passes unchanged (`AC-CALC-001`–`004`, `006`, `007`).
- [x] A test proves a completed task, submitted directly by id, is refused with `TASK_COMPLETED`.

## Phase F2 - Frontend Task Board and Status Transitions

### Board

- [x] `MFE-0201` Build the three-column board — Pending, In Progress, Completed — with cards showing title, project and division, estimate, actual, due date, assignee, overdue state and latest transition note. **Evidence: shared `TaskWorkflowBoard` and task-card read model in `src/features/tasks/task-workflow.tsx`.**
- [x] `MFE-0202` Support drag-and-drop with a button and keyboard alternative on every card (Start, Complete, Reopen), so dragging is never the only way to move a task (WCAG 2.2 2.5.7). **Evidence: native drag/drop plus shared visible action buttons; drag and Enter-key tests in `task-workflow.test.tsx`.**
- [x] `MFE-0210` Collapse the board to a status-grouped list below 768 px, with the same actions available, no horizontal page scroll, and 24 px minimum targets. **Evidence: paired `md:grid` desktop and `md:hidden` grouped-list layouts reuse the same card actions and shared button targets.**
- [x] `MFE-0209` Scope the board: an employee sees tasks assigned or available to them; a Team Lead sees their team's; nothing reveals a task outside the viewer's scope through counts or empty columns. **Evidence: scoped employee/team services feed the board; employee detail now applies the same not-found scope rule; counts are derived only from returned tasks.**

### Transitions

- [x] `MFE-0203` Build the Start confirmation panel — task, new status, optional note — which records the transition and then offers "Log today's work" as a separate action, never logging time itself. **Evidence: `TransitionPanel` start/success states and no-total regression test.**
- [x] `MFE-0204` Build the Complete panel: estimate, actual and variance, the option to log the final day's work before completing, and an optional completion note describing the outcome. **Evidence: completion summary and separate final-work link in `TransitionPanel`.**
- [x] `MFE-0205` Build Reopen: a required reason, the original completion event preserved, and the task returned to In Progress. **Evidence: field-level reopen validation, append-only preservation in the mock transition adapter, and history test.**
- [x] `MFE-0206` Build the task history timeline, interleaving every transition (actor, time, note) with work logs by date. **Evidence: `TaskHistoryTimeline`, expanded history contract, and chronological mock read model.**
- [x] `MFE-0207` Flag variance when actual exceeds estimate, never capping actual time, and request a reason only as decided in D6. **Evidence: over-estimate card badge and Complete callout retain the optional note.**
- [x] `MFE-0208` Handle concurrent transitions, a stale board, an idempotent retry of the same transition, and the effect of a locked period, each with an explicit state. **Evidence: disabled/loading submission, stable attempt key, conflict reload state, verified-period explanation, and focused service/component tests.**

### Phase F2 Exit Criteria

- [x] Every transition is reachable by keyboard alone.
- [x] Moving a task changes no active, break or daily total anywhere in the product.
- [x] Reopen preserves the original completion event in history.

## Phase F3 - Frontend Log Work and Timesheet Rework

### Log Work

- [x] `MFE-0301` Build the Log Work form: work date defaulting to today, duration as `H:MM`, division, project, work location, description, completed-work details, and optional link or attachment. **Evidence: `src/features/timesheet/work-log-drawer.tsx` saves through `createWorkLog`, opens from the day view and F2 task links, and is covered by `work-log-drawer.test.tsx`.**
- [x] `MFE-0302` Show the live calculation preview from the same engine: active, break, total, remaining, resulting status, and the overtime-reason and critical-explanation prompts. **Evidence: `src/features/timesheet/work-log-drawer.tsx` debounces `previewWorkLog`, displays only its engine-produced daily values and status, and progressively reveals both policy prompts; `work-log-drawer.test.tsx` covers the complete, overtime and critical projections.**
- [x] `MFE-0303` Allow multiple logs per task and date as decided in D2, with a visible daily total for that task on that date. **Evidence: `createWorkLog` retains separate records for distinct idempotency keys; `EntryCalculationPreview.taskDayActive` exposes the service-derived projected task/date total in `WorkLogDrawer`; `work-log.test.ts` verifies two append-only logs and their dated aggregate.**
- [x] `MFE-0307` Retarget copy-previous as decided in D8, so a copied work log is a clearly identified draft revalidated for its new date. **Evidence: `DayView` lists prior saved work logs through `listWorkLogs` and calls `copyWorkLog`; `WorkLogDrawer` labels the result as unsaved, generates a fresh idempotency key and routes saving through normal validation; copied outcome, evidence, day reasons and verification state are cleared. Covered by `day-view.test.tsx`, `work-log-drawer.test.tsx` and `work-log.test.ts`.**
- [x] `MFE-0308` Edit and correct a work log with history preserved, and point Team Lead correction requests at logs rather than clock entries. **Evidence: `WorkLogDrawer` now has an audited edit mode with a required reason, immutable revision history, retained attachments and an edit-safe calculation preview; `DayView` routes duration records and `?workLog=` deep links to that mode while preserving the legacy clock-entry path. Team Lead correction requests require and persist one eligible duration work-log id, exclude clock records, and generate a safe employee deep link. Covered by `work-log.test.ts`, `work-log-drawer.test.tsx`, and `team-lead.test.ts`; the complete verification passes with 489 tests and a 60-route production build.**

### Timesheet

- [x] `MFE-0304` Rework the day view into task rows — task, division, duration, location, description — with active total, recognized break, daily total, remaining and classification, and no time-of-day column. **Evidence: `DayView` now presents each work log as a task-first row with dedicated task, division, duration, location and description fields; desktop uses a six-column work layout while widths below `xl` use labeled stacked rows without page overflow. The engine-produced summary remains the only source for active, break, total, remaining and classification, and the recognized break stays one separate daily value. Historical ranges remain metadata inside their task row rather than becoming a time-of-day column. Covered by `day-view.test.tsx`; the changed route passes all four responsive widths, and complete verification passes with 490 tests and a 60-route production build.**
- [x] `MFE-0309` Render historical clock entries read-only with their original ranges, labelled as recorded before the change. **Evidence: `TimeEntryView.recordKind` explicitly distinguishes duration work logs from historical clock entries; both mock and backend frontend adapters force historical rows to `canEdit: false` and `canDelete: false`. `DayView` renders a text-and-icon “Recorded before task-based logging” label plus the preserved original range and a read-only explanation, with no mutation menu. `work-log.test.ts` and `day-view.test.tsx` prove the boundary and UI behaviour; the historical route passes all four responsive widths, and complete verification passes with 491 tests and a 60-route production build.**
- [x] `MFE-0310` Keep week, month, calendar and list views and the client and division filters producing identical totals for a fixed dataset before and after the change. **Evidence: Week and List now explicitly share the same seven-day source while Month and Calendar share the same month source. `src/lib/timesheet-period.ts` builds filtered rows, headline totals and client attribution as one read model, delegates all period arithmetic and status counts to the shared calculation engine, and filters divisions by authorized IDs rather than reverse-mapping display codes. Both mock and backend row adapters carry the exact engine facts required for reconciliation. `reconciliation.test.ts` proves unfiltered week/month totals reproduce their service totals and combined client/division filters keep visible rows, headline totals and client totals on the same fixed subset. Complete verification passes with 494 tests and a 60-route production build; `/timesheets` passes responsive checks at 375, 768, 1024 and 1440 px.**
- [x] `MFE-0311` Keep locked and verified period behaviour for work logs identical to today's, including the amendment path. **Evidence: locked day views expose no create, copy, edit or delete action, and a task deep link cannot force the Log Work drawer open. `createWorkLog`, `updateWorkLog` and `deleteWorkLog` return a structured `PERIOD_LOCKED` conflict containing the verified period identity and `amendmentPathAvailable: true`; the existing HR amendment path still requires a reason and preserves before/after history. Covered by `work-log.test.ts`, `day-view.test.tsx`, `hr.test.ts`, the Phase 3 browser lock check, and `docs/frontend/modify/phase-f3-verification.md`.**

### Removal

- [x] `MFE-0305` Remove the start/end mode from the entry drawer, `timer-panel.tsx`, `use-timer.ts`, and the running-timer state and `localStorage` recovery in `src/services/mock/store.ts`. **Evidence: the legacy `entry-drawer.tsx`, `timer-panel.tsx`, and `use-timer.ts` modules were removed; `DayView` now exposes only `WorkLogDrawer`; the mock store no longer imports, stores, reads, writes, or clears timer state or `localStorage`; mock timer compatibility operations were removed. `day-view.test.tsx` proves the day has no start/end or timer UI. Type-check, lint, 21 focused tests, all 572 frontend/shared tests, and the 62-page production build pass.**
- [x] `MFE-0306` Remove the top-bar timer indicator and the dashboard's active timer and "Start timer" action, replacing them with today's active total and a "Log work" action. **Evidence: `RunningTimerPill` and `TimerFab` were removed from `app-shell.tsx`; `AppShellView` and `EmployeeDashboardView` no longer expose running-timer state; shell hosts and the component showcase carry no timer fixture. The employee dashboard continues to render the engine-derived active total and now uses the semantic `log_work` quick action. A frontend source scan finds no timer UI outside a negative regression assertion, and the dashboard service test plus Phase 3 browser flow verify the replacement.**

### Phase F3 Exit Criteria

- [x] No screen, button or route offers a timer or a start or end time for a new record.
- [x] Historical clock entries still render as recorded.
- [x] Daily totals and classifications match the engine for every view.

## Phase F4 - Frontend Downstream Surfaces, Demo Data and Gates

### Downstream Screens

- [ ] `MFE-0401` Remove the overlap category from Team Lead exception review, keeping missing, under-time, overtime and critical, and add variance exceptions only if D6 requires them.
- [ ] `MFE-0402` Make HR timesheet oversight and period verification read work logs and historical entries identically.
- [ ] `MFE-0403` Show task rows and durations in timesheet reports and exports, with clock columns only on historical rows, and keep the reconciliation suite matching the engine.
- [ ] `MFE-0404` Derive workload and evaluation actuals from work logs.
- [ ] `MFE-0405` Add notifications for task started, completed, reopened, assigned or reassigned, work-log correction requested, significant variance, and overtime or critical totals, with no restricted field in any text.

### Demo Data and Documentation

- [ ] `MFE-0406` Rebuild the fixtures: replace clock-based entry specs and Nadia's running timer with work logs and transitions, and keep a few historical clock entries dated before cutover to exercise read-only history.
- [ ] `MFE-0407` Replace the "Overlap rejection" and "Running timer" scenarios in `demo-setup.md` with task-based ones: a three-task 7:00 day across three divisions, a completion showing +1:15 variance, a reopen, a refused log on a completed task, and the daily cap.
- [ ] `MFE-0411` Record evidence in `docs/frontend/modify/verification.md`.

### Gates

- [ ] `MFE-0408` Rewrite the timer, clock and overlap checks in `phase3-flows.mjs` and the timer-reachability check in `stress-audit.mjs` as task-board and Log Work checks, and update the reference in `phase5-flows.mjs`.
- [ ] `MFE-0409` Add an `audit:task-work` browser gate covering start → log → complete → reopen, a keyboard-only board, a transition that creates no minutes, a completed task refusing a log, and 7:00 across three divisions classifying as Complete.
- [ ] `MFE-0410` Add the board and Log Work screens to the responsive, accessibility and content-stress route lists and run the full gate set.

### Phase F4 Exit Criteria

- [ ] Reports, exports, reviews, workload and evaluations agree with the engine for the same dataset.
- [ ] No gate still depends on a timer, clock range or overlap rule.
- [ ] The full gate set passes with the new screens in its route lists.

## Phase B1 - Backend Schema and Data Migration

### Schema

- [x] `MBE-0101` Implement decision D1. Under the recommended option, add `source` and a unique `idempotency_key` to `time_entries`, and constrain new rows so `start_at_utc` and `end_at_utc` must be null for any source other than `migrated_clock_entry`. — Migration `0011`; verified in `docs/backend/modify/phase-b1-verification.md`.
- [x] `MBE-0102` Create `task_status_transitions` (task, from, to, actor, `changed_at_utc`, note, unique idempotency key), append-only, with no update or delete grant for the runtime database user. — Migration triggers plus the runtime grant hardener enforce append-only access.
- [x] `MBE-0103` Retire `timer_sessions` for writes — revoke runtime insert and update — while keeping every existing row for audit. — Runtime grant hardening is implemented and integration-tested; existing rows are retained.
- [x] `MBE-0108` Add indexes for task-based reads (`task_id, work_date`; `employee_id, work_date`) and stop relying on the clock columns of `ix_time_employee_date` for new rows. — Migration `0011` replaces the clock-oriented indexes.

### Migration

- [x] `MBE-0104` Migrate per D1. Under reuse, copy no rows: mark existing clock rows `source = migrated_clock_entry` without changing `active_minutes`, ranges or verified snapshots. Under a new table, create logs from valid durations, link each to its original, and leave the original untouched. — D1 reuse is implemented with retained fact fingerprints.
- [x] `MBE-0105` Handle in-flight state at cutover as decided in D11: timers still running and drafts produced by stopped timers. — Running timers become audited, uncounted review drafts; existing stopped drafts remain unchanged.
- [x] `MBE-0106` Prove reproducibility by comparing every verified period's totals and every daily summary before and after migration; any difference fails the migration. — Migration-level assertions cover every counted employee-day, verified/amended period, and legacy-row fingerprint.
- [x] `MBE-0107` Make the migration reversible and audited, with a recovery script that passes `npm run db:validate`. — Guarded recovery, migration audit events, and 11/11 migration validation are verified.
- [x] `MBE-0109` Rebuild development seeds on the task-based model while retaining historical clock rows. — Duration work logs, transition history, and a separate historical clock record seed idempotently.
- [~] `MBE-0110` Rehearse the migration on production-like data and obtain HR sign-off on the resulting totals. — Technical rehearsal and zero-drift reconciliation are complete; external HR sign-off is pending in `docs/backend/modify/phase-b1-verification.md`.

### Phase B1 Exit Criteria

- [x] The database rejects a new record carrying a clock range or a timer session for the runtime principal.
- [x] Verified-period totals and daily summaries are identical before and after migration.
- [~] The migration is reversible, audited and technically rehearsed; HR sign-off remains pending.

## Phase B2 - Backend Work-Log Use Cases, Validation and Calculation

**Completed 21 September 2026.** Task-by-task implementation mapping, HTTP v2 contract, and verification evidence: [Phase B2 verification](docs/backend/modify/phase-b2-verification.md). All 241 backend tests, 57 final focused time tests, 582 frontend/shared tests, TypeScript, lint, 11 migration/recovery checks and the production build pass. B1 HR sign-off remains pending; browser/production cutover remains B4.

### Use Cases

- [x] `MBE-0201` Implement work-log create, read, list, update, correction and permitted delete, replacing the clock-entry use cases in `src/server/time/application.ts`.
- [x] `MBE-0202` Retire `startTimer`, `stopTimer`, `cancelTimer` and `runningTimer`, and `view=timer` in `src/app/api/time/route.ts`; version the HTTP contract and return a defined response for a retired operation rather than a 404 that reads as an outage.
- [x] `MBE-0206` Make saves idempotent on the unique key, so a retry returns the original log.
- [x] `MBE-0209` Implement copy-previous as decided in D8.
- [x] `MBE-0210` Route corrections and amendments of logs in verified periods through the existing `BE-0442`, `BE-0445` and `BE-0446` paths.

### Validation and Calculation

- [x] `MBE-0203` Validate division authorization on the work date, an active project in that division, a task in that project, assignment or availability, positive integer minutes, the business-timezone date, locked periods, leave and holiday conflicts, and the daily cap from D7 — each with a field, code and guidance.
- [x] `MBE-0204` Enforce the single "may receive work" rule — review state plus status per D3 and D4 — at the entry endpoint, so the server refuses what the frontend dropdown hides.
- [x] `MBE-0205` Remove overlap and range validation for new records while keeping it readable for historical rows.
- [x] `MBE-0207` Aggregate work-log minutes in the calculation engine, apply cross-midnight splitting only to historical rows, and continue storing the applied policy version.
- [x] `MBE-0208` Recalculate daily summaries and downstream projections on every log change, transactionally or through reliable invalidation, as `BE-0427` does today.
- [x] `MBE-0211` Test that `AC-CALC-001`–`004`, `006` and `007` hold unchanged, and cover completed-task refusal, the daily cap, idempotent retry, locked periods, and unauthorized division, project or task.

### Phase B2 Exit Criteria

- [x] No endpoint accepts a clock range or starts a timer for a new record.
- [x] Every calculation acceptance scenario passes against the server.
- [x] A completed or unapproved task is refused at the endpoint, not only hidden in the UI.

## Phase B3 - Backend Task Transitions, History and Notifications

- [x] `MBE-0301` Implement the transition use case enforcing the transition map and the D5 authorization rule, with append-only, idempotent writes.
- [x] `MBE-0302` Make transitions concurrency-safe with a version check, so two simultaneous moves produce one recorded result and a defined conflict.
- [x] `MBE-0303` Require a reason to reopen, preserve the original completion event, and define how the completion date is kept or cleared.
- [x] `MBE-0304` Keep transition timestamps out of the calculation engine by module boundary, and prove it with a test that fails if the engine can read them.
- [x] `MBE-0305` Build the task history read model — transitions and logs in order — with authorization applied before anything is counted or grouped.
- [x] `MBE-0306` Derive actual and variance from logs at read time, never from a stored, overwriteable total.
- [x] `MBE-0307` Send notifications through the Phase 7 notification service for started, completed, reopened, assigned or reassigned, correction requested, significant variance, and overtime or critical totals, with no restricted field in the text.
- [x] `MBE-0308` Audit every transition, note, work-log create, edit and correction, assignment change, reopen, locked-period conflict and amendment.
- [x] `MBE-0309` Test every legal and illegal transition, reopen, concurrent moves, idempotent retry, and authorization from every role.

### Phase B3 Exit Criteria

- [x] Transition history is append-only and complete for every task.
- [x] No transition affects a calculated total.
- [x] Concurrent and retried transitions produce exactly one recorded result.

Evidence and task-to-file mapping: `docs/backend/modify/phase-b3-verification.md`. Backend operations are complete; browser cutover remains B4. The shared transactional notification foundation is implemented without claiming completion of the remaining Backend Phase 7 work.

## Phase B4 - Backend Downstream, Cutover and Verification

- [ ] `MBE-0401` Read work logs and historical clock entries through one query path in reports and exports, with reconciliation tests against the engine.
- [ ] `MBE-0402` Derive workload, evaluation, dashboard and Finance-hours actuals from work logs.
- [ ] `MBE-0403` Change calendar import (`BE-0733`) to produce duration drafts instead of clock drafts.
- [ ] `MBE-0404` Remove the overlap category from the Team Lead exception inventory, per the amended `REQ-RMK-007`.
- [ ] `MBE-0405` Replace the frontend's mock work-log and transition adapters with real services and verify every screen state against real responses.
- [ ] `MBE-0406` Add contract tests between the frontend service interfaces and the HTTP responses for logs and transitions.
- [ ] `MBE-0407` Keep board and day queries within the existing performance budgets.
- [ ] `MBE-0408` Review security for board counts, history and exports, confirming authorization is applied before aggregation.
- [ ] `MBE-0409` Run production smoke tests for log, transition, complete, reopen, locked-period conflict and period verification.
- [ ] `MBE-0410` Record evidence and migration sign-off in `docs/backend/modify/verification.md`.

### Phase B4 Exit Criteria

- [ ] Every consumer reads one query path and reconciles with the engine.
- [ ] The frontend runs on real services with no mock work-log or transition adapter in a production path.
- [ ] Production smoke tests pass.

## 6. Definition of Done

### Frontend (`MFE-*`)

The Definition of Done in `frontend_milestone.md` §6 applies in full, plus:

- No new record can be created with a start time, end time or timer reference through any screen.
- Daily totals and classifications for a fixed dataset are identical before and after the change.
- Every drag interaction has a keyboard and button alternative.
- Historical clock entries still render as recorded.

### Backend (`MBE-*`)

The Definition of Done in `backend_milestone.md` §2.4 applies in full, plus:

- The database and the endpoints both refuse a clock range or timer for a new record.
- Verified-period totals are reproducible after every migration step.
- Transition timestamps are provably unreachable from the calculation engine.

## 7. Acceptance Scenarios

- [ ] `MOD-AC-01` Logs of 2:00, 3:00 and 2:00 on three tasks in three divisions, with a 1:00 break, show 7:00 active, 1:00 break, 8:00 total, Complete, and three division contributions.
- [ ] `MOD-AC-02` Moving a task from Pending to In Progress changes no active, break or daily total.
- [ ] `MOD-AC-03` A task estimated at 8:00 with logs totalling 9:15 completes showing +1:15 variance, and actual time is not capped.
- [ ] `MOD-AC-04` A completed task refuses a new log, including when its id is submitted directly; after reopening with a reason it accepts one.
- [ ] `MOD-AC-05` Retrying a save with the same idempotency key produces exactly one log.
- [ ] `MOD-AC-06` Logs totalling exactly 12:00 show Overtime; 12:01 requires an explanation, shows Critical, and notifies the Team Lead and HR.
- [ ] `MOD-AC-07` Logs that would take daily active time above the D7 cap are refused with field-level guidance. This replaces `AC-CALC-005`.
- [ ] `MOD-AC-08` Verified-period totals are identical before and after migration, and historical clock entries render read-only with their original ranges.
- [ ] `MOD-AC-09` No screen, route, API view or button offers a timer or a start or end time for a new record.
- [ ] `MOD-AC-10` A keyboard-only user can start, log, complete and reopen a task without dragging.
- [ ] `MOD-AC-11` A log dated inside a verified period returns the locked-period conflict with its amendment path.
- [ ] `MOD-AC-12` A log against an unauthorized division, a restricted project or another employee's task is refused, and an unauthorized id returns the same not-found response as a nonexistent one.

## 8. Dependencies and Required Decisions

The following choices were approved for milestone delivery on **14 September 2026**. Specialist owners validate their implementation during the phase shown in `Needed by`; they must not silently change the approved product behavior.

| Decision | Proposed chosen option | Status | Needed by | Owner/approver |
|---|---|---|---|---|
| D1 — Where work logs are stored | Reuse `time_entries` as duration rows with a `source` column. It avoids a permanent two-source reconciliation path and preserves history without copying it. | Approved | Phase 0, before F1 and B1 | Backend lead and product owner |
| D2 — Repeated logs on the same task and date | Allow multiple append-only logs. | Approved | F1 | Product owner |
| D3 — Logging against a Pending task | Refuse with "Start the task first". | Approved | F1 | Product owner |
| D4 — Backfilling an earlier date on a Completed task | Require reopening the task before logging work. | Approved | F1 | Product owner and HR |
| D5 — Pending → Completed directly | Allow Team Lead only, with a required note. | Approved | F1 | Product owner |
| D6 — Variance reason | Flag variance and keep the note optional; do not cap actual time. | Approved | F2 | Product owner and Team Leads |
| D7 — Daily plausibility cap | Refuse active time above 24:00 on one local date. Critical classification and notification still begin above 12:00. | Approved | F1 and B2 | Product owner and HR |
| D8 — Copy previous entry (`REQ-TIME-007`) | Keep it, retargeted to revalidated work-log drafts. | Approved | F3 and B2 | Product owner |
| D9 — Any timer at all | Remove timers entirely, including stopwatch-only prefill. | Approved | Phase 0 | Product owner |
| D10 — Exact attendance compliance | Exact intervals are not required in this milestone and must never be inferred from work logs or transitions; any later requirement becomes a separate approved capability. | Approved | Phase 0 | HR/product owner |
| D11 — Timers and drafts in flight at cutover | Stop a running timer to an audited, uncounted draft for employee review; preserve existing drafts and convert them to duration-only records only when saved. | Approved | B1 | Product owner and HR |

Other dependencies: the Phase 7 notification service (`MBE-0307`), the existing amendment workflow (`BE-0442`, `BE-0445`, `BE-0446`), and the calendar import boundary (`BE-0733`).

## 9. Risks and Required Mitigations

| Risk | Impact | Required mitigation |
|---|---|---|
| Overlap detection disappears | Inflated or double-counted time goes undetected | Critical classification and notification above 12:00, the D7 daily cap, Team Lead exception review, and variance flags |
| Migration alters verified history | Payroll totals change after verification | Decision D1 reuse, before/after snapshot comparison (`MBE-0106`), reversible audited migration, HR rehearsal sign-off |
| A status change is treated as time worked | Hours created by dragging a card | Separate types and modules, no automatic logging, and tests that fail if a transition affects a total |
| Reports read two data sources | Screens disagree on the same day's total | One query path (`MBE-0401`) and reconciliation tests against the engine |
| Guards exist only in the UI | A task id submitted directly bypasses the rule | One predicate enforced in frontend validation and at the server endpoint (`MFE-0104`, `MBE-0204`) |
| Drag-only board | Keyboard and assistive-technology users cannot move tasks | Button and keyboard alternative on every card (`MFE-0202`), verified by `MOD-AC-10` |
| Attendance compliance is lost silently | A legal or policy obligation stops being met | Explicit HR decision in `MOD-0002` before any build phase |
| Superseded tasks read as broken | Future work reintroduces clocks or timers | Annotate superseded tasks in both milestone files (`MOD-0008`) |
| Build proceeds ahead of the requirements | Delivered behaviour contradicts the source of truth | Phase 0 is a hard gate on every build phase |

## 10. Current Progress Summary

| Phase | Status | Completed/Total |
|---:|---|---:|
| Phase 0 - Decision and Requirements Gate | Done | 8/8 |
| Phase F1 - Frontend Contracts, Calculation and Validation | Done | 9/9 |
| Phase F2 - Frontend Task Board and Status Transitions | Done | 10/10 |
| Phase F3 - Frontend Log Work and Timesheet Rework | Done | 11/11 |
| Phase F4 - Frontend Downstream Surfaces, Demo Data and Gates | Pending | 0/11 |
| Phase B1 - Backend Schema and Data Migration | In progress — HR sign-off pending | 9/10 |
| Phase B2 - Backend Work-Log Use Cases, Validation and Calculation | Done | 11/11 |
| Phase B3 - Backend Task Transitions, History and Notifications | Done | 9/9 |
| Phase B4 - Backend Downstream, Cutover and Verification | Pending | 0/10 |

Update this table whenever numbered tasks change status. Acceptance scenarios and phase exit criteria are gates and are not included in the totals.
