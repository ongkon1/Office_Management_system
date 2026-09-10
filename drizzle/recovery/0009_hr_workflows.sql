-- Phase 5 recovery requires a verified backup restore or forward repair.
-- Preserve leave reservations, immutable workflow history, published evaluations
-- and pending jobs. Do not drop these tables after business writes.
SELECT 'Restore the verified pre-0009 backup into an isolated database and reconcile before switching traffic' AS recovery_instruction;
