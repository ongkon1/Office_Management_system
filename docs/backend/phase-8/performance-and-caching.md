# Phase 8 Performance and Caching

## Candidate production profile

This profile is the engineering baseline to be approved by the product owner
and infrastructure owner before go-live: 2,500 active employees, 10 divisions,
100 departments, 2,000 active projects, 50,000 open tasks, 5 million work logs,
250 concurrent signed-in users, 50 concurrent writes, a 12-month normal report
window, 100,000-row large exports, and 10,000 protected files. Approval is
recorded outside source control with the date, approvers, final values and any
capacity change.

## Repeatable load gate

`npm run audit:phase8:load` reads
`load-scenarios.example.json`. Set `PHASE8_BASE_URL`,
`PHASE8_CONCURRENCY`, `PHASE8_ITERATIONS`, and an authorized
`PHASE8_SESSION_COOKIE`. Use dedicated test accounts for each permission scope;
never paste the cookie into a file or report. A passing run requires zero HTTP
errors and p95 at or below 2,000 ms for reads, 3,000 ms for writes and 5,000 ms
for dashboards/reports. Redirects are not valid authenticated evidence.

For every slow scenario, capture `EXPLAIN ANALYZE` for its authoritative query
with representative cardinality. Record rows examined, chosen indexes and
duration before changing an index. Add an index only when the measured plan
proves the need, rerun the same scenario, and verify write cost and migration
rollback. No speculative Phase 8 index was added.

Large exports and provider failures are exercised through the existing export,
notification and integration suites. A target drill must additionally pause a
worker, create a retry storm within the configured bounds, restore it, and
prove idempotent completion and no unauthorized artifact.

## Cache decision

Protected application reads intentionally remain uncached in Next.js. Their
result depends on actor scope, effective permissions, payroll lock state,
timezone, policy version and mutable assignments. `npm run
audit:phase8:cache` rejects shared server caching directives in protected code.
Durable, authorization-filtered summaries and asynchronous exports are the
approved performance strategy; a future cache needs a written key,
invalidation and authorization proof first.

