-- BE-0401..BE-0454: transactional time workflows and reproducible snapshots.
-- Recovery: drizzle/recovery/0008_time_workflows.sql
CREATE TABLE time_write_guard (id TINYINT PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO time_write_guard(id) VALUES(1);
ALTER TABLE time_entries ADD COLUMN attachment_ids JSON NULL, ADD COLUMN updated_by_user_id CHAR(36) NULL,
 ADD CONSTRAINT fk_time_updater FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
UPDATE time_entries SET updated_by_user_id=created_by_user_id;
ALTER TABLE timer_sessions ADD COLUMN policy_version_id CHAR(36) NULL, ADD COLUMN draft_time_entry_id CHAR(36) NULL, ADD COLUMN draft_payload JSON NULL,
 ADD CONSTRAINT fk_timer_policy FOREIGN KEY(policy_version_id) REFERENCES policy_versions(id) ON DELETE RESTRICT,
 ADD CONSTRAINT fk_timer_draft FOREIGN KEY(draft_time_entry_id) REFERENCES time_entries(id) ON DELETE RESTRICT;
ALTER TABLE daily_summaries ADD COLUMN snapshot_json JSON NULL, ADD COLUMN calculation_context_json JSON NULL;
ALTER TABLE period_verifications ADD COLUMN snapshot_json JSON NULL;
ALTER TABLE general_remarks ADD COLUMN related_work_date DATE NULL, ADD COLUMN responses_json JSON NULL;
CREATE TABLE time_outbox (
 id CHAR(36) PRIMARY KEY, event_key VARCHAR(191) NOT NULL, event_type VARCHAR(100) NOT NULL,
 employee_id CHAR(36) NOT NULL, work_date DATE NOT NULL, state ENUM('pending','processing','delivered','failed') NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0, available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_time_event(event_type,event_key), KEY ix_time_event_claim(state,available_at),
 CONSTRAINT fk_time_outbox_employee FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
-- Define separately grantable capabilities; this grants no user or role access.
INSERT INTO permissions(id,permission_key,name,sensitivity) VALUES
(UUID(),'time.break.override','Override recognized daily break','protected'),
(UUID(),'time.period.amend','Amend verified time records','protected'),
(UUID(),'time.period.unlock','Reopen verified time periods','protected'),
(UUID(),'organization.government.view','View government project records','government'),
(UUID(),'file.protected.view','Access protected attachments','protected')
ON DUPLICATE KEY UPDATE name=VALUES(name);
