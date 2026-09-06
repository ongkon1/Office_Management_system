-- BE-0134: audit evidence is append-only for every application identity.
-- Recovery: drop these two triggers only as the migration owner during an
-- explicitly approved recovery; ordinary application users cannot alter them.
CREATE TRIGGER audit_events_prevent_update
BEFORE UPDATE ON audit_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events is append-only';

CREATE TRIGGER audit_events_prevent_delete
BEFORE DELETE ON audit_events
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events is append-only';
