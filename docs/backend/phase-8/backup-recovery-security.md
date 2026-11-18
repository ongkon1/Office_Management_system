# Phase 8 Backup, Recovery and Security Runbook

## Approval record

The following are proposed targets and are not approved until the accountable
owners sign the deployment record: 99.9% monthly availability, RTO 4 hours,
RPO 15 minutes, encrypted nightly full MySQL backup plus binlog/PITR coverage,
daily protected-object snapshots, 35 daily copies, 12 monthly copies, and an
annual copy retained for the legally approved period. Product owns business
priority; Security owns key/retention approval; Infrastructure owns schedules
and storage; the Database owner owns restore and reconciliation.

## Backup operations

- `npm run db:backup` creates a streaming AES-256-GCM encrypted `mysqldump`, a
  SHA-256 manifest and authoritative reconciliation counts. The backup key is
  supplied by the secret manager and stored separately from the artifacts.
- `npm run objects:backup` requires encrypted, versioned, separate live and
  backup S3-compatible buckets and creates a dated immutable snapshot prefix.
- The target scheduler must capture exit status and the final JSON result,
  alert on absence/failure, replicate to a separate failure domain, enforce
  retention, and periodically verify checksums. Runtime database accounts must
  not receive backup or restore privileges.

## Isolated restore drill

1. Declare an incident/drill lead and freeze the chosen manifests.
2. Create a clean database whose name contains `restore`, `recovery`, `drill`
   or `isolated`; never use the runtime URL.
3. Set `RESTORE_BACKUP_FILE`, `RESTORE_DATABASE_URL` and the secret-managed key,
   then run `npm run db:restore-drill`. It verifies checksum and encryption,
   restores with the MySQL client, and reconciles core records, audit history
   and migration version.
4. Set an isolated versioned/encrypted `RESTORE_S3_BUCKET` and exact snapshot
   `RESTORE_S3_PREFIX`, then run `npm run objects:restore-drill`. Reconcile the
   reported object count and bytes with the snapshot job.
5. Start disposable workers and application instances against the isolated
   stores. Verify health, permissions, protected downloads, locked periods,
   reports and audit history. Destroy the isolated environment under the
   infrastructure change record after evidence is retained.

## Recovery order

Security rotates compromised credentials first. Infrastructure restores
network, secret manager, MySQL and object storage. The Database owner restores
and reconciles data. The application owner applies the matching migration and
deployment version, then starts Redis and workers before opening web traffic.
Integration owners re-enable providers one at a time. Product/HR verify payroll
locks and totals; Security verifies authorization and audit access; the incident
lead communicates recovery and closes the record.

## Security gates

`npm run audit:phase8:security` runs the repository security review and the npm
high-severity dependency gate. It checks committed private keys/database
credentials, dynamic execution and shell sinks, unsafe HTML, sensitive logging,
CSRF origin enforcement, secure cookie controls and upload scan/type/size
boundaries. Authorization suites cover default deny, not-found equivalence and
record/field scope; migration validation and production-data boundary gates
cover destructive schema drift and owner data. Any critical/high finding blocks
release. Lower findings need an owner, treatment, review date and ticket in the
deployment record.

