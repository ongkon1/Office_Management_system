-- Recovery: drizzle/recovery/0022_task_billability.sql
ALTER TABLE tasks
  ADD COLUMN billing_type ENUM('billable', 'non_billable') NULL;
