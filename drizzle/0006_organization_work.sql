-- Recovery: drizzle/recovery/0006_organization_work.sql
-- Phase 3 contract alignment and employee-raised task review invariants.

ALTER TABLE divisions ADD COLUMN description TEXT NULL;

ALTER TABLE employees
  ADD COLUMN department VARCHAR(160) NULL,
  ADD COLUMN employment_type ENUM('full_time','part_time','contract','intern','consultant') NOT NULL DEFAULT 'full_time',
  ADD COLUMN office_location VARCHAR(160) NULL,
  ADD COLUMN standard_daily_active_minutes INT UNSIGNED NOT NULL DEFAULT 420,
  ADD COLUMN standard_weekly_active_minutes INT UNSIGNED NOT NULL DEFAULT 2100,
  ADD COLUMN profile_attachment_id CHAR(36) NULL,
  ADD CONSTRAINT fk_employee_profile_attachment FOREIGN KEY(profile_attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT;

ALTER TABLE employee_division_assignments
  ADD COLUMN role_in_division VARCHAR(160) NULL,
  ADD COLUMN is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT chk_temporary_assignment_dates CHECK(is_temporary=FALSE OR effective_to IS NOT NULL);

ALTER TABLE project_members
  ADD COLUMN role_in_project VARCHAR(160) NULL,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE tasks
  ADD COLUMN division_id CHAR(36) NULL,
  ADD COLUMN creator_role ENUM('team_lead','employee') NOT NULL DEFAULT 'team_lead',
  ADD COLUMN review_state ENUM('not_required','pending_review','approved','rejected') NOT NULL DEFAULT 'not_required',
  ADD COLUMN reviewer_employee_id CHAR(36) NULL,
  ADD COLUMN reviewed_at DATETIME(6) NULL,
  ADD COLUMN review_note TEXT NULL;

UPDATE tasks t JOIN projects p ON p.id=t.project_id
SET t.division_id=p.division_id,t.creator_employee_id=COALESCE(p.manager_employee_id,t.assignee_employee_id);

ALTER TABLE tasks DROP FOREIGN KEY fk_tasks_creator;
ALTER TABLE tasks
  MODIFY COLUMN division_id CHAR(36) NOT NULL,
  MODIFY COLUMN creator_employee_id CHAR(36) NOT NULL,
  ADD CONSTRAINT fk_task_division FOREIGN KEY(division_id) REFERENCES divisions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tasks_creator FOREIGN KEY(creator_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_task_reviewer FOREIGN KEY(reviewer_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  ADD CONSTRAINT chk_task_review_origin CHECK(creator_role='team_lead' OR review_state<>'not_required'),
  ADD CONSTRAINT chk_task_review_decision CHECK((review_state IN ('not_required','pending_review') AND reviewer_employee_id IS NULL AND reviewed_at IS NULL) OR (review_state IN ('approved','rejected') AND reviewer_employee_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  ADD CONSTRAINT chk_task_review_note CHECK(review_state<>'rejected' OR review_note IS NOT NULL);

CREATE TABLE task_review_decisions (
  id CHAR(36) PRIMARY KEY, task_id CHAR(36) NOT NULL, reviewer_employee_id CHAR(36) NOT NULL,
  outcome ENUM('approved','rejected') NOT NULL, note TEXT NULL, decided_at DATETIME(6) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL, task_version INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_task_review_once(task_id), UNIQUE KEY uq_task_review_idempotency(reviewer_employee_id,idempotency_key),
  CONSTRAINT fk_task_review_task FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_task_review_reviewer FOREIGN KEY(reviewer_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT chk_task_rejection_note CHECK(outcome<>'rejected' OR note IS NOT NULL)
) ENGINE=InnoDB;

CREATE TRIGGER task_review_decisions_no_update BEFORE UPDATE ON task_review_decisions FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='task review decisions are append-only';
CREATE TRIGGER task_review_decisions_no_delete BEFORE DELETE ON task_review_decisions FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='task review decisions are append-only';
