# Backend Technology Decisions

Status: Accepted engineering baseline for Backend Phase 0  
Date: 3 September 2026  
Tasks: `BE-0007`–`BE-0014`

These choices are adapters behind the boundaries in `backend-foundation.md`. They can be replaced through a decision record without changing domain services or frontend contracts.

## Decision summary

| Concern | Selection | Installed baseline |
|---|---|---|
| Node.js | Node.js 24 LTS | 24.20.0 portable development runtime; production uses the latest approved 24.x security patch |
| ORM/query and migrations | Drizzle ORM + Drizzle Kit + `mysql2` | `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `mysql2` 3.24.3 |
| Authentication/session | Better Auth with database-backed sessions, email/password and 2FA plugin | `better-auth` 1.7.2 |
| Validation | Zod 4 | `zod` 4.5.4 |
| Durable jobs | BullMQ backed by Redis, with a separate worker process | `bullmq` 6.3.4, `ioredis` 6.0.0; Redis 7 target |
| Object storage | Private Amazon S3 through AWS SDK v3; filesystem adapter for local development only | AWS SDK 3.1125.0 |
| Transactional email | Resend behind an application email port | `resend` 6.25.0 |
| Runtime topology | Linux Docker image running persistent Node.js; separate web and BullMQ worker processes; reverse proxy in front | Next.js `next start`; static export prohibited |
| Database environment | MySQL 8.4 LTS with InnoDB, `utf8mb4`, `utf8mb4_0900_ai_ci`, strict SQL mode | WAMP development server found at MySQL 8.4.7 |

Package patch versions are locked by `package-lock.json`. Major/minor upgrades require the normal review and verification gates.

## ORM and query layer (`BE-0007`)

Drizzle was selected because its MySQL dialect exposes compound indexes and constraints, exact `DECIMAL`, `DATE` and `DATETIME`, explicit SQL migrations, transactions and savepoints, while keeping repository queries close to SQL. `mysql2/promise` supplies pooled application connections. Database records remain infrastructure types and are mapped into application/contract models.

Rules:

- Code-first schema and reviewed SQL migrations are the source of truth.
- `drizzle-kit generate` creates migrations; `push` is prohibited for shared, staging and production databases.
- A dedicated single connection applies DDL migrations; the application uses a bounded pool.
- Exact money columns use `DECIMAL` returned as strings. Durations use integer columns. Local work dates use `DATE` string mode; UTC instants use `DATETIME(6)` with explicit UTC handling. No implicit server-timezone conversion is trusted.
- Complex authorization/report queries may use typed SQL through Drizzle rather than forcing a relational abstraction.

Evidence: Drizzle documents MySQL exact decimal/date/datetime types, compound indexes, transactions/savepoints and generated SQL migrations.

## Authentication and sessions (`BE-0008`)

Better Auth was selected for first-party credentials, database sessions, reset flows, session revocation, Next.js 16 integration and its 2FA plugin. The application authorization service remains authoritative for role, division, project, ownership, date-effective and field-level business access; Better Auth does not replace it.

Rules:

- Database-backed opaque sessions are mandatory; stateless-only sessions are not used.
- Session cookies are secure, HTTP-only and same-site, with rotation, expiry and server-side revocation.
- Password reset and login responses are non-enumerating. Reset tokens are single-use and stored safely.
- TOTP plus recovery codes is the initial second factor. Recovery/reset actions are audited.
- Every Server Action, Route Handler, Server Component read and job use-case validates the actor at the trusted server boundary. Proxy may optimize redirects but never acts as the sole authorization control.
- Better Auth schema changes are represented in the same reviewed Drizzle migration history; automatic production schema mutation is disabled.

## Validation (`BE-0009`)

Zod 4 owns parsing at external and UI command boundaries. Schemas may be shared where the exact rule is identical, but client validation is convenience only. Application/domain validation rechecks authorization, effective dates, overlap, workflow state, locked periods, totals and other trusted-data rules server-side. Zod issues map to the existing `ValidationFailure` and required `FieldError.guidance` contract.

## Jobs and scheduling (`BE-0010`)

BullMQ with Redis 7 runs exports, notifications, scheduled exception detection and integration retries in a process separate from `next start`.

- Jobs are small, idempotent and identified using a durable application job/idempotency record.
- Default retries use bounded exponential backoff with jitter; terminal failures remain observable for dead-letter/manual recovery.
- Database transactions commit an outbox/job intent; enqueue recovery reconciles intents so a Redis outage does not lose business work.
- Workers re-authorize protected reads where needed and never treat a historical permission snapshot as permanent download authority.
- Redis persistence, monitoring, backup relevance and high availability are operations responsibilities before production.

BullMQ explicitly documents retry/backoff and recommends simple idempotent jobs so retries do not alter final state.

## Files (`BE-0011`)

Private Amazon S3 is the production object store, accessed through AWS SDK v3. The key is opaque and never a user filename. Upload uses initiate/complete, size/type validation, integrity metadata and a malware-scanning state before an object becomes available. Downloads use short-lived presigned or streamed access after service authorization, and sensitive downloads are audited.

A local filesystem adapter is permitted only in development/test under an ignored data directory. It implements the same interface and must prevent traversal. Production never serves protected objects from `public/`.

## Email (`BE-0012`)

Resend is the initial transactional provider behind an `EmailSender` port. A job records template key, safe recipient reference, provider message ID, attempts and terminal state. Templates receive allow-listed safe data; salary, evaluation, government-project content, secrets and protected attachment links are excluded. In development/test, a capture adapter stores messages locally without delivery.

The provider choice is not consent to send production mail: domain verification, sender identity, retention and credentials remain deployment controls.

## Runtime (`BE-0013`)

Production targets a persistent Node.js 24 LTS runtime in Linux containers. The web image uses Next.js standalone output/`next start`; a separately scaled worker image runs BullMQ processors from the same release artifact. A reverse proxy terminates TLS and provides request-size, slow-client and coarse rate-limit controls.

Static export and request-only/serverless deployments are not compatible with database-backed sessions, long-lived connection pools and durable workers. Multi-instance deployments must share `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, set a deployment identifier, coordinate any server cache, and drain on shutdown. User-specific data is not placed in shared cache without principal-safe keys and revocation-aware invalidation.

