# Backend Phase 5 — HR workflows

Recorded: 10 September 2026. All 26 numbered implementation tasks are verified; the browser cutover exit gate remains tracked for Phase 9.

## Delivery and boundaries

`src/server/hr/composition.ts` constructs database-backed WFH, leave, attendance, holiday, work-policy, workload and evaluation services, plus HR screen view-model adapters. Identity comes from a validated database session. `src/app/api/hr/route.ts` exposes protected reads and validated request/evaluation/holiday mutations; same-origin checks, private no-store responses and safe dependency errors are enforced at the boundary. The service factories preserve the existing Result contract.

The browser demo registry still uses mock services. Production browser cutover belongs to Backend Phase 9, as in Phase 4. The Phase 5 adapter exit gate therefore remains in progress until that integration is exercised. This delivery does not migrate the user's database or configure a production scheduler.

## Task evidence

| Tasks | Implementation and evidence |
|---|---|
| BE-0501–0504 | `requests.ts`, `repository.ts`, `adapters.ts`: draft versions, submit/cancel, effective primary Team Lead decisions, information requests, HR overrides with reason, history and durable notification jobs. Integration tests cover stale edits, unauthorized decisions, override reasons, overlap and rollback. |
| BE-0505 | `attendance.ts` and the shared time engine: WFH sets attendance context without creating time. The database test asserts zero active minutes after approval. |
| BE-0506–0507 | Leave types and minute balances, reservation on submission, consumption on approval, release on cancellation/revision, half-day calculation, holiday exclusion and transaction locking. Tests race approvals and submissions and assert the resulting balances. |
| BE-0508 | `holidays.ts`, migration 0009 and the time repository: company/division calendars and effective weekly holidays; locked periods reject changes; stored summaries are recalculated and deferred calendar work is recorded. |
| BE-0510–0512 | `attendance.ts`: authoritative time context plus leave, holidays, WFH and explicit duty/absence. Draft time cannot establish a location. Full-day leave and holidays have zero required minutes; half-day leave adjusts requirements through the existing engine. |
| BE-0513 | `jobs.ts`: daily/monthly BullMQ schedules in Asia/Dhaka; scheduled timestamp determines the reporting window. Database jobs and notification deduplication make repeated processing safe. Tests repeat the detector and compare notification counts. |
| BE-0514 | `hr-views.ts`, attendance and request adapters: authorized employee rows, attendance state counts, missing flags, request history, division summaries and leave balances. Actor impersonation is rejected; counts follow authorized rows. |
| BE-0520–0523 | `attendance.ts`, `planning.ts`: effective weekly active capacity, planned division/project minutes, engine-derived actuals, remaining capacity, configurable warnings and deadline/calendar queries. Tests distinguish 2,100 active minutes from a 2,400-minute scheduled week and verify holiday/leave reductions. |
| BE-0530–0531 | `evaluations.ts`: six period types, due dates, open/close lifecycle, employee/reviewer eligibility, atomic combined period/assignment creation and durable reminders. Tests reject invalid assignments without leaving an empty period and prevent edits while closed. |
| BE-0532 | `evaluations.ts`: time facts from the shared calculation output; task outcomes, estimates, contribution splits, WFH, leave and remarks. Facts are captured at assignment and refreshed at review submission, then retained in the published evaluation. |
| BE-0533–0534 | Self-evaluation drafts/submission and reviewer drafts/submission with version checks. Every weighted area needs a score and comment; submission also requires the nine qualitative competency scores/comments from REQ-EVAL-004. |
| BE-0535–0536 | Immutable weighting versions, six whole-percent weights totaling 100, default 30/25/15/10/10/10. The score combines outcomes, quality, timeliness, teamwork, responsibility and learning; hours are factual context, not a score input. |
| BE-0537 | HR return/publication, read-only published evaluations, protected reviewer fields before publication and separate private-evaluation permission. Tests race publication, deny ungranted private access and verify historical weighting stability. |
| BE-0538 | `hr.integration.test.ts`, `calculation.unit.test.ts`, `http.api.test.ts`: real MySQL workflows, effective dates, balances, publication, concurrency, rollback, field redaction, competency completeness, scheduling windows and HTTP validation. |

## Contract and deployment notes

Request and evaluation updates must pass the version read by the client. Attachment metadata is explicitly `restricted` without `file.protected.view`, including successful request mutation responses. An absent attachment remains a different state for an authorized reader. Upload scanning/storage remain Phase 7 responsibilities; Phase 5 validates supplied identifiers against the existing protected-file boundary.

`EvaluationScore.competencies` adds detailed evidence beneath the existing six weighted groups. Work quality includes quality, problem-solving and documentation; teamwork/communication includes both competencies; learning/initiative includes both competencies; responsibility and timeliness each have their own. Task results retain their independent weighted score. A draft may omit competency detail, but a review cannot be submitted without all nine. Phase 9 must wire these fields into the browser review form before switching it to this backend. Historical published payloads remain readable.

`HrRepository.transaction` uses the existing InnoDB time/period write guard, so HR changes serialize against time verification. Audit/history, balances, summaries and jobs commit together; failure results roll them back. History is append-only. Migration `0009_hr_workflows.sql` adds workflow payloads, history, jobs, weighting versions, weekly holidays, duty records and workload thresholds. Its recovery script requires a verified restore or forward repair rather than deleting business history.

The host must call `startHrScheduler` with a trusted service identity carrying `hr.jobs.run` and government visibility, and a Redis connection. Tests exercise the processing and deduplication against MySQL and the scheduled-date calculation; a live Redis worker deployment and external message delivery are not claimed here.

The sample employee policies and leave balances are engineering fixtures, not stakeholder decisions. The core seed has a division-specific policy only; the HR integration suite explicitly supplies a company policy for its other demo employees. Production setup must supply approved effective policies for all reportable employees. Missing policy context is not silently replaced with zero attendance.

## Verification

- Backend suites: **195/195 tests, 24 files**, including **27 Phase 5 tests** (20 MySQL integration, 4 unit, 3 HTTP).
- Frontend/shared regression suite: **409/409 tests, 21 files**.
- Next route type generation, TypeScript and ESLint: passed. Final production build: **passed, 59 generated pages**, including the dynamic `/api/hr` route.
- Migration validation: **9/9** forward migrations with recovery scripts. The Phase 5 recovery-reference header was corrected to meet the existing validator.
- Contrast: **48/48**.
- Dependency audit: passes the high/critical gate; **4 moderate** findings remain in the existing Drizzle Kit development-tool dependency chain. No forced dependency downgrade was applied.

Commands were invoked through the cached Windows Node 24 runtime because this WSL shell has no Linux Node installation. The checks above are the individual gate commands, not a claim that the shell's `npm run verify:backend` wrapper ran successfully.

 Local checks use Node 24.20.0 and the available WAMP MySQL server; the approved production database remains MySQL 8.4 LTS. No production migration, live provider verification, or new browser accessibility/responsive audit is claimed.
