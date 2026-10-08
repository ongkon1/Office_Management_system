-- BE-0902: durable preferences used by profile and administrative settings.
-- Recovery: drizzle/recovery/0012_frontend_cutover_preferences.sql
CREATE TABLE user_preferences (
  user_id CHAR(36) PRIMARY KEY,
  density ENUM('comfortable','dense') NOT NULL DEFAULT 'comfortable',
  recent_searches JSON NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_user_preferences_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE organization_branding (
  id TINYINT PRIMARY KEY,
  logo_payload JSON NULL,
  updated_by_user_id CHAR(36) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_branding_user FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
INSERT INTO organization_branding(id,logo_payload) VALUES(1,NULL);

CREATE TABLE notification_preferences (
  user_id CHAR(36) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  version INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY(user_id,setting_key),
  CONSTRAINT fk_notification_preferences_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
