-- Destructive recovery for 0006; use only in the confirmed test recovery workflow.
DROP TRIGGER IF EXISTS task_review_decisions_no_delete;
DROP TRIGGER IF EXISTS task_review_decisions_no_update;
DROP TABLE IF EXISTS task_review_decisions;
ALTER TABLE tasks DROP FOREIGN KEY fk_task_reviewer, DROP FOREIGN KEY fk_task_division;
ALTER TABLE tasks DROP CHECK chk_task_review_note, DROP CHECK chk_task_review_decision, DROP CHECK chk_task_review_origin;
ALTER TABLE tasks DROP COLUMN review_note, DROP COLUMN reviewed_at, DROP COLUMN reviewer_employee_id, DROP COLUMN review_state, DROP COLUMN creator_role, DROP COLUMN division_id;
ALTER TABLE project_members DROP COLUMN version, DROP COLUMN is_active, DROP COLUMN role_in_project;
ALTER TABLE employee_division_assignments DROP CHECK chk_temporary_assignment_dates, DROP COLUMN is_temporary, DROP COLUMN role_in_division;
ALTER TABLE employees DROP FOREIGN KEY fk_employee_profile_attachment;
ALTER TABLE employees DROP COLUMN profile_attachment_id, DROP COLUMN standard_weekly_active_minutes, DROP COLUMN standard_daily_active_minutes, DROP COLUMN office_location, DROP COLUMN employment_type, DROP COLUMN department;
ALTER TABLE divisions DROP COLUMN description;
