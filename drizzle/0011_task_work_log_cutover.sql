-- MBE-0101..MBE-0110: task-based work-log persistence and audited cutover.
-- Recovery: drizzle/recovery/0011_task_work_log_cutover.sql

CREATE TABLE time_capture_cutovers (
  id TINYINT UNSIGNED PRIMARY KEY,
  migration_version CHAR(4) NOT NULL,
  cutover_at_utc DATETIME(6) NOT NULL,
  status ENUM('completed','rolled_back') NOT NULL DEFAULT 'completed',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT chk_single_time_cutover CHECK(id=1),
  UNIQUE KEY uq_time_cutover_version(migration_version)
) ENGINE=InnoDB;

INSERT INTO time_capture_cutovers(id,migration_version,cutover_at_utc)
VALUES(1,'0011',UTC_TIMESTAMP(6));

-- Preserve a migration-time fingerprint of every operational fact whose
-- payroll meaning must not change. These records are retained as audit proof.
CREATE TABLE task_work_migration_entry_snapshots (
  time_entry_id CHAR(36) PRIMARY KEY,
  legacy_hash CHAR(64) NOT NULL,
  active_minutes INT UNSIGNED NOT NULL,
  start_at_utc DATETIME(6) NULL,
  end_at_utc DATETIME(6) NULL,
  legacy_updated_at DATETIME(6) NOT NULL,
  captured_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_task_work_snapshot_entry FOREIGN KEY(time_entry_id) REFERENCES time_entries(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO task_work_migration_entry_snapshots(time_entry_id,legacy_hash,active_minutes,start_at_utc,end_at_utc,legacy_updated_at)
SELECT id,
 SHA2(CAST(JSON_ARRAY(id,employee_id,DATE_FORMAT(work_date,'%Y-%m-%d'),division_id,project_id,task_id,
 policy_version_id,timezone,entry_method,work_location,DATE_FORMAT(start_at_utc,'%Y-%m-%d %H:%i:%s.%f'),
 DATE_FORMAT(end_at_utc,'%Y-%m-%d %H:%i:%s.%f'),active_minutes,work_description,completed_work,
 supporting_link,overtime_reason,critical_explanation,cross_midnight_group_id,status,is_active,attachment_ids,
 created_by_user_id,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s.%f'),updated_by_user_id,
 DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s.%f'),version) AS CHAR),256),
 active_minutes,start_at_utc,end_at_utc,updated_at
FROM time_entries;

CREATE TABLE task_work_migration_reconciliation (
  scope_type ENUM('employee_day','verified_period') NOT NULL,
  scope_key VARCHAR(191) NOT NULL,
  before_active_minutes BIGINT UNSIGNED NOT NULL,
  after_active_minutes BIGINT UNSIGNED NULL,
  before_entry_count INT UNSIGNED NOT NULL,
  after_entry_count INT UNSIGNED NULL,
  reconciled_at DATETIME(6) NULL,
  PRIMARY KEY(scope_type,scope_key)
) ENGINE=InnoDB;

INSERT INTO task_work_migration_reconciliation(scope_type,scope_key,before_active_minutes,before_entry_count)
SELECT 'employee_day',CONCAT(employee_id,'|',work_date),COALESCE(SUM(active_minutes),0),COUNT(*)
FROM time_entries WHERE is_active=TRUE AND status IN('saved','locked') GROUP BY employee_id,work_date;

INSERT INTO task_work_migration_reconciliation(scope_type,scope_key,before_active_minutes,before_entry_count)
SELECT 'verified_period',p.id,COALESCE(SUM(te.active_minutes),0),COUNT(te.id)
FROM timesheet_periods p
LEFT JOIN time_entries te ON te.work_date BETWEEN p.start_date AND p.end_date
 AND te.is_active=TRUE AND te.status IN('saved','locked')
WHERE p.status IN('verified','amended') GROUP BY p.id;

ALTER TABLE time_entries
  ADD COLUMN source ENUM('manual','migrated_clock_entry','imported') NULL AFTER entry_method,
  ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER source;

UPDATE time_entries
SET source=CASE
  WHEN start_at_utc IS NOT NULL OR end_at_utc IS NOT NULL OR entry_method IN('manual_clock','timer') THEN 'migrated_clock_entry'
  WHEN entry_method='imported' THEN 'imported'
  ELSE 'manual'
END,
idempotency_key=CONCAT('migration:',id);

-- Adding migration metadata is not an operational edit. Restore the original
-- timestamp so historical records remain exactly reproducible.
UPDATE time_entries te
JOIN task_work_migration_entry_snapshots s ON s.time_entry_id=te.id
SET te.updated_at=s.legacy_updated_at;

ALTER TABLE time_entries
  MODIFY source ENUM('manual','migrated_clock_entry','imported') NOT NULL,
  MODIFY idempotency_key VARCHAR(128) NOT NULL,
  ADD CONSTRAINT uq_time_idempotency UNIQUE(idempotency_key),
  ADD CONSTRAINT chk_time_capture_shape CHECK(source='migrated_clock_entry' OR (start_at_utc IS NULL AND end_at_utc IS NULL)),
  DROP INDEX ix_time_employee_date,
  DROP INDEX ix_time_task_date,
  ADD KEY ix_work_log_employee_date(employee_id,work_date,id),
  ADD KEY ix_work_log_task_date(task_id,work_date,id);

CREATE TABLE task_status_transitions (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  from_status ENUM('pending','in_progress','completed') NOT NULL,
  to_status ENUM('pending','in_progress','completed') NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  changed_at_utc DATETIME(6) NOT NULL,
  note TEXT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  task_version INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_task_transition_idempotency(actor_user_id,idempotency_key),
  KEY ix_task_transition_history(task_id,changed_at_utc,id),
  CONSTRAINT fk_task_transition_task FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_task_transition_actor FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_task_transition_change CHECK(from_status<>to_status),
  CONSTRAINT chk_task_reopen_reason CHECK(NOT(from_status='completed' AND to_status='in_progress') OR note IS NOT NULL)
) ENGINE=InnoDB;

CREATE TRIGGER task_status_transitions_no_update BEFORE UPDATE ON task_status_transitions FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='task status transitions are append-only';
CREATE TRIGGER task_status_transitions_no_delete BEFORE DELETE ON task_status_transitions FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='task status transitions are append-only';

-- Stop every running legacy timer at the cutover instant and preserve it as
-- an uncounted, reviewable historical draft. Saving/converting it belongs to
-- the duration-only B2 application path.
INSERT INTO time_entries(
 id,employee_id,work_date,division_id,project_id,task_id,policy_version_id,timezone,
 entry_method,source,idempotency_key,work_location,start_at_utc,end_at_utc,active_minutes,
 work_description,completed_work,status,is_active,created_by_user_id,created_at,updated_by_user_id
)
SELECT UUID(),ts.employee_id,
 COALESCE(DATE(CONVERT_TZ(ts.started_at_utc,'UTC',ts.timezone)),DATE(ts.started_at_utc)),
 ts.division_id,ts.project_id,ts.task_id,ts.policy_version_id,ts.timezone,
 'timer','migrated_clock_entry',CONCAT('cutover-timer:',ts.id),ts.work_location,
 ts.started_at_utc,c.cutover_at_utc,GREATEST(0,TIMESTAMPDIFF(MINUTE,ts.started_at_utc,c.cutover_at_utc)),
 'Timer stopped automatically at task-based cutover.','Review and describe completed work before saving.',
 'draft',TRUE,ts.created_by_user_id,ts.created_at,ts.created_by_user_id
FROM timer_sessions ts JOIN time_capture_cutovers c ON c.id=1
WHERE ts.stopped_at_utc IS NULL AND ts.cancelled_at_utc IS NULL;

UPDATE timer_sessions ts
JOIN time_entries te ON te.idempotency_key=CONCAT('cutover-timer:',ts.id)
JOIN time_capture_cutovers c ON c.id=1
SET ts.stopped_at_utc=c.cutover_at_utc,
    ts.draft_time_entry_id=te.id,
    ts.draft_payload=JSON_OBJECT('cutover','0011','reviewRequired',TRUE,'source','migrated_clock_entry'),
    ts.version=ts.version+1
WHERE ts.stopped_at_utc IS NULL AND ts.cancelled_at_utc IS NULL;

INSERT INTO audit_events(event_id,actor_user_id,action,resource_type,resource_id,scope_json,reason,correlation_id,before_protected,after_protected,occurred_at)
SELECT UUID(),ts.created_by_user_id,'time.timer.cutover_stopped','timer_session',ts.id,
 JSON_OBJECT('employeeId',ts.employee_id),
 'Task-based work-log cutover stopped the running timer and created an uncounted review draft.',UUID(),
 JSON_OBJECT('running',TRUE),JSON_OBJECT('running',FALSE,'draftTimeEntryId',ts.draft_time_entry_id),c.cutover_at_utc
FROM timer_sessions ts JOIN time_capture_cutovers c ON c.id=1
WHERE ts.draft_payload IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(ts.draft_payload,'$.cutover'))='0011';

-- Existing rows are now classified but their legacy facts remain byte-for-byte
-- unchanged. Fail the migration if totals, counts or protected range facts drift.
UPDATE task_work_migration_reconciliation r
JOIN (
 SELECT CONCAT(employee_id,'|',work_date) scope_key,COALESCE(SUM(active_minutes),0) active_minutes,COUNT(*) entry_count
 FROM time_entries WHERE is_active=TRUE AND status IN('saved','locked') GROUP BY employee_id,work_date
) a ON r.scope_type='employee_day' AND r.scope_key=a.scope_key
SET r.after_active_minutes=a.active_minutes,r.after_entry_count=a.entry_count,r.reconciled_at=UTC_TIMESTAMP(6);

UPDATE task_work_migration_reconciliation r
JOIN (
 SELECT p.id scope_key,COALESCE(SUM(te.active_minutes),0) active_minutes,COUNT(te.id) entry_count
 FROM timesheet_periods p LEFT JOIN time_entries te ON te.work_date BETWEEN p.start_date AND p.end_date
  AND te.is_active=TRUE AND te.status IN('saved','locked')
 WHERE p.status IN('verified','amended') GROUP BY p.id
) a ON r.scope_type='verified_period' AND r.scope_key=a.scope_key
SET r.after_active_minutes=a.active_minutes,r.after_entry_count=a.entry_count,r.reconciled_at=UTC_TIMESTAMP(6);

CREATE TEMPORARY TABLE task_work_cutover_assertion (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_task_work_cutover_assertion CHECK(must_be_zero=0)
);
INSERT INTO task_work_cutover_assertion(must_be_zero)
SELECT 1 FROM task_work_migration_reconciliation
WHERE after_active_minutes IS NULL OR before_active_minutes<>after_active_minutes OR before_entry_count<>after_entry_count
LIMIT 1;
INSERT INTO task_work_cutover_assertion(must_be_zero)
SELECT 1 FROM task_work_migration_entry_snapshots s JOIN time_entries te ON te.id=s.time_entry_id
WHERE s.legacy_hash<>SHA2(CAST(JSON_ARRAY(te.id,te.employee_id,DATE_FORMAT(te.work_date,'%Y-%m-%d'),te.division_id,te.project_id,te.task_id,
  te.policy_version_id,te.timezone,te.entry_method,te.work_location,DATE_FORMAT(te.start_at_utc,'%Y-%m-%d %H:%i:%s.%f'),
  DATE_FORMAT(te.end_at_utc,'%Y-%m-%d %H:%i:%s.%f'),te.active_minutes,te.work_description,te.completed_work,
  te.supporting_link,te.overtime_reason,te.critical_explanation,te.cross_midnight_group_id,te.status,te.is_active,te.attachment_ids,
  te.created_by_user_id,DATE_FORMAT(te.created_at,'%Y-%m-%d %H:%i:%s.%f'),te.updated_by_user_id,
  DATE_FORMAT(te.updated_at,'%Y-%m-%d %H:%i:%s.%f'),te.version) AS CHAR),256)
LIMIT 1;
DROP TEMPORARY TABLE task_work_cutover_assertion;

CREATE TRIGGER time_entries_task_capture_insert BEFORE INSERT ON time_entries FOR EACH ROW
SET NEW.idempotency_key=IF(
  NEW.source='migrated_clock_entry' AND NEW.created_at >= (SELECT cutover_at_utc FROM time_capture_cutovers WHERE id=1),
  NULL,
  NEW.idempotency_key
);

CREATE TRIGGER historical_time_entries_immutable BEFORE UPDATE ON time_entries FOR EACH ROW
SET NEW.active_minutes=IF(
  OLD.source='migrated_clock_entry' AND (
    NOT(NEW.active_minutes<=>OLD.active_minutes) OR NOT(NEW.start_at_utc<=>OLD.start_at_utc) OR
    NOT(NEW.end_at_utc<=>OLD.end_at_utc) OR NOT(NEW.work_date<=>OLD.work_date) OR
    NOT(NEW.division_id<=>OLD.division_id) OR NOT(NEW.project_id<=>OLD.project_id) OR
    NOT(NEW.task_id<=>OLD.task_id) OR NOT(NEW.source<=>OLD.source)
  ),
  NULL,
  NEW.active_minutes
);

INSERT INTO audit_events(event_id,action,resource_type,resource_id,scope_json,reason,correlation_id,after_protected)
VALUES(UUID(),'time.capture.cutover','release_metadata',NULL,JSON_OBJECT('migration','0011'),
 'Task-based work-log schema enabled; legacy ranges preserved and timer writes retired.',UUID(),
 JSON_OBJECT('cutoverAtUtc',(SELECT cutover_at_utc FROM time_capture_cutovers WHERE id=1)));
