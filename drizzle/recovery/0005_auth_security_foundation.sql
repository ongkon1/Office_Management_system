-- Destructive recovery for 0005; use only through the confirmed test recovery workflow.
DROP TRIGGER IF EXISTS auth_security_events_no_delete;
DROP TRIGGER IF EXISTS auth_security_events_no_update;
DROP TABLE IF EXISTS auth_security_events;
DROP TABLE IF EXISTS auth_rate_limits;
DROP TABLE IF EXISTS auth_two_factor;
ALTER TABLE auth_sessions DROP FOREIGN KEY fk_auth_session_rotation;
ALTER TABLE auth_sessions DROP COLUMN last_seen_at, DROP COLUMN rotated_from_session_id;
ALTER TABLE auth_sessions MODIFY COLUMN ip_address VARCHAR(45) NULL;
ALTER TABLE login_history MODIFY COLUMN ip_address VARCHAR(45) NULL;
