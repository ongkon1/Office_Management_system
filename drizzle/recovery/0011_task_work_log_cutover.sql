-- Guarded recovery for 0011. Run only before any post-cutover duration log or
-- task transition exists; otherwise restore a verified pre-cutover backup into
-- an isolated database and perform an audited forward repair.
CREATE TEMPORARY TABLE task_work_rollback_assertion (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_task_work_rollback_assertion CHECK(must_be_zero=0)
);
INSERT INTO task_work_rollback_assertion(must_be_zero)
SELECT 1 FROM task_status_transitions LIMIT 1;
INSERT INTO task_work_rollback_assertion(must_be_zero)
SELECT 1 FROM time_entries
WHERE created_at>=(SELECT cutover_at_utc FROM time_capture_cutovers WHERE id=1)
  AND idempotency_key NOT LIKE 'cutover-timer:%'
LIMIT 1;
DROP TEMPORARY TABLE task_work_rollback_assertion;

DROP TRIGGER historical_time_entries_immutable;
DROP TRIGGER time_entries_task_capture_insert;
DROP TRIGGER task_status_transitions_no_delete;
DROP TRIGGER task_status_transitions_no_update;

UPDATE timer_sessions ts
JOIN time_entries te ON te.id=ts.draft_time_entry_id AND te.idempotency_key=CONCAT('cutover-timer:',ts.id)
SET ts.stopped_at_utc=NULL,ts.draft_time_entry_id=NULL,ts.draft_payload=NULL,ts.version=GREATEST(1,ts.version-1);
DELETE FROM time_entries WHERE idempotency_key LIKE 'cutover-timer:%';

ALTER TABLE time_entries
  DROP CHECK chk_time_capture_shape,
  DROP INDEX uq_time_idempotency,
  DROP INDEX ix_work_log_employee_date,
  DROP INDEX ix_work_log_task_date,
  ADD KEY ix_time_employee_date(employee_id,work_date,start_at_utc,end_at_utc),
  ADD KEY ix_time_task_date(task_id,work_date),
  DROP COLUMN idempotency_key,
  DROP COLUMN source;

DROP TABLE task_status_transitions;
DROP TABLE task_work_migration_reconciliation;
DROP TABLE task_work_migration_entry_snapshots;
UPDATE time_capture_cutovers SET status='rolled_back' WHERE id=1;
DROP TABLE time_capture_cutovers;
