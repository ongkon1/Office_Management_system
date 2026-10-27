-- Recovery for 0014_supporting_services.sql.
-- Safe only before Phase 7 records are relied on operationally: it discards
-- deliveries, drafts, tokens, webhook history and OAuth state. Confirmed
-- calendar drafts have already become ordinary work logs and are unaffected.
DROP TABLE calendar_work_drafts;
DROP TABLE oauth_states;
ALTER TABLE integration_connections
  DROP INDEX ix_integration_sync_due, DROP INDEX uq_integration_active_owner, DROP COLUMN active_owner_key,
  DROP COLUMN revoked_at, DROP COLUMN next_sync_at, DROP COLUMN consecutive_failures, DROP COLUMN last_error_code,
  DROP COLUMN sync_settings, DROP COLUMN access_expires_at, DROP COLUMN granted_scopes, DROP COLUMN credential_ciphertext;
DROP TABLE webhook_delivery_attempts;
ALTER TABLE webhook_deliveries DROP FOREIGN KEY fk_webhook_delivery_event,
  DROP COLUMN updated_at, DROP COLUMN delivered_at, DROP COLUMN lease_until, DROP COLUMN lease_token;
DROP TABLE webhook_events;
ALTER TABLE webhook_endpoints DROP COLUMN updated_at, DROP COLUMN disabled_reason, DROP COLUMN previous_secret_expires_at,
  DROP COLUMN previous_secret_ciphertext, DROP COLUMN secret_ciphertext, DROP COLUMN description;
DROP TABLE api_rate_windows;
DROP TABLE api_tokens;
ALTER TABLE search_metadata DROP INDEX ix_search_employee, DROP INDEX ix_search_project, DROP INDEX ix_search_division,
  DROP INDEX ix_search_kind_date, DROP COLUMN is_active, DROP COLUMN file_type, DROP COLUMN occurred_on,
  DROP COLUMN work_location, DROP COLUMN status_key, DROP COLUMN employee_id, DROP COLUMN project_id, DROP COLUMN division_id;
DROP TABLE module_settings;
DROP TABLE message_reads;
DROP TABLE message_mentions;
-- Task comments have no pre-0014 representation; they are removed before the
-- enum is narrowed. Direct messages return to "the other participant's id".
DELETE FROM messages WHERE scope_type='task_comment';
-- The unique key doubles as the sender foreign key's index; replace it first.
ALTER TABLE messages ADD KEY ix_messages_sender(sender_user_id);
ALTER TABLE messages DROP FOREIGN KEY fk_message_pinned_by, DROP INDEX uq_message_idempotency,
  DROP COLUMN idempotency_key, DROP COLUMN pinned_by_user_id, DROP COLUMN pinned_at, DROP COLUMN is_announcement,
  MODIFY scope_type ENUM('division','project','direct') NOT NULL;
UPDATE messages m JOIN direct_conversations c ON c.id=m.scope_id
SET m.scope_id=IF(c.user_low=m.sender_user_id,c.user_high,c.user_low) WHERE m.scope_type='direct';
DROP TABLE direct_conversations;
-- Link-only versions cannot satisfy the original NOT NULL attachment column.
DELETE FROM document_versions WHERE attachment_id IS NULL;
ALTER TABLE document_versions DROP CHECK chk_document_version_source, DROP COLUMN change_note, DROP COLUMN external_link,
  DROP FOREIGN KEY fk_document_version_attachment;
ALTER TABLE document_versions MODIFY attachment_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_document_version_attachment FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT;
ALTER TABLE documents DROP FOREIGN KEY fk_document_deactivated_by, DROP COLUMN deactivated_by_user_id, DROP COLUMN deactivated_at,
  DROP COLUMN current_version_number, DROP COLUMN category, DROP COLUMN description;
ALTER TABLE attachments DROP INDEX ix_attachments_scan, DROP COLUMN version, DROP COLUMN safe_scan_code, DROP COLUMN scan_attempts,
  DROP COLUMN scanned_at, DROP COLUMN completed_at, DROP COLUMN upload_expires_at, DROP COLUMN upload_state;
DROP TABLE notification_rule_runs;
ALTER TABLE delivery_attempts DROP FOREIGN KEY fk_delivery_attempt_delivery, DROP INDEX ix_delivery_attempt_delivery,
  DROP COLUMN duration_ms, DROP COLUMN delivery_id;
DROP TABLE notification_deliveries;
DELETE FROM permissions WHERE permission_key IN ('document.manage','document.protected.view','integration.manage','notification.jobs.run','module.manage')
  AND id NOT IN (SELECT permission_id FROM role_permissions) AND id NOT IN (SELECT permission_id FROM scoped_grants);
