-- Recovery: drizzle/recovery/0005_auth_security_foundation.sql
-- Better Auth remains the authentication provider; these application-owned
-- records hold encrypted 2FA material, recovery hashes, durable throttles and
-- session rotation lineage without exposing provider secrets to domain code.

ALTER TABLE auth_sessions
  MODIFY COLUMN ip_address CHAR(64) NULL,
  ADD COLUMN rotated_from_session_id CHAR(36) NULL,
  ADD COLUMN last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ADD CONSTRAINT fk_auth_session_rotation FOREIGN KEY (rotated_from_session_id) REFERENCES auth_sessions(id) ON DELETE RESTRICT;

ALTER TABLE login_history MODIFY COLUMN ip_address CHAR(64) NULL;

CREATE TABLE auth_two_factor (
  user_id CHAR(36) PRIMARY KEY,
  encrypted_totp_secret TEXT NOT NULL,
  recovery_code_hashes JSON NOT NULL,
  enabled_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_auth_two_factor_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE auth_rate_limits (
  scope_key CHAR(64) NOT NULL,
  action_key VARCHAR(64) NOT NULL,
  window_started_at DATETIME(6) NOT NULL,
  attempt_count INT UNSIGNED NOT NULL,
  blocked_until DATETIME(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (scope_key, action_key),
  KEY ix_auth_rate_limit_expiry (blocked_until, window_started_at)
) ENGINE=InnoDB;

CREATE TABLE auth_security_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36),
  event_type VARCHAR(64) NOT NULL,
  identifier_hash CHAR(64),
  ip_hash CHAR(64),
  correlation_id CHAR(36) NOT NULL,
  safe_details JSON NOT NULL,
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_security_event_user_time (user_id, occurred_at),
  KEY ix_security_event_type_time (event_type, occurred_at),
  CONSTRAINT fk_security_event_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TRIGGER auth_security_events_no_update BEFORE UPDATE ON auth_security_events FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'auth security events are append-only';
CREATE TRIGGER auth_security_events_no_delete BEFORE DELETE ON auth_security_events FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'auth security events are append-only';
