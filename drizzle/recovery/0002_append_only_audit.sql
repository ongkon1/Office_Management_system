-- Recovery: safe removal of only the append-only triggers.
DROP TRIGGER IF EXISTS audit_events_prevent_update;
DROP TRIGGER IF EXISTS audit_events_prevent_delete;
