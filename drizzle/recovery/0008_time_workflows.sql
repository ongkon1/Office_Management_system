-- Stop web and workers before recovery. Restore the pre-0008 database backup
-- and matching application release; reconcile all entries, timer drafts,
-- verification snapshots, audit events and pending outbox events before reopening.
-- Do not drop snapshot or outbox columns after accepting writes: doing so loses
-- verified evidence and notification delivery obligations. Prefer a forward fix.
SELECT 'Restore tested pre-migration backup in an isolated environment first' AS recovery_guidance;
