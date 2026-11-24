-- Preserve any request or balance created after rollout, but stop offering the
-- migration-owned type for new requests. Historical foreign keys remain valid.
UPDATE leave_types
SET is_active=FALSE
WHERE id='b1000000-0000-4000-8000-000000000005' AND type_key='earned';
