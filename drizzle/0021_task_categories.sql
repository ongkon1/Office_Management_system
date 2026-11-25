-- Recovery: drizzle/recovery/0021_task_categories.sql
CREATE TABLE task_categories (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(120) COLLATE utf8mb4_0900_as_ci NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_task_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE tasks ADD COLUMN category_id CHAR(36) NULL,
  ADD CONSTRAINT fk_task_category FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE RESTRICT;
