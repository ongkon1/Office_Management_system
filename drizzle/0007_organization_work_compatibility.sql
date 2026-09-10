-- Complete the non-duplicated additions from the conflicting second 0006 file.
-- Original 0006_organization_work.sql remains unchanged for checksum safety.
-- Recovery: drizzle/recovery/0007_organization_work_compatibility.sql
ALTER TABLE divisions ADD COLUMN team_lead_employee_id CHAR(36) NULL,
 ADD CONSTRAINT fk_divisions_team_lead FOREIGN KEY(team_lead_employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE employees ADD COLUMN profile_photo_attachment_id CHAR(36) NULL,
 ADD CONSTRAINT fk_employee_profile_photo FOREIGN KEY(profile_photo_attachment_id) REFERENCES attachments(id) ON DELETE RESTRICT;
UPDATE employees SET profile_photo_attachment_id=profile_attachment_id;
CREATE VIEW project_actual_minutes AS
 SELECT p.id project_id,COALESCE(SUM(te.active_minutes),0) actual_minutes
 FROM projects p LEFT JOIN time_entries te ON te.project_id=p.id AND te.is_active=TRUE AND te.status IN('saved','locked') GROUP BY p.id;
CREATE VIEW task_actual_minutes AS
 SELECT t.id task_id,COALESCE(SUM(te.active_minutes),0) actual_minutes
 FROM tasks t LEFT JOIN time_entries te ON te.task_id=t.id AND te.is_active=TRUE AND te.status IN('saved','locked') GROUP BY t.id;
