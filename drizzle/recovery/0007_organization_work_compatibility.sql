-- Restore the pre-0007 backup with the matching application release if necessary.
-- Do not discard profile-photo references after writes; prefer a forward fix.
SELECT 'Reconcile profile_attachment_id and profile_photo_attachment_id before recovery' AS recovery_guidance;
