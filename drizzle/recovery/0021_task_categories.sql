-- Restore the pre-deployment backup to preserve category data before rolling back.
ALTER TABLE tasks DROP FOREIGN KEY fk_task_category, DROP COLUMN category_id;
DROP TABLE task_categories;
