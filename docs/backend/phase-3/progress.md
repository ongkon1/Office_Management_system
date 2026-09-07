# Backend Phase 3 — Progress

Date started: 7 September 2026  
Scope: `BE-0301`–`BE-0337` (27 uniquely numbered tasks)

## Completed

- `BE-0330`: migration `0006_organization_work.sql` adds task origin, review state, reviewer, decision instant and note, database constraints for employee-raised tasks, and an append-only decision table with concurrency/idempotency keys.
- `BE-0331`: the application boundary permits only the recorded current reviewer and rejects self-review without revealing the task.
- `BE-0332`: server-side time validation rejects pending and refused employee-raised tasks independently of selectable-list filtering.
- `BE-0335`: employee creation derives assignee and reviewer from the authenticated employee and current reporting line; caller-supplied assignees/supporters are not accepted by the command type.
- `BE-0333`: MySQL review decisions use an append-only row, reviewer/idempotency uniqueness, optimistic task versioning, and deterministic replay/conflict outcomes.
- `BE-0334`: review authorization re-resolves the creator's current primary Team Lead at decision time, so reassignment neither strands the task nor preserves stale authority.
- `BE-0336`: raise/approve/refuse operations write redacted audit events and insert deduplicated, recipient-safe task notifications through MySQL-backed effects.
- `BE-0303`: profile-photo metadata and short-lived delivery enforce ownership/team/HR/admin scope and require a clean malware-scan state.

## Foundation now in place

- Migration `0006` aligns employee, assignment, project, membership and task storage with the frontend contracts and has a matching recovery script.
- `src/server/organization/rules.ts` centralizes assignment dates/allocation warnings, project and task scope, derived actual minutes/overdue state, and the server-side task-review refusal used by the eventual time-entry endpoint.
- Phase 3 task identifiers were repaired: the later employee-raised-task work now uses `BE-0330`–`BE-0337` instead of duplicating `BE-0320`–`BE-0323`.
- Stale merge conflicts in `backend_milestone.md` and `package.json` were resolved; the task-review audit command is retained.

## Verification

- Typecheck passed.
- Migration validation passed for six forward migrations and matching recovery scripts.
- Backend unit suite passed: 7 files, 41 tests.

The organization and work application layers now provide audited division lifecycle protection, effective primary-assignment and allocation rules, project/member scope, history-preserving project closure, controlled task transitions, derived actual minutes/overdue state, and authorization-first bounded task queries. Their unit tests pass.

Phase 3 is 20/27. The remaining 7 tasks stay `[~]` until the MySQL-backed employee/assignment/project/task/checklist adapters, full contract mapping, and transaction/concurrency matrix are complete.
