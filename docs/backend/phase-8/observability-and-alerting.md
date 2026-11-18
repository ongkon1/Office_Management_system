# Phase 8 Observability and Alerting

`src/server/observability` provides structured JSON events, bounded
low-cardinality metrics and operational alerts. Next.js instrumentation records
application start and uncaught request errors. Health checks record outcome and
latency. Every event may carry a correlation ID and safe opaque actor/resource
reference, but the redactor removes credentials, cookies, tokens, session data,
salary, cost, private content and payloads.

The deployment log collector must parse one JSON object per line and retain
access according to the approved security schedule. Forward counters and
durations to the selected metrics system; do not add employee IDs, URLs with
identifiers, client names or error messages as metric labels.

Minimum alerts:

| Signal | Trigger | Initial owner |
|---|---|---|
| Health/readiness | two consecutive HTTP 503 responses | infrastructure on-call |
| Authentication anomaly | sustained lockout or failure surge | security owner |
| Authorization denials | material increase over the established baseline | security owner |
| Database | connection/readiness failure or pool saturation | database owner |
| Job queue | missing required worker, growing lag, or failed jobs | application on-call |
| Export/integration | terminal failure after retries | application owner |
| Backup | missed schedule, checksum failure, or restore mismatch | infrastructure + database owner |

Thresholds must be calibrated from the approved load profile. Alerts must link
to a correlation ID and runbook, not expose protected record contents.

`GET` and `HEAD /api/health` are non-cached. In production, MySQL/schema,
Redis, all four worker groups and migration `0015` must be ready or the endpoint
returns 503. A missing optional local Redis reports `degraded` with HTTP 200.

