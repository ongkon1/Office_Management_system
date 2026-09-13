-- BE-0601..BE-0626
-- Recovery: drizzle/recovery/0010_reporting_finance_exports.sql
CREATE TABLE project_billability (
 id CHAR(36) PRIMARY KEY, project_id CHAR(36) NOT NULL, effective_from DATE NOT NULL, effective_to DATE,
 is_billable BOOLEAN NOT NULL, reason VARCHAR(500) NOT NULL, created_by_user_id CHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CHECK(effective_to IS NULL OR effective_to>=effective_from),
 KEY ix_billability_effective(project_id,effective_from,effective_to),
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE payroll_field_config (
 id TINYINT PRIMARY KEY, fields JSON NOT NULL, approved_by_user_id CHAR(36) NOT NULL,
 reason VARCHAR(500) NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 FOREIGN KEY(approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
ALTER TABLE export_jobs ADD COLUMN report_key VARCHAR(100), ADD COLUMN request_hash CHAR(64),
 ADD COLUMN permission_fingerprint CHAR(64), ADD COLUMN policy_versions JSON,
 ADD COLUMN lease_token CHAR(36), ADD COLUMN lease_until DATETIME(6), ADD COLUMN attempt INT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN generated_metadata JSON, ADD COLUMN deleted_at DATETIME(6), ADD KEY ix_export_dispatch(state,lease_until,requested_at);
-- Capabilities are registered, never granted to a role implicitly.
INSERT INTO permissions(id,permission_key,name,sensitivity) VALUES
 ('06000000-0000-4000-8000-000000000001','report.finance.unverified','Read explicitly unverified Finance information','financial'),
 ('06000000-0000-4000-8000-000000000002','finance.settings.manage','Configure effective financial rules and payroll fields','financial');
