-- Refuse a lossy rollback after HR has used reduced approval. Full approvals
-- can safely return to the pre-0020 representation.
DROP PROCEDURE IF EXISTS recover_0020_partial_leave_approval;
DELIMITER $$
CREATE PROCEDURE recover_0020_partial_leave_approval()
BEGIN
  IF EXISTS (
    SELECT 1 FROM leave_requests
    WHERE approved_start_date IS NOT NULL
      AND (approved_start_date <> start_date
        OR approved_end_date <> end_date
        OR approved_minutes <> requested_minutes)
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='0020 recovery refused: reduced leave approvals would be lost';
  END IF;
END$$
DELIMITER ;
CALL recover_0020_partial_leave_approval();
DROP PROCEDURE recover_0020_partial_leave_approval;

ALTER TABLE leave_requests
  DROP INDEX ix_leave_employee_approved_date,
  DROP CHECK chk_leave_approved_range,
  DROP COLUMN approved_minutes,
  DROP COLUMN approved_end_date,
  DROP COLUMN approved_start_date;
