-- BE-0701..BE-0737: notifications, files, documents, communication, search,
-- versioned API, webhooks and calendar integration.
-- Recovery: drizzle/recovery/0014_supporting_services.sql
--
-- Every table here is additive or widens an existing Phase 1 table. No
-- business row is rewritten except direct messages, whose scope moves from
-- "the other user's id" to a two-person conversation id so both directions
-- belong to one thread; the recovery script reverses that mapping.

-- Notifications (BE-0701..BE-0705) -------------------------------------------
CREATE TABLE notification_deliveries (
  id CHAR(36) PRIMARY KEY,
  notification_id CHAR(36) NOT NULL,
  channel ENUM('email') NOT NULL,
  template_key VARCHAR(64) NOT NULL,
  state ENUM('pending','processing','sent','dead_letter','skipped') NOT NULL DEFAULT 'pending',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  lease_token CHAR(36) NULL,
  lease_until DATETIME(6) NULL,
  provider_message_id VARCHAR(191) NULL,
  safe_error_code VARCHAR(64) NULL,
  completed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_notification_channel(notification_id,channel),
  KEY ix_notification_delivery_due(state,next_attempt_at),
  CONSTRAINT fk_notification_delivery_notification FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE delivery_attempts
  ADD COLUMN delivery_id CHAR(36) NULL AFTER notification_id,
  ADD COLUMN duration_ms INT UNSIGNED NULL,
  ADD KEY ix_delivery_attempt_delivery(delivery_id,attempt_number),
  ADD CONSTRAINT fk_delivery_attempt_delivery FOREIGN KEY(delivery_id) REFERENCES notification_deliveries(id) ON DELETE RESTRICT;

-- One row per scheduled rule window. A second run of the same window is a
-- no-op, and a crashed run is reclaimable after its lease.
CREATE TABLE notification_rule_runs (
  id CHAR(36) PRIMARY KEY,
  rule_key VARCHAR(64) NOT NULL,
  window_key VARCHAR(64) NOT NULL,
  state ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  lease_until DATETIME(6) NOT NULL,
  generated_count INT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  UNIQUE KEY uq_notification_rule_window(rule_key,window_key)
) ENGINE=InnoDB;

-- Files (BE-0710..BE-0712) ---------------------------------------------------
-- Existing rows default to `completed`, which is what they already were.
ALTER TABLE attachments
  ADD COLUMN upload_state ENUM('initiated','completed','expired') NOT NULL DEFAULT 'completed' AFTER sha256,
  ADD COLUMN upload_expires_at DATETIME(6) NULL,
  ADD COLUMN completed_at DATETIME(6) NULL,
  ADD COLUMN scanned_at DATETIME(6) NULL,
  ADD COLUMN scan_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN safe_scan_code VARCHAR(64) NULL,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD KEY ix_attachments_scan(upload_state,scan_status,created_at);

-- Documents (BE-0713) --------------------------------------------------------
ALTER TABLE documents
  ADD COLUMN description TEXT NULL AFTER title,
  ADD COLUMN category ENUM('policy','handbook','guideline','procedure','training','government','template','meeting_notes','client_instructions','faq','other') NOT NULL DEFAULT 'other' AFTER description,
  ADD COLUMN current_version_number INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN deactivated_at DATETIME(6) NULL,
  ADD COLUMN deactivated_by_user_id CHAR(36) NULL,
  ADD CONSTRAINT fk_document_deactivated_by FOREIGN KEY(deactivated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE document_versions
  MODIFY attachment_id CHAR(36) NULL,
  ADD COLUMN external_link VARCHAR(1024) NULL,
  ADD COLUMN change_note VARCHAR(500) NULL,
  ADD CONSTRAINT chk_document_version_source CHECK((attachment_id IS NULL) <> (external_link IS NULL));

UPDATE documents d SET current_version_number=(
  SELECT COALESCE(MAX(v.version_number),0) FROM document_versions v WHERE v.document_id=d.id
);

-- Communication (BE-0714) ----------------------------------------------------
CREATE TABLE direct_conversations (
  id CHAR(36) PRIMARY KEY,
  user_low CHAR(36) NOT NULL,
  user_high CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_direct_pair(user_low,user_high),
  CONSTRAINT chk_direct_pair_order CHECK(user_low < user_high),
  CONSTRAINT fk_direct_low FOREIGN KEY(user_low) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_direct_high FOREIGN KEY(user_high) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO direct_conversations(id,user_low,user_high)
SELECT UUID(),pair.user_low,pair.user_high FROM (
  SELECT DISTINCT LEAST(sender_user_id,scope_id) user_low,GREATEST(sender_user_id,scope_id) user_high
  FROM messages WHERE scope_type='direct' AND sender_user_id<>scope_id
) pair;

UPDATE messages m JOIN direct_conversations c
  ON c.user_low=LEAST(m.sender_user_id,m.scope_id) AND c.user_high=GREATEST(m.sender_user_id,m.scope_id)
SET m.scope_id=c.id WHERE m.scope_type='direct';

ALTER TABLE messages
  MODIFY scope_type ENUM('division','project','direct','task_comment') NOT NULL,
  ADD COLUMN is_announcement BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN pinned_at DATETIME(6) NULL,
  ADD COLUMN pinned_by_user_id CHAR(36) NULL,
  ADD COLUMN idempotency_key VARCHAR(128) NULL,
  ADD UNIQUE KEY uq_message_idempotency(sender_user_id,idempotency_key),
  ADD CONSTRAINT fk_message_pinned_by FOREIGN KEY(pinned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

CREATE TABLE message_mentions (
  message_id CHAR(36) NOT NULL,
  mentioned_user_id CHAR(36) NOT NULL,
  PRIMARY KEY(message_id,mentioned_user_id),
  CONSTRAINT fk_mention_message FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mention_user FOREIGN KEY(mentioned_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE message_reads (
  user_id CHAR(36) NOT NULL,
  scope_type ENUM('division','project','direct','task_comment') NOT NULL,
  scope_id CHAR(36) NOT NULL,
  last_read_at DATETIME(6) NOT NULL,
  PRIMARY KEY(user_id,scope_type,scope_id),
  CONSTRAINT fk_message_read_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Server-owned module switches. Messaging and external integrations ship off,
-- matching the frontend defaults; nothing else is gated here.
CREATE TABLE module_settings (
  module_key VARCHAR(64) PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL,
  reason VARCHAR(500) NULL,
  updated_by_user_id CHAR(36) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_module_settings_user FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
INSERT INTO module_settings(module_key,is_enabled) VALUES('messages',FALSE),('integrations',FALSE);

-- Search (BE-0720..BE-0723) --------------------------------------------------
-- Filter columns only. Visibility is never read from this table: every
-- candidate is re-authorized against its live source row.
ALTER TABLE search_metadata
  ADD COLUMN division_id CHAR(36) NULL,
  ADD COLUMN project_id CHAR(36) NULL,
  ADD COLUMN employee_id CHAR(36) NULL,
  ADD COLUMN status_key VARCHAR(64) NULL,
  ADD COLUMN work_location VARCHAR(32) NULL,
  ADD COLUMN occurred_on DATE NULL,
  ADD COLUMN file_type VARCHAR(32) NULL,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD KEY ix_search_kind_date(resource_type,is_active,occurred_on),
  ADD KEY ix_search_division(division_id),
  ADD KEY ix_search_project(project_id),
  ADD KEY ix_search_employee(employee_id);

-- Versioned REST API (BE-0730) -----------------------------------------------
CREATE TABLE api_tokens (
  id CHAR(36) PRIMARY KEY,
  owner_user_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  token_prefix CHAR(12) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  scopes JSON NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  last_used_at DATETIME(6) NULL,
  created_by_user_id CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_api_token_hash(token_hash),
  KEY ix_api_token_owner(owner_user_id,revoked_at),
  CONSTRAINT fk_api_token_owner FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_api_token_creator FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE api_rate_windows (
  token_id CHAR(36) NOT NULL,
  window_start DATETIME(6) NOT NULL,
  request_count INT UNSIGNED NOT NULL,
  PRIMARY KEY(token_id,window_start),
  CONSTRAINT fk_api_rate_token FOREIGN KEY(token_id) REFERENCES api_tokens(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Webhooks (BE-0731) ---------------------------------------------------------
ALTER TABLE webhook_endpoints
  MODIFY secret_ref VARCHAR(512) NULL,
  ADD COLUMN description VARCHAR(240) NULL,
  ADD COLUMN secret_ciphertext TEXT NULL,
  ADD COLUMN previous_secret_ciphertext TEXT NULL,
  ADD COLUMN previous_secret_expires_at DATETIME(6) NULL,
  ADD COLUMN disabled_reason VARCHAR(64) NULL,
  ADD COLUMN updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6);

CREATE TABLE webhook_events (
  id CHAR(36) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id CHAR(36) NOT NULL,
  source_key VARCHAR(191) NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_webhook_event_source(source_key)
) ENGINE=InnoDB;

ALTER TABLE webhook_deliveries
  ADD COLUMN lease_token CHAR(36) NULL,
  ADD COLUMN lease_until DATETIME(6) NULL,
  ADD COLUMN delivered_at DATETIME(6) NULL,
  ADD COLUMN updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  ADD CONSTRAINT fk_webhook_delivery_event FOREIGN KEY(event_id) REFERENCES webhook_events(id) ON DELETE RESTRICT;

CREATE TABLE webhook_delivery_attempts (
  id CHAR(36) PRIMARY KEY,
  delivery_id CHAR(36) NOT NULL,
  attempt_number INT UNSIGNED NOT NULL,
  response_code SMALLINT UNSIGNED NULL,
  safe_error_code VARCHAR(64) NULL,
  duration_ms INT UNSIGNED NOT NULL,
  attempted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_webhook_attempt(delivery_id,attempt_number),
  CONSTRAINT fk_webhook_attempt_delivery FOREIGN KEY(delivery_id) REFERENCES webhook_deliveries(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- OAuth and calendar (BE-0732..BE-0734) --------------------------------------
ALTER TABLE integration_connections
  MODIFY encrypted_credential_ref VARCHAR(512) NULL,
  ADD COLUMN credential_ciphertext TEXT NULL,
  ADD COLUMN granted_scopes JSON NULL,
  ADD COLUMN access_expires_at DATETIME(6) NULL,
  ADD COLUMN sync_settings JSON NULL,
  ADD COLUMN last_error_code VARCHAR(64) NULL,
  ADD COLUMN consecutive_failures INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN next_sync_at DATETIME(6) NULL,
  ADD COLUMN revoked_at DATETIME(6) NULL,
  ADD COLUMN active_owner_key VARCHAR(120) GENERATED ALWAYS AS (IF(revoked_at IS NULL, CONCAT(owner_user_id,':',provider_key), NULL)) STORED,
  ADD UNIQUE KEY uq_integration_active_owner(active_owner_key),
  ADD KEY ix_integration_sync_due(status,next_sync_at);

CREATE TABLE oauth_states (
  id CHAR(36) PRIMARY KEY,
  state_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  provider_key VARCHAR(64) NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  redirect_uri VARCHAR(1024) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  consumed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_oauth_state(state_hash),
  CONSTRAINT fk_oauth_state_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- A calendar event becomes a draft here and nowhere else. It is not a
-- time_entries row, so no total, report or payroll figure can read it until
-- the employee confirms it through the ordinary work-log path.
CREATE TABLE calendar_work_drafts (
  id CHAR(36) PRIMARY KEY,
  connection_id CHAR(36) NOT NULL,
  employee_id CHAR(36) NOT NULL,
  provider_event_id VARCHAR(255) NOT NULL,
  provider_change_key VARCHAR(255) NOT NULL,
  work_date DATE NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  proposed_minutes INT UNSIGNED NOT NULL,
  suggested_description VARCHAR(500) NOT NULL,
  state ENUM('draft','confirmed','dismissed','withdrawn') NOT NULL DEFAULT 'draft',
  work_log_id CHAR(36) NULL,
  decided_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_calendar_draft_event(connection_id,provider_event_id,work_date),
  KEY ix_calendar_draft_owner(employee_id,state,work_date),
  CONSTRAINT chk_calendar_draft_minutes CHECK(proposed_minutes BETWEEN 1 AND 1440),
  CONSTRAINT chk_calendar_draft_confirmed CHECK(state<>'confirmed' OR work_log_id IS NOT NULL),
  CONSTRAINT fk_calendar_draft_connection FOREIGN KEY(connection_id) REFERENCES integration_connections(id) ON DELETE RESTRICT,
  CONSTRAINT fk_calendar_draft_employee FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT fk_calendar_draft_work_log FOREIGN KEY(work_log_id) REFERENCES time_entries(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Capabilities are registered, never granted to a role implicitly.
INSERT INTO permissions(id,permission_key,name,sensitivity) VALUES
 ('07000000-0000-4000-8000-000000000001','document.manage','Manage company documents','protected'),
 ('07000000-0000-4000-8000-000000000002','document.protected.view','View protected documents','protected'),
 ('07000000-0000-4000-8000-000000000003','integration.manage','Manage API tokens, webhooks and integrations','protected'),
 ('07000000-0000-4000-8000-000000000004','notification.jobs.run','Run scheduled notification generation','protected'),
 ('07000000-0000-4000-8000-000000000005','module.manage','Switch server-owned modules on or off','protected')
ON DUPLICATE KEY UPDATE name=VALUES(name);
