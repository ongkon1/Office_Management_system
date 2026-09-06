-- Align persistence enums/fields with the stable frontend domain contracts.
-- Recovery: reverse only before contract-backed data exists; otherwise roll forward.
ALTER TABLE projects
  MODIFY status ENUM('planned','active','on_hold','completed','closed') NOT NULL,
  ADD COLUMN start_date DATE NULL AFTER manager_employee_id,
  ADD COLUMN end_date DATE NULL AFTER start_date,
  ADD COLUMN description TEXT NULL AFTER priority,
  ADD COLUMN completion_percent SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER description,
  ADD COLUMN accepts_time_entries BOOLEAN NOT NULL DEFAULT TRUE AFTER status,
  ADD CONSTRAINT chk_project_dates CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT chk_project_completion CHECK(completion_percent <= 100);

UPDATE tasks SET status = CASE status WHEN 'done' THEN 'completed' WHEN 'in_progress' THEN 'in_progress' ELSE 'pending' END;
ALTER TABLE tasks
  MODIFY status ENUM('pending','in_progress','completed') NOT NULL,
  MODIFY priority ENUM('low','medium','high','urgent') NULL,
  ADD COLUMN creator_employee_id CHAR(36) NULL AFTER assignee_employee_id,
  ADD COLUMN start_date DATE NULL AFTER estimated_minutes,
  ADD CONSTRAINT fk_tasks_creator FOREIGN KEY(creator_employee_id) REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE time_entries
  MODIFY entry_method ENUM('manual_clock','manual_duration','timer','copied','imported') NOT NULL,
  MODIFY work_location ENUM('office','wfh','hybrid','field_work','client_office','official_travel','training_venue') NOT NULL,
  MODIFY status ENUM('draft','saved','locked') NOT NULL DEFAULT 'saved',
  ADD COLUMN cross_midnight_group_id CHAR(36) NULL AFTER critical_explanation;

ALTER TABLE wfh_requests MODIFY portion ENUM('full_day','half_day') NOT NULL;
ALTER TABLE leave_requests MODIFY portion ENUM('full_day','half_day') NOT NULL;
ALTER TABLE export_jobs MODIFY format ENUM('excel','csv','pdf','print') NOT NULL;

ALTER TABLE employees
  ADD COLUMN preferred_name VARCHAR(160) NULL AFTER display_name,
  ADD COLUMN personal_email VARCHAR(254) NULL AFTER job_title,
  ADD COLUMN phone VARCHAR(48) NULL AFTER personal_email,
  ADD COLUMN emergency_contact JSON NULL AFTER phone,
  ADD COLUMN address JSON NULL AFTER emergency_contact,
  ADD COLUMN skills JSON NULL AFTER address,
  ADD COLUMN normal_work_mode VARCHAR(32) NOT NULL DEFAULT 'office' AFTER skills;
