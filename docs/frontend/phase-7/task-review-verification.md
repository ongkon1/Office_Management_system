# Employee-Raised Tasks — Verification (`FE-0780`–`FE-0784`)

Until now every task was created by a Team Lead. An employee can now raise one for themselves, and their own Team Lead endorses it before it becomes ordinary work.

## The Rule the Feature Rests On

**A task an employee raised accepts no time until it is approved.**

Without that, the feature is a hole in payroll: someone raises a task, records a full day against it, and the review happens after the hours already exist. It is the same reason an inactive project refuses time (`REQ-WORK-008`).

Enforced in three places, because each covers a gap the others leave:

| Where | What it does | Why it is not enough alone |
|---|---|---|
| `selectableTasks` | Omits it from the dropdown | A task id can be submitted without ever opening the dropdown |
| `validation.ts` | Refuses a submitted `taskId`, with a different message for pending and refused | Says nothing about *who* may approve |
| `mockTaskReviewService.decide` | Refuses any Team Lead who is not this employee's own, and the raiser themselves | — |

`taskAcceptsTime(reviewState)` in `src/contracts/domain.ts` is the single predicate all three read, so the rule cannot drift between them.

## Why This Is Not the Shared Approval Chain

`src/contracts/approval.ts` models a request travelling to a Team Lead and then to three parallel reviewers — the shape requisition and conveyance share. A task is different: one person endorses it, and then it *stops being a request* and becomes work that time is recorded against.

Forcing it into the chain would have meant adding a `reviewer_review` stage and three reviewer roles to a shape that has neither, plus a chain-kind branch in `applyDecision`, `pendingReviewerRoles`, `stageLabel` and `nextStep` — four functions carrying a case that exists for one workflow. `TaskReviewState` is four values and one predicate instead.

The `AGENTS.md` rule "add a workflow by extending `Approvable`" is about *that* chain. It is not an instruction to model every decision as a two-stage chain.

## What Was Built

| Piece | File |
|---|---|
| Review state and predicate | `src/contracts/domain.ts` |
| Contracts and view models | `src/contracts/task-review.ts` |
| Service | `src/services/mock/task-review.ts` |
| Employee raise form | `src/features/tasks/raise-task.tsx` |
| Team Lead review queue | `src/features/team-lead/task-review-queue.tsx` |
| Time-entry guard | `src/lib/calculation/validation.ts`, `src/services/mock/organization.ts` |
| Fixtures | `src/fixtures/index.ts` (`tsk-10`…`tsk-13`, one per review state) |

The employee's form is deliberately narrower than the Team Lead's: no assignee, no supporting members, no checklist. An employee proposes work *for themselves*. Widening it later is easy; taking a granted power back is not.

## Defects the Gates Found

The browser gate failed three checks on its first run. Two were real, one was my check being wrong — recorded separately because the difference matters.

**Real: the task detail screen said nothing about review.** The list card carried the badge and the explanation, but opening the task showed an ordinary task page. Worse, it still offered **Add time** on a task that cannot receive any — sending the person to a form that would refuse them, with no explanation until they had filled it in. The detail screen now carries the state badge, an alert with the reviewer's note, and withholds the action.

**Mine: "the decided task leaves the queue" asserted against the whole page.** The task still exists and still appears on the board below the queue, so the assertion could never pass. Leaving the *queue* was the behaviour under test. Fixed by giving the queue list an accessible name (`aria-label="Tasks awaiting your review"`) and scoping the assertion to it — which is also a genuine accessibility improvement, since a screen-reader user otherwise hears "list, 2 items" with no idea which list.

## A Configuration Defect Found Alongside

`npm run verify` began failing on `database-foundation.integration.test.ts` timing out, while the same file passed when run alone. The cause was a merge overlap, not this feature: `vitest.backend.config.mts` gives integration tests **60 seconds and serial execution** because they talk to MySQL, but the frontend config's `include: ['src/**/*.test.{ts,tsx}']` also matched them and ran them in jsdom with a 5-second concurrent timeout. Adding a test suite was enough load to tip it.

The frontend config now excludes the four backend suffixes the backend config owns. They still run under `npm run test:backend`.

## Evidence

| Gate | Result |
|---|---:|
| `npm run audit:task-review` (new) | 26/26 |
| Task-review unit tests | 41/41 |
| `npm run verify` | 407 tests, contrast 48/48, clean build |
| `npm run test:backend` | 8/8 |
| `npm run audit:a11y` | 279/279, unchanged |
| `npm run audit:stress` | 73/73, unchanged |
| `npm run audit:journeys` | 41/41, unchanged |
| `npm run audit:flows3` · `flows4` | pass · 20/20 |

Phase 3 and Phase 4 flow gates matter here: this change touches the employee task list and the team task board, which those gates already cover.

## Still Open

1. **No `REQ-*` covers this.** `REQ-WORK-003` lists a task's fields but says nothing about who may create one. Requisition and conveyance have the same gap.
2. **A refusal is terminal.** The employee reads the note and raises a new task; there is no edit-and-resubmit. Assumed.
3. **An approved task is an ordinary task.** The Team Lead can then edit it like any other, and nothing re-opens the review.
4. **A Team Lead's own task still needs no endorsement** — they are the reviewer, so there is nobody to ask. `not_required` is the state, not a synthetic self-approval.
