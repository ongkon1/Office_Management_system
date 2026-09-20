CREATE DATABASE IF NOT EXISTS office_management CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS office_management_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'office_migrator'@'localhost' IDENTIFIED BY 'office-migration-only';
CREATE USER IF NOT EXISTS 'office_migrator'@'127.0.0.1' IDENTIFIED BY 'office-migration-only';
CREATE USER IF NOT EXISTS 'office_app'@'localhost' IDENTIFIED BY 'office-dev-only';
CREATE USER IF NOT EXISTS 'office_app'@'127.0.0.1' IDENTIFIED BY 'office-dev-only';
CREATE USER IF NOT EXISTS 'office_test'@'localhost' IDENTIFIED BY 'office-test-only';
CREATE USER IF NOT EXISTS 'office_test'@'127.0.0.1' IDENTIFIED BY 'office-test-only';
GRANT ALL PRIVILEGES ON office_management.* TO 'office_migrator'@'localhost', 'office_migrator'@'127.0.0.1';
GRANT ALL PRIVILEGES ON office_management_test.* TO 'office_migrator'@'localhost', 'office_migrator'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON office_management.* TO 'office_app'@'localhost', 'office_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON office_management_test.* TO 'office_test'@'localhost', 'office_test'@'127.0.0.1';
FLUSH PRIVILEGES;

-- After migration 0011, set RUNTIME_DATABASE_ACCOUNTS for the application
-- principals and run `npm run db:harden-task-work`. Migration-time broad
-- grants must not remain on timer_sessions or task_status_transitions.
