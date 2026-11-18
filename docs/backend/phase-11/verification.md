# Backend Phase 11 Verification - Conveyance

**Status:** Done (22/22)  
**Completed:** 16 November 2026  
**Requirements:** `REQ-CONV-001`-`REQ-CONV-013`; `AC-CONV-001`-`AC-CONV-008`

## Delivered

- Migration `0017_conveyance_claims.sql` and guarded recovery add exact-money claims, append-only reviews, constrained travel modes, receipt linkage, audit columns, and queue indexes.
- `MysqlConveyanceService` implements submission, list/detail, queue, withdrawal, decisions, Team Lead rerouting, and no-lead escalation through session-derived authorization.
- Requisition and conveyance share `src/lib/approval-chain.ts` for routing, transitions, visibility, reviewer authority, pending roles, and audit transition shape.
- `/api/conveyance` and the runtime adapter replace the unavailable prototype with the MySQL service.
- Optional receipts use `/api/files` and the Phase 7 private object-storage path. Upload integrity, media type, size, malware scan state, claim-bound access, immutable binding, authorized download, and download audit are retained.
- Safe notification templates and live notification authorization now understand conveyance claims.
- Deterministic development seed records cover Employee and Team Lead submissions, every active/terminal stage, and receipt/no-receipt cases without pretending a nonexistent seed object is downloadable.

## Security and Integrity Evidence

- Lists and queue counts filter claim visibility before counting.
- Direct unauthorized claim and receipt identifiers produce the same not-found result as random identifiers.
- HR and Super Administrator cannot see an Employee claim or receipt until Team Lead approval reaches their stage.
- Receipt access is re-evaluated from the live claim for each download; a bound receipt cannot be deactivated or replaced.
- Submission time comes only from the service clock. Visited date/time is converted from Asia/Dhaka and future visits are rejected.
- BDT stays a fixed-precision decimal string; three-decimal input is rejected and no money calculation uses `number`.
- Reviewer rows are immutable and unique by claim/reviewer role, while row locking serializes concurrent decisions.
- Notifications contain only fixed generic text and pass live record authorization.

## Automated Evidence

Focused verification:

```text
npm run db:validate
Migration validation passed: 17 forward migration(s) and matching recovery scripts checked.

npm run typecheck
Next route types generated and TypeScript completed successfully.

npm run test -- src/lib/approval-chain.test.ts
1 file passed; 6 tests passed.

npm run test:backend:integration -- src/server/conveyance/conveyance.integration.test.ts
1 file passed; 7 tests passed.
```

The integration suite proves both routing paths, exact money, server timestamps, future-visit rejection, Other-mode validation, rejection, withdrawal, append-only reviews, concurrent decisions, identical not-found responses, Team Lead reassignment/no-lead escalation, and real upload-scan-download receipt behavior.

Project-wide regression:

```text
npm run verify:backend
Typecheck, lint, production data-boundary audit, migration validation,
57 backend test files / 552 tests, cache audit, high-severity security gate,
and the Next.js production build all passed.
```

The audit reported existing moderate development-tool advisories in the Drizzle/esbuild and TypeScript ESLint dependency trees. The configured high-severity production gate passed; no breaking `npm audit fix --force` was applied.

The broad frontend suite completed 956/960 tests under parallel load and timed out four unrelated timesheet/report cases. Rerunning the two affected files in isolation passed all 9/9 tests, confirming no reproducible regression from the Conveyance integration.
