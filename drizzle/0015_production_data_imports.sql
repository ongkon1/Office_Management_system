-- BE-0912: durable, idempotent production-data import evidence.
-- Recovery: drizzle/recovery/0015_production_data_imports.sql

CREATE TABLE import_batches (
  id CHAR(36) PRIMARY KEY,
  release_id VARCHAR(100) NOT NULL,
  dataset_type ENUM('employees','divisions','assignments','holidays','leave_balances','projects','tasks','cost_rates','opening_periods') NOT NULL,
  mapping_version VARCHAR(32) NOT NULL,
  source_system VARCHAR(120) NOT NULL,
  source_file_name VARCHAR(255) NOT NULL,
  source_cutoff_date DATE NOT NULL,
  source_row_count INT UNSIGNED NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  sensitivity ENUM('internal','protected','restricted','financial','government') NOT NULL,
  state ENUM('received','validating','dry_run_failed','ready_for_approval','approved','committing','committed','rolled_back','superseded') NOT NULL,
  schema_version CHAR(4) NOT NULL,
  target_snapshot_sha256 CHAR(64) NULL,
  dry_run_evidence_sha256 CHAR(64) NULL,
  manifest_json JSON NOT NULL,
  reconciliation_json JSON NOT NULL,
  received_count INT UNSIGNED NOT NULL DEFAULT 0,
  accepted_count INT UNSIGNED NOT NULL DEFAULT 0,
  unchanged_count INT UNSIGNED NOT NULL DEFAULT 0,
  rejected_count INT UNSIGNED NOT NULL DEFAULT 0,
  committed_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_by_user_id CHAR(36) NOT NULL,
  committed_by_user_id CHAR(36) NULL,
  rolled_back_by_user_id CHAR(36) NULL,
  rollback_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  validated_at DATETIME(6) NULL,
  committed_at DATETIME(6) NULL,
  rolled_back_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_import_source(release_id,source_system,dataset_type,source_sha256),
  KEY ix_import_release(release_id,dataset_type,state),
  KEY ix_import_state(state,updated_at),
  CONSTRAINT fk_import_created_by FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_import_committed_by FOREIGN KEY(committed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_import_rolled_back_by FOREIGN KEY(rolled_back_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE import_rows (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  source_row_number INT UNSIGNED NOT NULL,
  source_key_hash CHAR(64) NOT NULL,
  normalized_fingerprint CHAR(64) NOT NULL,
  outcome ENUM('candidate','unchanged','rejected','committed','rolled_back') NOT NULL,
  target_type VARCHAR(64) NULL,
  target_id VARCHAR(191) NULL,
  error_code VARCHAR(64) NULL,
  error_field VARCHAR(128) NULL,
  safe_message VARCHAR(500) NULL,
  corrective_guidance VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_import_row(batch_id,source_row_number),
  KEY ix_import_row_outcome(batch_id,outcome),
  KEY ix_import_row_source(batch_id,source_key_hash),
  CONSTRAINT fk_import_row_batch FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE import_approvals (
  id CHAR(36) PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  approval_scope ENUM('owner','hr','financial','division','technical') NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  permission_snapshot JSON NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL,
  target_snapshot_sha256 CHAR(64) NOT NULL,
  mapping_version VARCHAR(32) NOT NULL,
  approved_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  revoked_at DATETIME(6) NULL,
  active_scope_key VARCHAR(128) GENERATED ALWAYS AS (IF(revoked_at IS NULL,CONCAT(batch_id,':',approval_scope),NULL)) STORED,
  UNIQUE KEY uq_import_active_approval(active_scope_key),
  KEY ix_import_approval_batch(batch_id,approved_at),
  CONSTRAINT fk_import_approval_batch FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_import_approval_actor FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE import_crosswalks (
  id CHAR(36) PRIMARY KEY,
  source_system VARCHAR(120) NOT NULL,
  dataset_type VARCHAR(64) NOT NULL,
  source_key_hash CHAR(64) NOT NULL,
  target_table VARCHAR(64) NOT NULL,
  target_record_id VARCHAR(191) NOT NULL,
  normalized_fingerprint CHAR(64) NOT NULL,
  batch_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  rolled_back_at DATETIME(6) NULL,
  UNIQUE KEY uq_import_crosswalk(source_system,dataset_type,source_key_hash),
  KEY ix_import_crosswalk_target(target_table,target_record_id),
  CONSTRAINT fk_import_crosswalk_batch FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE import_mutations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  mutation_order INT UNSIGNED NOT NULL,
  target_table VARCHAR(64) NOT NULL,
  primary_key_json JSON NOT NULL,
  committed_row_sha256 CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_import_mutation_order(batch_id,mutation_order),
  CONSTRAINT fk_import_mutation_batch FOREIGN KEY(batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

