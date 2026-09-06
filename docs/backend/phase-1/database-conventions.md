# Database Conventions and Operations

Tasks: `BE-0101`–`BE-0106`

- Tables and columns use `snake_case`; TypeScript uses `camelCase` with Drizzle casing mapping.
- Business identifiers are application-generated UUID strings (`CHAR(36)`). Append-only/high-volume event tables may additionally use unsigned auto-increment sequence keys.
- Foreign keys default to `RESTRICT`; business history is never cascade-deleted. Join rows may cascade only when they have no independent history.
- Mutable business rows carry `created_at`, `created_by`, `updated_at`, `updated_by`, unsigned `version`, and `is_active` or lifecycle status. Updates compare and increment `version`.
- UTC instants use `DATETIME(6)` and the connection timezone is UTC. Time facts also store `work_date DATE`, IANA `timezone`, and `policy_version_id`.
- Durations and precise percentages are unsigned integers. Money/rates use `DECIMAL(19,4)` plus `CHAR(3)` currency and remain strings in TypeScript. `FLOAT`, `DOUBLE`, `REAL`, and floating JS arithmetic are prohibited.
- JSON is limited to variable metadata, protected snapshots, filters and provider payload envelopes; facts needed for constraints, authorization, joins or reporting use typed columns.
- Effective ranges use inclusive `effective_from` and nullable inclusive `effective_to`; services reject inverted/overlapping ranges.
- Deactivation/versioning preserves referenced rows. Any exceptional hard deletion requires an audited administrative process and proof the row is unreferenced.

## Connections

Local provisioning creates separate `office_app_dev` and `office_app_test` databases and least-privilege `office_app`/`office_test` identities. The migration identity is separate and owns DDL. Application identities receive only required DML and cannot drop or alter schema. Production credentials are supplied by the deployment secret store.

`mysql2` uses a bounded pool (10 by default), 10-second connection timeout, keepalive, UTC session handling and exact decimal strings. Business operations do not blindly retry: concurrency, validation and integrity errors return deterministically. A connection-establishment retry belongs at process orchestration; idempotent jobs own bounded retry policies.

`checkDatabaseHealth` performs a bounded `SELECT 1`; application shutdown calls `pool.end()`. Multi-record business changes use `inTransaction` or Drizzle's transaction API and always release the connection.

## Migrations

- `npm run db:generate`: generate reviewed migration artifacts when Drizzle schema changes.
- `npm run db:migrate`: apply pending numbered SQL migrations once per release.
- `npm run db:status`: report applied/pending/checksum state.
- `npm run db:validate`: validate names, non-empty SQL, destructive recovery notes and checksums.
- `npm run db:rollback -- --to <version>`: executes only an explicitly authored recovery script; production rollback may instead restore/roll forward when data loss would result.

Migration state records version, name, SHA-256 checksum and applied time. A checksum mismatch is fatal. Migrations are applied through a single connection under a MySQL advisory lock, never by every web instance.
