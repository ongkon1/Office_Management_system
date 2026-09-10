-- BE-0501..BE-0538.
-- Recovery: drizzle/recovery/0009_hr_workflows.sql
ALTER TABLE wfh_requests ADD COLUMN payload JSON NULL;
ALTER TABLE leave_requests ADD COLUMN payload JSON NULL;
ALTER TABLE leave_types ADD COLUMN allows_half_day BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE leave_balances ADD COLUMN unit_minutes INT UNSIGNED NOT NULL DEFAULT 420, ADD CONSTRAINT chk_balance_unit CHECK(unit_minutes>0);
ALTER TABLE evaluation_periods ADD COLUMN payload JSON NULL;
ALTER TABLE evaluations ADD COLUMN payload JSON NULL;
CREATE TABLE evaluation_weightings (
 version INT UNSIGNED PRIMARY KEY, effective_from DATE NOT NULL, weights JSON NOT NULL,
 created_by_user_id CHAR(36) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_weight_author FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE hr_workflow_history (
 id CHAR(36) PRIMARY KEY, resource_id CHAR(36) NOT NULL, resource_type VARCHAR(32) NOT NULL,
 actor_user_id CHAR(36) NOT NULL, before_json JSON NULL, after_json JSON NOT NULL,
 reason TEXT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_hr_history(resource_id,created_at),
 CONSTRAINT fk_hr_history_actor FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TRIGGER hr_history_no_update BEFORE UPDATE ON hr_workflow_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Workflow history is append-only';
CREATE TRIGGER hr_history_no_delete BEFORE DELETE ON hr_workflow_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Workflow history is append-only';
CREATE TABLE hr_jobs (
 id CHAR(36) PRIMARY KEY, job_key VARCHAR(191) NOT NULL, kind VARCHAR(64) NOT NULL,
 employee_id CHAR(36) NULL, resource_id CHAR(36) NULL, due_at DATETIME(6) NOT NULL,
 status ENUM('pending','complete','failed') NOT NULL DEFAULT 'pending', payload JSON NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), completed_at DATETIME(6) NULL,
 UNIQUE KEY uq_hr_job(job_key), KEY ix_hr_due(status,due_at)
) ENGINE=InnoDB;
CREATE TABLE attendance_duties (
 id CHAR(36) PRIMARY KEY, employee_id CHAR(36) NOT NULL, work_date DATE NOT NULL,
 duty ENUM('official_travel','field_duty','training_duty','absent') NOT NULL, reason TEXT NOT NULL,
 actor_user_id CHAR(36) NOT NULL, UNIQUE KEY uq_duty(employee_id,work_date),
 CONSTRAINT fk_duty_employee FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
 CONSTRAINT fk_duty_actor FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE weekly_holidays (
 id CHAR(36) PRIMARY KEY, division_id CHAR(36) NULL, weekday TINYINT UNSIGNED NOT NULL,
 effective_from DATE NOT NULL, effective_to DATE NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 CHECK(weekday<=6), CHECK(effective_to IS NULL OR effective_to>=effective_from),
 CONSTRAINT fk_weekly_division FOREIGN KEY(division_id) REFERENCES divisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
INSERT INTO permissions(id,permission_key,name,sensitivity) VALUES
(UUID(),'evaluation.private.view','Read private evaluation content','protected'),
(UUID(),'evaluation.weight.manage','Version evaluation weights','protected'),
(UUID(),'hr.jobs.run','Process HR scheduled work','protected')
ON DUPLICATE KEY UPDATE name=VALUES(name);
CREATE TABLE workload_settings (
 id TINYINT PRIMARY KEY, underallocation_percent SMALLINT UNSIGNED NOT NULL DEFAULT 100,
 overallocation_percent SMALLINT UNSIGNED NOT NULL DEFAULT 100,
 CHECK(underallocation_percent<=overallocation_percent)
) ENGINE=InnoDB;
INSERT INTO workload_settings(id) VALUES(1);
INSERT INTO leave_types(id,type_key,name,is_paid) VALUES
('b1000000-0000-4000-8000-000000000001','annual','Annual Leave',TRUE),(UUID(),'sick','Sick Leave',TRUE),
(UUID(),'casual','Casual Leave',TRUE),(UUID(),'unpaid','Unpaid Leave',FALSE)
ON DUPLICATE KEY UPDATE name=VALUES(name);
