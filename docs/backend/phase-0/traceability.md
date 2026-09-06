# Backend MVP Traceability Baseline

Task: `BE-0021`  
Rule: Requirement-specific tests are added in the owning implementation phase; this baseline defines their home and mandatory test classes.

| Requirement area | Owning modules | Primary backend phases | Mandatory test suites |
|---|---|---:|---|
| `REQ-RBAC-*`, `AC-AUTH-*` | access, authorization, every query adapter | 2 and each feature phase | policy unit; repository scope; action/route allow-deny; count/search/file/export non-disclosure |
| `REQ-ORG-*`, `REQ-DATA-002`, `-005`, `-007` | organization | 1, 3 | effective-date boundaries; constraints; historical preservation; scoped queries |
| `REQ-WORK-*` | work, files | 3 | membership and assignment scope; workflow; actual-hours reconciliation; attachment authorization |
| `REQ-TIME-*`, `AC-CALC-*`, `AC-WF-003` | time, organization policy, audit, jobs | 1, 4 | pure calculation table; integer-minute boundaries; cross-division overlap; concurrency; idempotency; lock/amendment integration |
| `REQ-RMK-*` | collaboration/time | 4 | single remark workflow; effective scope; correction; notification and audit |
| `REQ-WFH-*`, `REQ-LEAVE-*`, `REQ-ATT-*` | HR, time | 5 | request state machines; half/full-day adjustment; balance; attendance derivation; override audit |
| `REQ-WLOAD-*` | workload, work, time | 5 | capacity/effective assignment; planned-v-actual reconciliation; authorization |
| `REQ-EVAL-*` | evaluation, time, work, HR | 5 | weights/version; source reconciliation; reviewer scope; publication privacy |
| `REQ-DASH-*` | reporting plus source modules | 3–6 | view authorization; shared-total reconciliation; performance datasets |
| `REQ-RPT-*`, `AC-RPT-*` | reporting, Finance, jobs, files | 6 | grouping reconciliation; verified default; redaction; export formats/injection/expiry/download reauthorization |
| `REQ-NOT-*` | notifications, jobs | 4–7 | trigger recipient matrix; deduplication; retries; safe content; related-record reauthorization |
| `REQ-SRCH-*` | search and authorization | 7 | authorized indexing/query; counts/snippets/files; pagination; injection/stale data |
| `REQ-DOC-*`, `REQ-DATA-006` | files, collaboration | 3, 7 | upload validation; scanning boundary; integrity; inherited permissions; audited download |
| `REQ-INT-*`, `AC-WF-005` | integrations, jobs, time | 7 | OAuth/state; webhook signature/replay/idempotency; provider failure; calendar draft exclusion/confirmation |
| `REQ-NFR-SEC-*` | access, authorization, audit, all delivery | 2, 8 | enumeration; sessions/CSRF/rate limit; injection; secret/log redaction; dependency/security scan |
| `REQ-NFR-PERF-*`, `REQ-NFR-OPS-*` | platform, jobs, observability | 0, 6–8 | contract/error tests; idempotency; representative load; job recovery; safe telemetry |
| `REQ-NFR-BACKUP-*`, `AC-QUAL-003` | operations/data/files | 8, 9 | clean migration; backup restore drill; reconciliation and recovery-time evidence |

## Test naming and evidence

- Unit tests name the requirement at the suite or case level when one rule is being proven.
- Integration and end-to-end tests include the applicable `BE-*` task and acceptance scenario in a comment or test metadata.
- Authorization tests are table-driven across role, date-effective scope, workflow state and field sensitivity.
- Reconciliation tests reuse one deterministic scenario across dashboard, report, export, evaluation and Finance projections.
- A requirement is not marked covered merely because a happy-path UI test touches it.

