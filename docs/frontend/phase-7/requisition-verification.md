# Requisition — Verification (`FE-0740`–`FE-0752`)

Added to Phase 7 after that phase had been completed, so the phase was reopened rather than the work being filed somewhere it does not belong. `FE-0701`–`FE-0734` were not re-verified by this change; the shared gates were re-run because the feature adds routes and a dashboard element to screens they already cover.

## What Was Built

| Piece | File |
|---|---|
| Contracts | `src/contracts/requisition.ts` |
| Fixtures | `src/fixtures/requisition.ts` |
| Store slice | `src/services/mock/store.ts` |
| Service | `src/services/mock/requisition.ts` |
| List | `src/features/requisition/requisition-list.tsx` |
| Both forms | `src/features/requisition/requisition-form.tsx` |
| Detail and review | `src/features/requisition/requisition-detail.tsx` |
| Routes | `src/app/(app)/requisitions/{page,new/page,[id]/page}.tsx` |
| Team Lead tile | `src/features/team-lead/team-overview.tsx` |
| Notifications | `src/fixtures/workspace.ts` |
| Flag, nav, route rule | `feature-flags.ts`, `navigation.ts`, `route-access.ts` |

## The Chain

```
Employee submits  → Team Lead review → HR + Finance + Super Administrator
Team Lead submits →                    HR + Finance + Super Administrator
```

Three decisions in that diagram are easy to implement plausibly and wrongly:

- **A Team Lead's own requisition skips the Team Lead stage — it is not auto-approved through it.** The obvious shortcut is to write a synthetic approval row so the stage machine needs no special case. That puts a decision in the timeline that nobody made, and a reviewer reading the chain would believe a Team Lead had looked at it. `req-4` in the fixtures exists to keep this honest, and a test asserts the review list is empty.
- **One approval does not decide it.** All three parallel reviewers must approve; any single rejection ends the chain immediately without waiting for the others.
- **Reaching a stage is what grants sight of it.** A requisition still with the Team Lead is `not_found` to HR, Finance and the administrator — not merely absent from their list. Eventually being able to see everything is not the same as being able to see it now.

## Rules Held

**Deny by default.** Visibility is the submitter, that submitter's Team Lead, and reviewers the requisition has reached. `awaitingCount` is computed from rows that already survived the filter, so a count cannot betray a hidden record. An unauthorized id and a nonexistent id take the same code path and return an identical object — asserted by comparing the two responses directly, not by checking each is "not found".

**Money is money.** The form sends free text, as specified. `src/lib/money.ts` parses it once at the service boundary; `100.005` is refused with guidance rather than rounded into the record, and `1,250.75` is accepted the way a person would type it. No component parses or formats an amount.

**Validation carries all three parts.** Every failure has a field, a message and corrective guidance (`REQ-TIME-025`). The form is `noValidate`, so the browser's own required-field bubble cannot pre-empt the service — the same fix Phase 5 made to the employee form.

**Approval wording is correct here, and only here.** A requisition is a genuine decision, like a WFH request, a leave request, or HR period verification. The prohibition in `AGENTS.md` §2 is on daily *time records*, where no decision exists, and nothing in this feature touches a timesheet.

## Decisions Worth Recording

**Requisition sits in its own `review` group for Finance, not in `costing`.** The first placement put it in the costing group, and `navigation.test.ts` failed: it asserts a group disappears once all its items are filtered out, and the ungated requisition entry kept an otherwise-empty group alive. The test was right and the placement was wrong — a review queue is not a costing destination.

**Notifications reuse `request_submitted` rather than adding a type.** That type is already in `ACTION_TYPES`, so a waiting requisition lands under "Action required" with no new grouping rule and no change to the notification centre.

**The Team Lead queue is loaded separately from the dashboard view model.** It belongs to a different service with its own visibility rule; merging them would let a dashboard failure hide a decision that is genuinely waiting.

**Cross-role flow steps stand on fixtures, not on a requisition raised during the run.** The mock store lives in memory for the life of a page load, so a record created in one browser context does not exist in another — the same trap Phase 7 hit with a queued export. Submission is still exercised live, inside the session that submits, because that is where submission behaviour belongs. The fixtures are shaped for the rest: `req-1` with the Team Lead, `req-2` with all three reviewers, `req-3` with HR already approved, `req-5` already rejected.

## Evidence

| Gate | Result |
|---|---:|
| `npm run audit:requisition` | 44/44 |
| `npm run test` (requisition suite) | 40/40 |
| `npm run audit:a11y` | 248/248 (was 217; the three new routes are in the list) |
| `npm run audit:stress` | 68/68 (was 63) |
| `npm run audit:flows7` | pass, unchanged |
| `npm run audit:journeys` | 41/41 |
| `npm run audit:contrast` | 48/48 |
| `npm run verify` | 316 tests, 64-route build |

The three new routes were added to the responsive, accessibility and content-stress route lists. Passing those gates without doing so would have said nothing about the new screens.

## Still Open

The six questions recorded in `frontend_milestone.md` when this was planned are unchanged, and the build reflects the assumptions stated there rather than resolving them:

1. **No `REQ-*` covers this feature.** `project_requirement.md` has no requisition requirement, so nothing here is traceable to an acceptance criterion.
2. All three reviewers must approve; any rejection ends the chain. **Assumed, not confirmed.**
3. Approx amount is a text input normalised to `Money` in BDT.
4. Last recover date is a text input normalised to `IsoDate`, and cannot be in the future.
5. Purpose and Urgency are free text, so the queue is ordered by submission date rather than by urgency.
6. Nothing happens after a decision — no fulfilment, purchase or asset handover.
