-- Recovery for 0013_department_hierarchy.sql.
--
-- Restores the pre-change schema exactly: the legacy columns are untouched by
-- the forward migration, so reversing it loses no legacy fact. What it does
-- discard is everything the hierarchy added — the catalogue, the appointments,
-- the per-assignment placement and the review record — so run it only while
-- those are still migration output and not yet operational history. After an
-- administrator has created or changed a department, treat this as data loss
-- and recover from a backup instead.
--
-- Order matters: the triggers go first so the placement column can be cleared,
-- then the child foreign key, then the tables that reference departments.

DROP TRIGGER IF EXISTS assignment_legacy_lead_read_only;
DROP TRIGGER IF EXISTS employees_legacy_department_read_only;

ALTER TABLE employee_division_assignments DROP FOREIGN KEY fk_assignments_department;
ALTER TABLE employee_division_assignments
  DROP KEY ix_assignment_department_effective,
  DROP KEY ix_assignment_department,
  DROP COLUMN department_id;

DROP TABLE department_migration_reconciliation;
DROP TABLE department_migration_review;
DROP TABLE department_lead_assignments;
DROP TABLE departments;
