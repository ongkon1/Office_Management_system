# Modify Phase B3 — task transitions, history and notifications

Implemented 21 September 2026. This phase supplies backend operations; browser service replacement and production cutover remain B4. B1's HR rehearsal sign-off and frontend F4 remain pending.

## Deliverables

| Task | Implementation and evidence |
|---|---|
| MBE-0301 | `src/server/task-work/application.ts` enforces the shared transition map and scoped Team Lead-only Pending → Completed rule. Migration 0011's append-only transition table records each successful change; audit, notifications and retry result commit in the same transaction. |
| MBE-0302 | Required `expectedVersion`, locked task row and the shared time-write guard serialize competing moves and work-log saves. Stale moves return conflict; identical retries return the original result. |
| MBE-0303 | Reopening requires a reason. `tasks.completed_at` is cleared on reopen and set to the latest completion on completion; every original completion remains in immutable transition history. |
| MBE-0304 | `calculation-boundary.unit.test.ts` traverses the engine's static import/export graph and rejects workflow/server dependencies. Integration tests compare daily summaries before and after transitions. No transition inserts work or refreshes time summaries. |
| MBE-0305 | `TaskWorkApplication.history` merges authorized logs, historical clock records and transitions chronologically, with stable ID tie-breaking. Log authorization precedes actual totals, daily grouping and ID lists. Unauthorized tasks use the same not-found result as absent tasks. |
| MBE-0306 | Actual is the integer-minute sum of readable, active, non-draft logs at read time. Variance subtracts the task estimate and uses the shared formatter. No writable actual total is introduced. |
| MBE-0307 | `src/server/notifications/service.ts` is the shared transactional notification foundation. Task transitions, assignment, task review and time events use it for started/completed/reopened/assigned/reassigned, correction, positive variance, overtime and critical alerts. Fixed text contains no task title, note, salary or cost. Recipient checks precede variance aggregation. |
| MBE-0308 | Transition audits contain the note and server-derived role; assignment audits preserve before/after assignees. Existing B2 log create/edit/delete, corrections and period amendment audits remain. Locked-period write refusals create a separate durable audit event so rollback cannot erase the attempted action. |
| MBE-0309 | `task-work.integration.test.ts` covers the five-role × three-source × three-target transition matrix, reasons, scope, spoofed roles, version/retry races, completion preservation, append-only triggers, authorization-before-aggregation, assignment, notifications, HTTP sessions and injected audit/delivery failures. Legacy metadata services have regression tests rejecting status/assignee bypasses. |

## API and authority

The existing session-derived `/api/time` version 2 boundary adds:

- POST `{ "operation": "task.transition", "input": { "taskId": "…", "fromStatus": "pending", "toStatus": "in_progress", "actorRole": "employee", "note": null, "expectedVersion": 1, "idempotencyKey": "…" } }`.
- POST `{ "operation": "task.assign", "input": { "taskId": "…", "assigneeEmployeeId": "…", "expectedVersion": 1, "idempotencyKey": "…" } }`.
- GET `?view=task-history&id=…`.

The client `actorRole` is accepted only for compatibility with the typed contract. The server derives authority from the authenticated actor, task ownership/membership and effective division placement/lead scope. A self-service HR user acts as an employee on their own task; management cannot mutate. A Super Administrator does not acquire the Team Lead-only direct completion exception merely by being an administrator. Pending employee-raised tasks must be endorsed before transitions can start their work.

`BackendTimesheetService` now implements `transitionTask` and `getTaskHistory` through the workflow service. Existing metadata save paths reject status and assignee changes, directing callers to versioned workflow operations. The retired legacy status setter cannot mutate storage.

History reads the effective transition role from its immutable audit record. B1's seeded employee transitions predate these audit records and retain the employee fallback. Historical clock ranges remain untouched and retain their original attribution.

## Notification dependency and policy

Backend Phase 7 had no implemented notification service. This phase introduces its shared durable in-app delivery foundation using the existing notifications table and transaction connection; it does not claim delivery of the rest of Phase 7 (inbox/read preferences, providers or worker setup). Notification insertion failure rolls back the originating task mutation, audit and replay record. Recipient/event keys deduplicate retries.

Variance follows the existing frontend behavior: on completion, notify only when the recipient's readable actual minutes exceed the estimate. D6 leaves the note optional and places no cap on actual work. Government visibility is checked for the task and its contributing logs. Daily overtime/critical notifications require visibility of the counted day's contributing divisions. Resource reads remain independently authorized.

The approved per-department hierarchy is a separate milestone. This implementation uses the current effective division-assignment lead model, without claiming the preliminary hierarchy prototype satisfies that replacement.

## Verification

Commands use Node 24.20.0 and isolated local MySQL test databases. Two Vitest workers avoid Windows worker-startup contention; no cases or assertions are excluded.

- Full backend suite: **306/306**, 31 files.
- Final focused task-work/time suite after authorization refinements: **120/120**, 6 files.
- Frontend/shared suite: **582/582**, 35 files.
- Full ESLint: passed.
- Migration/recovery validation: **11/11**; no new migration needed.
- Shared contrast audit: **48/48**.
- Production build, including TypeScript: passed (62 generated pages).

The integration suite proves identical concurrent retries yield one transition/result, distinct competing moves yield one success and one conflict, audit/notification failure leaves no partial mutation, and transitions do not alter daily totals. Production smoke testing and browser adapter contract/cutover checks belong to B4; local tests are not production migration sign-off.
