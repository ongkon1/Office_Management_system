-- Preserve the employee's requested range while allowing HR to approve a
-- smaller contiguous range. Existing approvals keep their current meaning.
-- Recovery: drizzle/recovery/0020_partial_leave_approval.sql

ALTER TABLE leave_requests
  ADD COLUMN approved_start_date DATE NULL AFTER requested_minutes,
  ADD COLUMN approved_end_date DATE NULL AFTER approved_start_date,
  ADD COLUMN approved_minutes INT UNSIGNED NULL AFTER approved_end_date,
  ADD CONSTRAINT chk_leave_approved_range CHECK (
    (approved_start_date IS NULL AND approved_end_date IS NULL AND approved_minutes IS NULL)
    OR
    (approved_start_date IS NOT NULL AND approved_end_date IS NOT NULL AND approved_minutes IS NOT NULL
      AND approved_start_date >= start_date
      AND approved_end_date <= end_date
      AND approved_end_date >= approved_start_date
      AND approved_minutes > 0
      AND approved_minutes <= requested_minutes)
  ),
  ADD KEY ix_leave_employee_approved_date(employee_id,approved_start_date,approved_end_date);

UPDATE leave_requests
SET approved_start_date=start_date,
    approved_end_date=end_date,
    approved_minutes=requested_minutes
WHERE status='approved';
