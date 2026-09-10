-- Backend Phase 3: organization, project, task and employee-raised-task persistence.
-- Recovery: drizzle/recovery/0006_organization_work_services.sql

ALTER TABLE divisions
  ADD COLUMN description TEXT NULL AFTER name,
  ADD COLUMN team_lead_employee_id CHAR(36) NULL AFTER description,
  ADD CONSTRAINT fk_divisions_team_lead FOREIGN KEY(team_lead_employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE employees
  ADD COLUMN profile_photo_attachment_id CHAR(36) NULL AFTER preferred_name,
  ADD COLUMN department VARCHAR(160) NULL AFTER job_title,
  ADD COLUMN employment_type ENUM('full_time','part_time','contract','intern','consultant') NOT NULL DEFAULT 'full_time' AFTER department,
  ADD COLUMN office_location VARCHAR(160) NULL AFTER normal_work_mode,
  ADD CONSTRAINT fk_employee_profile_photo FOREIGN KEY(profile_photo_attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT;

ALTER TABLE employee_division_assignments
  ADD COLUMN role_in_division VARCHAR(160) NULL AFTER team_id,
  ADD COLUMN is_temporary BOOLEAN NOT NULL DEFAULT FALSE AFTER is_primary,
  ADD CONSTRAINT chk_temporary_assignment_dates CHECK(is_temporary = FALSE OR effective_to IS NOT NULL);

ALTER TABLE project_members
  ADD COLUMN role_in_project VARCHAR(160) NULL AFTER employee_id,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER effective_to,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active;

ALTER TABLE tasks
  ADD COLUMN review_state ENUM('not_required','pending_review','approved','rejected') NOT NULL DEFAULT 'not_required' AFTER status,
  ADD COLUMN reviewer_employee_id CHAR(36) NULL AFTER review_state,
  ADD COLUMN reviewed_at DATETIME(6) NULL AFTER reviewer_employee_id,
  ADD COLUMN review_note TEXT NULL AFTER reviewed_at,
  ADD CONSTRAINT fk_tasks_reviewer FOREIGN KEY(reviewer_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  ADD CONSTRAINT chk_self_raised_task_review CHECK(creator_employee_id IS NULL OR creator_employee_id <> assignee_employee_id OR review_state <> 'not_required'),
  ADD CONSTRAINT chk_task_review_fields CHECK(
    (review_state = 'pending_review' AND reviewer_employee_id IS NOT NULL AND reviewed_at IS NULL)
    OR (review_state IN ('approved','rejected') AND reviewer_employee_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (review_state = 'not_required' AND reviewed_at IS NULL)
  );

CREATE TABLE task_review_decisions (
  id CHAR(36) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  reviewer_employee_id CHAR(36) NOT NULL,
  decision ENUM('approved','rejected') NOT NULL,
  note TEXT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  decided_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_task_review_idempotency(reviewer_employee_id,idempotency_key),
  UNIQUE KEY uq_task_review_once(task_id),
  CONSTRAINT fk_task_review_task FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_task_review_reviewer FOREIGN KEY(reviewer_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT chk_task_rejection_note CHECK(decision <> 'rejected' OR CHAR_LENGTH(TRIM(note)) > 0)
) ENGINE=InnoDB;

CREATE VIEW project_actual_minutes AS
SELECT p.id project_id, COALESCE(SUM(te.active_minutes),0) actual_minutes
FROM projects p LEFT JOIN time_entries te ON te.project_id=p.id AND te.is_active=TRUE AND te.status IN ('saved','locked')
GROUP BY p.id;

CREATE VIEW task_actual_minutes AS
SELECT t.id task_id, COALESCE(SUM(te.active_minutes),0) actual_minutes
FROM tasks t LEFT JOIN time_entries te ON te.task_id=t.id AND te.is_active=TRUE AND te.status IN ('saved','locked')
GROUP BY t.id;

