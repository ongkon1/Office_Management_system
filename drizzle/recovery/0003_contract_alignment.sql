-- Destructive enum rollback; permitted only before contract-aligned values exist.
ALTER TABLE employees DROP COLUMN normal_work_mode, DROP COLUMN skills, DROP COLUMN address, DROP COLUMN emergency_contact, DROP COLUMN phone, DROP COLUMN personal_email, DROP COLUMN preferred_name;
ALTER TABLE export_jobs MODIFY format ENUM('xlsx','csv','pdf','print') NOT NULL;
ALTER TABLE leave_requests MODIFY portion ENUM('full_day','first_half','second_half') NOT NULL;
ALTER TABLE wfh_requests MODIFY portion ENUM('full_day','first_half','second_half') NOT NULL;
ALTER TABLE time_entries DROP COLUMN cross_midnight_group_id, MODIFY status ENUM('draft','saved','amended') NOT NULL, MODIFY work_location ENUM('office','wfh','client_site','field','other') NOT NULL, MODIFY entry_method ENUM('manual_clock','manual_duration','timer','calendar_draft') NOT NULL;
ALTER TABLE tasks DROP FOREIGN KEY fk_tasks_creator, DROP COLUMN start_date, DROP COLUMN creator_employee_id, MODIFY priority VARCHAR(32), MODIFY status ENUM('backlog','todo','in_progress','blocked','done','cancelled') NOT NULL;
ALTER TABLE projects DROP CHECK chk_project_completion, DROP CHECK chk_project_dates, DROP COLUMN accepts_time_entries, DROP COLUMN completion_percent, DROP COLUMN description, DROP COLUMN end_date, DROP COLUMN start_date, MODIFY status ENUM('draft','active','on_hold','closed') NOT NULL;
