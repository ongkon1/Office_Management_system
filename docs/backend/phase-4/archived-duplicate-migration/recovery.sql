-- Recovery is safe only before Phase 3 columns contain production data.
-- Otherwise restore from backup or roll forward with a corrective migration.
DROP VIEW IF EXISTS task_actual_minutes;
DROP VIEW IF EXISTS project_actual_minutes;
DROP TABLE IF EXISTS task_review_decisions;
ALTER TABLE tasks DROP CONSTRAINT chk_task_review_fields, DROP CONSTRAINT chk_self_raised_task_review, DROP FOREIGN KEY fk_tasks_reviewer, DROP COLUMN review_note, DROP COLUMN reviewed_at, DROP COLUMN reviewer_employee_id, DROP COLUMN review_state;
ALTER TABLE project_members DROP COLUMN version, DROP COLUMN is_active, DROP COLUMN role_in_project;
ALTER TABLE employee_division_assignments DROP CONSTRAINT chk_temporary_assignment_dates, DROP COLUMN is_temporary, DROP COLUMN role_in_division;
ALTER TABLE employees DROP FOREIGN KEY fk_employee_profile_photo, DROP COLUMN office_location, DROP COLUMN employment_type, DROP COLUMN department, DROP COLUMN profile_photo_attachment_id;
ALTER TABLE divisions DROP FOREIGN KEY fk_divisions_team_lead, DROP COLUMN team_lead_employee_id, DROP COLUMN description;
