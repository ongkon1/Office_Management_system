# Backend Phase 6 — Reporting, Finance and exports

Recorded: 13 September 2026. All 19 numbered implementation tasks are verified; the browser cutover exit gate remains part of Phase 9.

## Delivery and task evidence

| Tasks | Deliverables and evidence |
|---|---|
| BE-0601, BE-0606 | `src/server/reporting/application.ts`, `catalogue.ts`, `filters.ts`: session-resolved catalogue, effective employee/division scope, government omission before calculation/grouping, authorized option labels, indistinguishable unavailable report keys. The shared timesheet authorization policy is unchanged. |
| BE-0602 | `query.ts`, `adapters.ts`: validated inclusive dates or period, employee/division/project/task/Team Lead/employment/location/status filters, WFH and overtime switches, explicit empty-array semantics, sorting and pagination. `src/server/time/validation.ts` now rejects impossible calendar dates instead of accepting a syntactically valid 30 February. |
| BE-0603 | `application.ts`: daily, weekly, monthly, employee, division, project, task, overtime, under-time, missing, critical and WFH hour reports. Unassigned project/task work remains in a “Not recorded” group. Every duration comes from the shared engine. |
| BE-0604 | HR attendance, leave, WFH, evaluation, performance history, workload, assignment and remark reports. Request/evaluation/remark readers reuse Phase 4/5 visibility. Workload actual and capacity values use the selected engine days; planned allocations retain their week label. |
| BE-0605 | Stable secondary key sorting; page counts and full-filter totals; UTC generation instant, Asia/Dhaka timezone, resolved period/filters and all applied policy versions. The frontend report contract adds optional pagination and multiple-policy metadata while retaining compatibility. |
| BE-0610 | `finance.ts`: exact BDT employee/project hourly rates, effective date overlap prevention, explicit supersession with before/after audit, protection against changing verified history. The original effective rate remains applicable before its successor starts. |
| BE-0611 | Effective project billability and per-day classification. Separate break/overtime minutes are allocated once with `allocateMinutes` in the calculation engine. Billable and non-billable active minutes reconcile exactly. |
| BE-0612 | `finance-adapter.ts` implements `FinanceService`: dashboard, hours, overtime, project/division cost, billability, payroll summary and preview. `application.ts` supplies financial reports and exact-period budget comparisons. |
| BE-0613 | Finance defaults to verified/amended periods. Including an open period requires `report.finance.unverified`; returned metadata and views identify unverified data. |
| BE-0614 | Approved payroll field configuration records actor, reason and version. The payroll-ready projection uses only configured fields; no external payroll submission exists. Missing configuration is a corrective validation result. |
| BE-0615 | Cost access additionally requires `finance.cost.view`. Restricted view models contain no money/rates; payroll fields are omitted as appropriate. No salary data is selected. Sensitive export permission is separate from report access. |
| BE-0620–0621 | `exports.ts`, `jobs.ts`, migration `0010_reporting_finance_exports.sql`: MySQL durable outbox, BullMQ dispatcher, requester, canonical filters, request hash, data/permission revalidation fingerprint, timezone, versions, state, timestamps and generation metadata. |
| BE-0622 | `formats.ts`, `storage.ts`: streaming ExcelJS workbook, quoted CSV, PDFKit PDF and escaped server-renderable HTML print dataset. Private temporary directory, exclusive file creation, cleanup in finally, SHA-256 integrity and private S3 storage. Formula-looking cells stay text. |
| BE-0623–0624 | Owner-only streamed download, live report/field revalidation, expiring artifacts, queued/processing/ready/failed/cancelled/expired states, request idempotency, retry and lease recovery. Attempt-specific object keys fence stale workers. |
| BE-0625 | Protected audit/history for export request, completion, failure, retry, cancellation, download, expiry and deletion. Financial configuration and succession are audited in the same transaction. |
| BE-0626 | `reporting.integration.test.ts`, `formats.unit.test.ts`, `http.api.test.ts`: real MySQL reconciliation and authorization, precision, worker races, retry/expiry, real-format content, injection, and a 20,000-row worksheet. |

## Calculation and Finance assumptions

The business still owes approval of rates, billable classification, budget rules and payroll fields (`project_requirement.md` §11). Integration-test rates and budgets are engineering fixtures, not approved payroll values. No production financial configuration is seeded by this phase. The migration registers `finance.settings.manage` and `report.finance.unverified` without granting either to a role.