## MySQL environment (`BE-0014`)

- Supported production line: MySQL 8.4 LTS; development baseline: WAMP MySQL 8.4.7.
- Storage engine: InnoDB.
- Character set/collation: `utf8mb4` / `utf8mb4_0900_ai_ci`; binary/case-sensitive columns or collations are used for opaque tokens, normalized identifiers and hashes where required.
- SQL mode: `ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION` plus `TIME_TRUNCATE_FRACTIONAL` after compatibility validation.
- Connection session timezone: UTC. Business attribution remains the stored local work date plus IANA timezone and policy version.
- Pool: `mysql2` bounded pool, initial maximum 10 per web/worker process, 10-second acquisition/connect timeout, no unbounded retries. Production sizing is derived from MySQL capacity divided across maximum instances and workers.
- Separate least-privilege identities: migration owner (DDL), web application (required DML only), worker (job-required DML only), and read/backup identities as operations require.
- Migration ownership: one release migration job, never each web instance. Migrations run before traffic cutover and require recovery guidance.

MySQL documents `utf8mb4` and `utf8mb4_0900_ai_ci` as 8.4 defaults and recommends `utf8mb4`; its 8.4 default strict modes match the baseline above.

## Source references

- Drizzle: https://orm.drizzle.team/docs/transactions
- Drizzle MySQL types: https://orm.drizzle.team/docs/mysql/column-types
- Drizzle indexes/constraints: https://orm.drizzle.team/docs/mysql/indexes-constraints
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- Better Auth Next.js: https://better-auth.com/docs/integrations/next
- Better Auth database/session model: https://better-auth.com/docs/concepts/database and https://better-auth.com/docs/concepts/session-management
- Better Auth 2FA: https://better-auth.com/docs/plugins/2fa
- Zod: https://zod.dev/packages/zod
- BullMQ retries/idempotency: https://docs.bullmq.io/guide/retrying-failing-jobs and https://docs.bullmq.io/patterns/idempotent-jobs
- Next.js self-hosting: `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`
- AWS S3 SDK v3 examples: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html
- Resend Next.js: https://resend.com/docs/send-with-nextjs
- MySQL 8.4 charset and SQL modes: https://dev.mysql.com/doc/refman/8.4/en/charset.html and https://dev.mysql.com/doc/refman/8.4/en/sql-mode.html

