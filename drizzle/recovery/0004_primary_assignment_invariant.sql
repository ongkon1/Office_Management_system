-- Recovery for 0004. Confirm no application release depends on this invariant.
ALTER TABLE employee_division_assignments
  DROP INDEX uq_assignment_current_primary,
  DROP COLUMN current_primary_employee_id;