The current implementation uses BDT and hourly rates. A project rate takes precedence over an employee rate on its effective work date. Overtime valuation uses the employee's effective hourly rate without inventing a premium multiplier. These are explicit engineering defaults for owner review. Non-BDT conversion, day/month salary-to-hour conversion and overtime premium rules are not inferred. Missing effective rates return guidance rather than a zero cost. Exact arithmetic, including aggregation across rate changes, lives in `src/lib/money.ts` and rounds half-up only at the final total.

Budget comparison requires an exact matching budget period; it never prorates an annual budget into a month without an approved policy. Cost-analysis adapters return configuration guidance for missing budgets. Work with no effective billable classification is non-billable, including work without a project. Superseding a rate or classification requires the existing id and a later effective start and cannot change verified dates.

Day statuses describe the authorized local day. Contribution filters restrict the active work included; they do not reclassify the employee's day as a new work policy. A separate break is retained once per selected day, and report dimensions share the same selected active total. Finance view composition uses one SQL transaction and the existing period lock.

## Contracts and operational setup

`createReportingServices(pool, sessionToken)` exposes reporting, Finance view adapters, financial configuration and export application services. `/api/reporting` provides a private, same-origin boundary. POST supports `report.run`, `finance.change`, `export.request` and `export.transition`. GET supports catalogue, own export history/status and protected download. Request payloads cannot select the actor or advance a worker. The legacy frontend `advanceExport` method polls real status; it does not simulate success.

The browser registry remains on mock adapters until Backend Phase 9, consistent with Phases 4/5. The new optional report pagination/provenance fields and export idempotency key must be wired into the builder at cutover. Existing Finance empty filter arrays continue to mean “all”; the CommonFilters/report query API deliberately treats an explicit empty array as “no matches.”

The persistent worker host calls `startExportWorker(pool, storage, redisConnection, fontPath)`. SQL remains authoritative if Redis dispatch is interrupted; processing leases can be reclaimed after five minutes. Default artifact access lasts 24 hours. S3 is private with server-side encryption and checksum metadata, and all downloads pass through the application. Configure the existing `S3_*` variables, optional `EXPORT_S3_BUCKET`, and `EXPORT_PDF_FONT_PATH`. The PDF font must be licensed and cover the organization's character set; a report requiring characters unavailable in the built-in font fails rather than silently replacing them. Excel/CSV/HTML preserve Unicode text.

Configure a bucket lifecycle rule for abandoned attempt objects and a temporary-directory cleanup policy for hard process termination. Normal failure paths clean up their files/objects. The browser cannot access an artifact after expiry even if physical cleanup is temporarily unavailable. A changed source dataset or permission scope invalidates an existing artifact; retry regenerates a failed request from its current authorized input. This conservative revalidation trades download speed for privacy and reproducibility.

Reports accept at most 367 calendar days, 20,000 employee-days and 32 MiB of retained source context; larger requests receive guidance to split dates or employee groups. Export files are capped at 64 MiB and worksheet writing streams rows. These are explicit bounded-work limits, not performance-SLA claims. Large-report latency and production sizing remain Phase 8 work.

No production database migration, live Redis/S3 deployment, external payroll operation or browser cutover is claimed.

## Verification

- Final Phase 6 suites: **30/30**, comprising 20 real-MySQL integration, 7 precision/format/large-data unit and 3 HTTP tests.
- Full backend regression before the final two additional cases: **223/223**, 27 files. The final 30-test Phase 6 run also verifies the later snapshot composition, filter-options and inactive-requester cleanup changes.
- Frontend/shared regression: **409/409**, 21 files. The initial simultaneous backend/frontend run exhausted worker-startup resources; rerunning the complete frontend suite with `--maxWorkers=2` passed without exclusions or changed thresholds.
- Next route type generation and final TypeScript check: passed.
- Migration validation: **10/10** forward migrations with recovery scripts; integration tests apply the complete migration chain to isolated databases.
- Contrast: **48/48**.
- Dependency high/critical gate: passed. The ExcelJS UUID advisory was resolved with a scoped `uuid@11.1.1` override; ExcelJS uses the compatible v4 API, and real Excel format tests pass after the update. Four pre-existing moderate Drizzle Kit development dependency findings remain.
- Final repository ESLint: passed. Production build: passed, **60 generated pages**, including the dynamic `/api/reporting` endpoint.

Commands ran through the cached Windows **Node 24.20.0** runtime and the existing WAMP MySQL test harness. These are individual gate results, not a claim that the shell's `npm run verify:backend` wrapper ran. No new browser visual/responsive/accessibility audit was required for these backend-only changes.
