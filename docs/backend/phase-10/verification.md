# Backend Phase 10 Verification — Requisition

Verified: 16 November 2026

## Delivered

- Migration `0016_requisitions.sql` and its recovery script add durable requisitions, mutually exclusive In-house/New detail tables, exact decimal money, queue indexes, terminal-state checks, and append-only reviewer decisions.
- `MysqlRequisitionService` implements authenticated list, detail, submission, decision, withdrawal, queue, effective-Team-Lead rerouting, no-lead escalation, transactional audit, and notification behavior.
- `/api/requisitions` derives identity from the session and exposes the typed `RequisitionService`; the runtime frontend adapter no longer returns “unavailable.”
- `src/lib/approval-chain.ts` is the single pure approval state machine used by the requisition mock and production service and reserved for conveyance Phase 11.
- Current reviewer policy is Team Lead first for Employee submissions, followed by separate HR and Super Administrator decisions. A Team Lead's own submission skips the first stage. Historical Finance Manager review rows remain readable but receive no new work.
- Employee submission, reviewer-stage arrival, final outcome, reroute, and no-lead escalation use the Phase 7 notification service with live recipient authorization, fixed content-free templates, and deduplication keys.
- Deterministic development seed records cover both variants, every active stage, a Team Lead's own submission, and a fully approved history.

## Authorization and Integrity Evidence

- Submission compares the supplied `userId` with the authenticated actor and permits only Employee or effective Team Lead capability.
- Existing unauthorized and nonexistent identifiers use the same not-found result.
- Visibility is filtered before rows and queue counts; HR and Super Administrator cannot see an Employee request before Team Lead approval.
- Decisions lock the requisition row, append a unique reviewer-role record, update derived state, audit the transition, and enqueue notifications in one transaction.
- A concurrent duplicate reviewer decision returns `conflict`; reviews cannot be updated or deleted.
- A current lead change reroutes the open request and removes the former lead's authority. If no effective lead remains, an audited system transition advances it to parallel review.
- Approximate amounts pass through `money`/`storedMoney`; no requisition calculation uses floating-point arithmetic. Submitted amounts are immutable.

## Automated Results

| Gate | Result |
|---|---|
| Migration validation | 16 forward migrations and matching recovery scripts passed |
| TypeScript / Next route generation | Passed |
| Focused ESLint | Passed with zero warnings |
| Shared approval state-machine tests | 4/4 passed |
| Requisition database integration tests plus authority regression | 15/15 passed |
| Full backend regression suite | 545/545 passed across 56 files |
| Production build | Passed; `/api/requisitions` emitted as a dynamic route |

The database suite covers both form kinds, exact BDT round-trip, Employee and Team Lead routing, every approval stage, rejection validation, withdrawal, parallel approval, concurrent same-role decisions, unauthorized/not-found equivalence, append-only review enforcement, client-supplied identity refusal, Team Lead reassignment, no-lead escalation, audit evidence, and the department-authority compatibility rule.

## Operational Notes

Deploy migration `0016` before starting application code that exposes `/api/requisitions`. The application health check now expects `0016`. Rollback is safe only before business requisitions are released, as stated in the recovery script.
