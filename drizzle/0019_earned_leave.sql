-- Adds Earned Leave as a paid, half-day-capable leave type. Entitlement is
-- assigned explicitly by a Super Administrator; this migration creates no
-- employee balances and changes no historical request.
-- Recovery: drizzle/recovery/0019_earned_leave.sql

INSERT IGNORE INTO leave_types(
  id,type_key,name,is_paid,requires_attachment,is_active,allows_half_day
) VALUES(
  'b1000000-0000-4000-8000-000000000005','earned','Earned Leave',TRUE,FALSE,TRUE,TRUE
);

-- Apply the approved presentation only to the deterministic record introduced
-- above. If an owner-created `earned` type already existed under another id,
-- INSERT IGNORE leaves that record untouched.
UPDATE leave_types
SET name='Earned Leave',is_paid=TRUE,requires_attachment=FALSE,is_active=TRUE,allows_half_day=TRUE
WHERE id='b1000000-0000-4000-8000-000000000005' AND type_key='earned';
