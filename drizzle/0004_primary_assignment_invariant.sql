-- BE-0112: MySQL permits multiple NULL values in a unique index. The generated
-- value is populated only for a current, active primary assignment, so the
-- database serializes competing writes for the same employee.
-- Recovery: drizzle/recovery/0004_primary_assignment_invariant.sql

ALTER TABLE employee_division_assignments
  ADD COLUMN current_primary_employee_id CHAR(36)
    GENERATED ALWAYS AS (
      IF(is_primary = TRUE AND is_active = TRUE AND effective_to IS NULL, employee_id, NULL)
    ) STORED,
  ADD UNIQUE KEY uq_assignment_current_primary (current_primary_employee_id);
