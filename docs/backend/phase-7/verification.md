# Backend Phase 7 — Notifications, documents, search and integrations

Recorded: 7 November 2026. All 23 numbered tasks are implemented and verified against real MySQL. The browser cutover for the new management surfaces (uploads, document administration, messaging, integration settings) is Phase 9 work, consistent with Phases 4–6.

## Delivery and task evidence

| Tasks | Deliverables and evidence |
|---|---|
| BE-0701 | `src/server/notifications/catalogue.ts`, `service.ts`, migration `0014`. One fixed template per `NotificationType`; rows store recipient, type, a safe payload (title, body, link, business date), related record, read state and creation time. Pre-catalogue rows (`time.overtime`, HR job kinds) are read through `canonicalType`, never rewritten. |
| BE-0702 | Time events (`service.timeEvent`), task workflow (`task-work`), task review, HR jobs (`hr/jobs.ts` → `notifyForJob`) and the new daily rules (`rules.ts`: deadline approaching, overdue, workload over the configured threshold). Audiences follow `REQ-NOT-001`–`003`; leads come from the department-aware resolver. |
| BE-0703 | Per-recipient deduplication key `sha256(type:occurrence)` with the existing unique index; `notification_rule_runs` claims each (rule, window) once with a reclaimable lease. Verified: rerun is a no-op, a forced reopen creates nothing, concurrent runners take a window once. |
| BE-0704 | `delivery.ts`: Resend behind `EmailSender`, `SKIP LOCKED` claims with a fenced lease token, preference and access re-checked before sending, exponential backoff with jitter, dead letter on permanent failure or last attempt, `delivery_attempts` with safe codes only. Verified: retry→retry→dead letter, permanent failure, unconfigured channel, preference withdrawn, three concurrent workers sending once, no address in logs. |
| BE-0705 | `access.ts` `canOpenRelated` authorizes every recipient before creation; the notification centre re-checks before offering a link. Verified: a government task never reaches a lead without that permission; a stored notification for a record the viewer has lost shows no link. |
| BE-0710 | `files/policy.ts`, `storage.ts`, `scanner.ts`, `application.ts`: allow-listed types and per-owner size limits, sanitized names, opaque keys, initiate/complete with a 15-minute window, size + SHA-256 + leading-byte verification at completion, ClamAV `INSTREAM` scanning (a test-signature scanner in development; none in production means files stay unavailable). Private S3 with SSE and a signed checksum; a traversal-safe local store for development only. |
| BE-0711 | Download re-checks the owner's visibility, then issues a 60-second presigned link or an authenticated stream with `attachment` disposition and `nosniff`; every download is audited. |
| BE-0712 | `files/owners.ts`: profiles, work-log evidence, WFH and leave evidence (owned by the employee before the record exists), projects, tasks, remarks, evaluations, messages and documents. An attachment's visibility is its owner's. `attachmentAllowed` now lets an employee link their own clean evidence — previously it required a permission no role holds. |
| BE-0713 | `documents/application.ts`: company, division (private area) and project scope; category, description, owner; append-only versions as a clean file or an `https` link; optimistic versioning; deactivation instead of deletion. |
| BE-0714 | `messages/application.ts`: division and project channels, two-person direct conversations, task comments, mentions, announcements, pins and read state — only while the server `messages` module is on (`supporting/modules.ts`, off by default). |
| BE-0715 | Shared reach rules in `authorization/record-access.ts` (`documentReach`, `messageScopeReach`, `decideProjectReach`). Government documents do not exist for viewers without access; direct messages are invisible even to HR and Super Administrators; mentions must name someone who can already read the conversation. |
| BE-0720 | `search/indexer.ts` (rebuild and per-record refresh) and `search/application.ts` across employees, divisions, projects, tasks, timesheets, remarks and documents. |
| BE-0721 | Validated date, division, employee, project, status, work-location and file-type filters; pages of up to 50; a scan bound of 500 candidates reported as `truncated`. |
| BE-0722 | Every candidate is re-read and re-authorized against its live row and re-matched against live text; only verified results are counted, grouped or snippeted. Verified with a document restricted and a task renamed without reindexing. |
| BE-0723 | Unit and integration tests for relevance order, permission, stale index, wildcard and quote literals, SQL text, length bounds and a 520-row result set. |
| BE-0730 | `integrations/api/http.ts`, `api-tokens.ts`, `docs/backend/phase-7/api-conventions.md`, route `/api/v1/[...path]`: versioning and deprecation headers, scoped personal tokens acting as their owner, per-token rate limits with `RateLimit-*` and `Retry-After`, cursor pagination, one error envelope with request id. |
| BE-0731 | `integrations/webhooks.ts`: public-`https`-only destinations re-checked at delivery, no redirects, encrypted secrets with 24-hour rotation overlap, HMAC-SHA256 over `timestamp.body`, replay window and event ids, in-transaction publishing with unique source keys, leased delivery, backoff, dead letter, `410` disables, attempt log. Events: `work_log.recorded`, `task.status_changed`, `project.changed`, `period.verified`. |
| BE-0732 | `integrations/calendar.ts`: Google Calendar and Microsoft Graph adapters, bounded windows and pages, upsert by event, withdrawal of vanished events, backoff and reauthorization states. Offered only when approved **and** configured. |
| BE-0733 | Events become `calendar_work_drafts` rows visible only to their employee; they change no totals. Confirmation goes through `TimeApplication.saveImported`, with a draft-derived idempotency key; confirmed or dismissed drafts are never revived. |
| BE-0734 | `integrations/oauth.ts`: hashed single-use state bound to the user, PKCE S256, AES-256-GCM token storage (`integrations/keys.ts`), refresh before expiry, refused refresh → reauthorization required, revoke and destroy on disconnect. |
| BE-0735 | `integrations/catalogue.ts`: catalogue with live status for every integration in `REQ-INT-001`–`007`, and ports for drive, conferencing, Jira, Slack, biometric, HR, payroll, accounting and SSO. None of the future ones is implemented or switched on. |
| BE-0736 | `TimeApplication.saveImported` is the single trusted import path, used by the REST API and calendar confirmation. Browser input still cannot claim `imported`. Verified: pending task, verified period and 24-hour day all refused through the API. |
| BE-0737 | `phase7-integrations.integration.test.ts`: API contract, scopes, pagination, rate limit, revocation, idempotent writes, signature and replay, rotation, retry, dead letter, `410`, revoked-access skip, OAuth state misuse, token encryption, provider failure and reauthorization, session-boundary refusals. |

