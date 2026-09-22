# Modify Phase B2 — Backend Work-Log Use Cases, Validation and Calculation

Recorded: 21 September 2026. **Phase B2 complete: 11/11 tasks and all three exit criteria.**

## Scope and delivery evidence

B2 replaces the backend time mutation contract with explicit duration-based work logs. Browser adapter cutover and production deployment remain B4. The user's request explicitly starts B2; it does not mark F4 complete or supply the outstanding B1 HR rehearsal sign-off.

| Task | Implementation and verification |
|---|---|
| `MBE-0201` | `src/server/time/application.ts`, `adapters.ts`, `mysql-repository.ts`: create, authorized get/list, versioned correction with a required reason, permitted soft deletion, protected before/after history, and conversion of preserved uncounted drafts. The adapter implements the work-log portion of `TimesheetService`; task transitions/history remain B3. |
| `MBE-0202` | `http.ts`, `validation.ts`, `/api/time`: strict duration-only payloads; no application/repository timer operations. Retired timer commands, `view=timer`, and old clock payloads return HTTP 410 with `OPERATION_RETIRED`, `retryable: false`, and contract version 2. API tests verify retirement without constructing database services. |
| `MBE-0203` | Calendar-date validation precedes database access. Date-effective division/project/task access is checked before replay and validation; inaccessible identifiers share the not-found response. The shared validator covers integer minutes, daily cap, task/project relationships, leave/holiday conflicts and explanations. Attachments require a clean, authorized record. Verified dates retain the amendment conflict. |
| `MBE-0204` | The endpoint invokes `validateWorkLog`, which uses the canonical `taskAcceptsTime` predicate. Direct Completed/Pending/unapproved task submissions fail, including authenticated HTTP calls. Repository task locking serializes eligibility checks against task changes. |
| `MBE-0205` | No new work-log path accepts clock fields or performs overlap checks. Historical range reads and instant utilities remain intact. Historical records cannot be corrected/deleted, even after period unlock. |
| `MBE-0206` | The supplied create key is persisted in `time_entries.idempotency_key`. Create, update and legacy-draft conversion use transactional replay with request fingerprints. Changed payloads conflict; concurrent identical retries return the original result. Current access is rechecked before replay. |
| `MBE-0207` | `TimeApplication.summary` supplies duration rows as `workLogs` and historical rows through the preserved entry path to the canonical engine. Policy version and timezone remain attached to stored rows and snapshots. Acceptance tests now exercise work-log inputs, with historical timezone/cross-midnight utilities separately retained. |
| `MBE-0208` | Every successful mutation refreshes the daily summary and durable projection outbox inside the same transaction as the row, audit and replay result. Audit-failure injection proves rollback; deletion and concurrent-cap tests verify recalculation. |
| `MBE-0209` | Copy returns an unsaved duration draft with a fresh retry key, target date and cleared attachments/link/explanations. It revalidates current target eligibility and period state without creating minutes. Historical sources remain unchanged. |
| `MBE-0210` | Ordinary corrections require a reason/version. Verified work-log edits/deletes return `PERIOD_LOCKED`; authorized amendments retain before/after values, reason, original policy inputs, snapshots and outbox events. Separate authorized unlock retains verification history. |
| `MBE-0211` | `calculation.unit.test.ts`, `http.api.test.ts`, `time.integration.test.ts`: unchanged calculation thresholds and splits, half-day/part-time cases, critical outbox, task eligibility, date/leave/holiday validation, retry/concurrency, cap, authorization/redaction, correction history, draft provenance, transaction rollback, period verification/amendment/unlock and HTTP sessions. |

## HTTP contract version 2

All `/api/time` responses identify `Time-Contract-Version: 2` and use `Cache-Control: private, no-store`. Authentication and trusted mutation-origin checks remain mandatory. Retirement is a defined 410 response, not an outage or a missing route. `OPERATION_RETIRED` is included in the shared error-code contract.

Mutation operations:

- `create`: `input` is `WorkLogInput`, with required project/task, `durationMinutes`, `source: manual`, and an idempotency key. Historical provenance and imports cannot be forged by interactive clients.
- `update`: `id` plus the same input, `expectedVersion` and nonempty `changeReason`; retry keys identify one correction attempt.
- `delete`: `id`, `expectedVersion`.
- `preview`: input and optional `excludeWorkLogId`; returns both task/day totals from the engine without counting an edited log twice.
- `copy`: source `id`, `targetDate`; returns an unsaved draft.
- `draft.convert`: preserved draft `id`, `expectedVersion`, and a reviewed duration input. Creates one new work log and deactivates the old uncounted draft atomically; the original draft's clock facts and source remain available in the database/audit record.
- Existing `break`, `period.verify`, `period.amend`, `period.unlock` and general remark operations continue. Amendment changes now use `durationMinutes`; clock fields are rejected.

Read views include `work-log`, `work-logs`, and `work-log-history`, alongside day/week/month, periods, remarks and the historical-compatible `entries` view. Work-log reads contain no clock fields. Day/legacy entry views explicitly mark protected attachment metadata Restricted. Loading a full editable work-log payload with attachments requires the attachment grant; revision history additionally requires `control.audit.view` and authorization for both snapshots.

Historical clock records remain operational history. Period verification/unlock does not rewrite their row status/version; the period and frozen summaries supply lock state. Converting an uncounted draft is the explicit D11 exception and retains its original facts.

## Verification

| Check | Result |
|---|---|
| Full backend regression, Node 24 | **241/241 passed**, 29 files (`vitest run --config vitest.backend.config.mts --maxWorkers=2`) |
| Final time-focused regression, Node 24 | **57/57 passed**, including 29 real-MySQL cases (`vitest run --config vitest.backend.config.mts src/server/time --maxWorkers=2`) |
| Frontend/shared regression | **582/582 passed**, 35 files (`vitest run --maxWorkers=2`) |
| TypeScript / generated route types | Passed as part of the Node 24 production build |
| ESLint | Full project passed; final affected-file check passed with no warnings |
| Migration/recovery validator | **11/11 passed** |
| Production build, Node 24 | Passed; **62/62** static-generation entries completed |

The full backend run exposed three pre-existing HR tests that used Friday as a scheduled workday. Their input dates were moved to Sunday, retaining the balance-concurrency, holiday-capacity and absence assertions. No policy, threshold or checked set was weakened.

The first unrestricted frontend run encountered worker-startup timeouts under concurrent build/test load. The entire unchanged test set is rerun with two workers; no timeout threshold is increased and no tests are excluded.

The initial regression checks and the 582-test frontend/shared run used the installed Windows Node v22.18.0. Final backend/build checks use the cached Node v24.20.0 runtime, with isolated local MySQL databases from WSL. The approved deployment target remains Node 24 LTS/MySQL 8.4 LTS; these checks do not represent production cutover or HR sign-off.