## Decisions recorded in this phase

- **Government documents are omitted entirely** for viewers without access, rather than listed as "Restricted". Naming them would reveal their existence.
- **Messaging and integrations are server switches**, off by default. The frontend `/settings` flags still only change the viewer's own browser; connecting them to `module_settings` is Phase 9.
- **Integration management is a per-user grant** (`integration.manage`) or the Super Administrator role. No role receives it implicitly.
- **Notification types are stored under the frontend's names.** One older test that asserted the legacy names was updated; its recipients and redaction assertions are unchanged.
- **One project-reach rule.** `decideProjectReach` now serves the project screens, the API and search. Management reads every project and changes none.
- **Search indexes readable labels** (`under time`) rather than stored codes (`under_time`), so `_` is never matched by accident.

## Operational setup

- The worker host calls `startSupportingWorkers(pool, redisConnection)`. It starts the notification rules (06:00 Dhaka), email delivery (every minute), file scanning and upload expiry, webhook delivery, calendar sync and search reindexing. MySQL holds all due work, so an interrupted Redis loses nothing.
- **Required in production:**
  - `INTEGRATION_ENCRYPTION_KEYS`;
  - a private attachment bucket (`ATTACHMENT_S3_BUCKET` or `S3_BUCKET`);
  - a ClamAV host (`CLAMAV_HOST`) — without it, uploads stay unavailable.
- **Email** needs `RESEND_API_KEY` and `EMAIL_FROM`; without them, deliveries are recorded as skipped.
- **Calendar** needs `INTEGRATION_APPROVED_PROVIDERS` plus each provider's client id and secret.
- All of these are listed in `.env.example`.
- Webhook destinations are checked by DNS at delivery time. A determined DNS-rebinding attacker could still race the check. A pinned-address HTTP agent is a Phase 8 hardening item.

## Verification

| Check | Result |
|---|---|
| Phase 7 database suites | **55/55**: notifications 16, content (files, documents, messaging, search) 22, integrations 17 |
| Phase 7 unit tests | **19/19** |
| Full backend regression | **528/528**, 52 files |
| Frontend regression | **953/953**, 58 files |
| Type check (with route typegen), repository lint, production build (74 pages) | Pass |
| Migration validation | 15 forward migrations, each with a recovery script |
| Contrast | 48/48 |
| Production data-boundary audit | Pass |

### Notes on individual runs

- The department-placement race test (`department-repository.integration.test.ts`, unchanged by this phase) failed once under full-suite load. It passed 3/3 in isolation and in the final full run.
- The integration suite's malware test uses a harmless marker. On this Windows machine, the host antivirus quarantines the EICAR file as soon as it touches disk. EICAR detection is verified in memory by the unit test.

### Dependency audit: failing, not caused by this phase

`npm run audit:security` fails on advisories published since Phase 6 against packages that were already installed:

- **Critical:** `next` (fixed in 16.4.5) and `better-auth`.
- **High:** `zod`, `undici`, `vite`, `sharp`, `source-map-js`, `brace-expansion`.

Phase 7 added no dependencies. Upgrading the framework and the authentication library is an application-wide change and needs its own regression run, so it was not done silently here.

### Not claimed

- No live Google, Microsoft, Resend, ClamAV, S3 or Redis was exercised; the tests use fakes behind the same ports.
- No production migration was run.
- No browser screens were built for the new management operations.
