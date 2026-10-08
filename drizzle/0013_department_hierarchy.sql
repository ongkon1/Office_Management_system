-- OH-BE-0101 … OH-BE-0111: division-owned departments, effective-dated
-- department leadership, per-assignment placement, and a reviewable backfill of
-- the legacy employee-level department string.
--
-- Nothing legacy is dropped here. `employees.department` and
-- `employee_division_assignments.lead_employee_id` stay in place and readable
-- for the compatibility deployment, frozen by triggers at the end of this file;
-- their removal is a later cutover migration gated on reconciliation approval
-- (`OH-BE-0115`).
--
-- Recovery: drizzle/recovery/0013_department_hierarchy.sql

-- ---------------------------------------------------------------------------
-- OH-BE-0101, OH-BE-0102: the department catalogue.
--
-- `normalized_name` and `normalized_code` are generated, not supplied, so the
-- uniqueness the product promises — unique *inside a division*, so two
-- divisions may each own a "Sales" — cannot be defeated by casing or padding,
-- and no application code can forget to normalize before writing.
--
-- `uq_departments_id_division` exists for a foreign key, not for lookups: it
-- lets `employee_division_assignments` reference (department_id, division_id)
-- as a pair, which makes a cross-division placement unrepresentable rather
-- than merely validated.
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
  id CHAR(36) PRIMARY KEY,
  division_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  code VARCHAR(32) NOT NULL,
  normalized_name VARCHAR(160) GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED NOT NULL,
  normalized_code VARCHAR(32) GENERATED ALWAYS AS (LOWER(TRIM(code))) STORED NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at DATETIME(6) NULL,
  deactivation_reason VARCHAR(200) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_user_id CHAR(36) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  updated_by_user_id CHAR(36) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_departments_division_name(division_id,normalized_name),
  UNIQUE KEY uq_departments_division_code(division_id,normalized_code),
  UNIQUE KEY uq_departments_id_division(id,division_id),
  KEY ix_departments_division_active(division_id,is_active,normalized_name),
  CHECK(CHAR_LENGTH(TRIM(name)) > 0),
  CHECK(CHAR_LENGTH(TRIM(code)) >= 2),
  CHECK(is_active = TRUE OR deactivated_at IS NOT NULL),
  CONSTRAINT fk_departments_division FOREIGN KEY(division_id) REFERENCES divisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_departments_created_by FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_departments_updated_by FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- OH-BE-0103, OH-BE-0107: effective-dated leadership.
--
-- One row per appointment, closed by giving it an `effective_to`. Two database
-- guarantees sit under the service's transactional check:
--
--   * `uq_department_lead_start` — no two appointments for one department may
--     start on the same date, which is the collision an administrator is most
--     likely to create by repeating a save.
--   * `uq_department_single_open_period` — the generated marker carries the
--     department id only while `effective_to` is NULL, and MySQL allows many
--     NULLs in a unique index, so a department can have at most one open-ended
--     appointment no matter how writes interleave (the 0004 pattern).
--
-- Arbitrary closed-range overlap still needs the locked transactional check in
-- the repository; these two keys make the common races impossible rather than
-- merely unlikely.
-- ---------------------------------------------------------------------------
CREATE TABLE department_lead_assignments (
  id CHAR(36) PRIMARY KEY,
  department_id CHAR(36) NOT NULL,
  lead_employee_id CHAR(36) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  reason VARCHAR(200) NULL,
  open_period_marker CHAR(36) GENERATED ALWAYS AS (IF(effective_to IS NULL, department_id, NULL)) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_user_id CHAR(36) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  updated_by_user_id CHAR(36) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY uq_department_lead_start(department_id,effective_from),
  UNIQUE KEY uq_department_single_open_period(open_period_marker),
  KEY ix_department_lead_effective(department_id,effective_from,effective_to),
  KEY ix_department_lead_employee(lead_employee_id,effective_from,effective_to),
  CHECK(effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT fk_department_lead_department FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_department_lead_employee FOREIGN KEY(lead_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_department_lead_created_by FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_department_lead_updated_by FOREIGN KEY(updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- OH-BE-0104, OH-BE-0105: placement belongs to the division assignment.
--
-- Nullable on purpose: a legacy assignment the backfill cannot map keeps
-- working and is listed for review instead of being guessed at or dropped. The
-- composite foreign key is the same-division invariant — a NULL in either
-- column skips the check, and any non-NULL pair must exist in `departments`
-- with that exact division.
-- ---------------------------------------------------------------------------
ALTER TABLE employee_division_assignments
  ADD COLUMN department_id CHAR(36) NULL AFTER division_id,
  ADD KEY ix_assignment_department(department_id,division_id),
  ADD KEY ix_assignment_department_effective(department_id,effective_from,effective_to,is_active),
  ADD CONSTRAINT fk_assignments_department FOREIGN KEY(department_id,division_id) REFERENCES departments(id,division_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- OH-BE-0110: the migration-review record.
--
-- A backfill that silently guesses is worse than one that reports. Every row
-- the mapping could not settle lands here with the ids an administrator needs
-- to fix it, and the reconciliation row carries counts whose CHECK makes the
-- arithmetic self-proving: mapped + unmapped = active.
-- ---------------------------------------------------------------------------
CREATE TABLE department_migration_review (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  issue_type ENUM(
    'legacy_department_missing',
    'unmapped_assignment',
    'cross_division_department',
    'conflicting_legacy_lead',
    'ineligible_legacy_lead',
    'legacy_lead_disagrees',
    'generated_code_needs_review'
  ) NOT NULL,
  division_id CHAR(36) NULL,
  department_id CHAR(36) NULL,
  employee_id CHAR(36) NULL,
  assignment_id CHAR(36) NULL,
  legacy_value VARCHAR(160) NULL,
  detail VARCHAR(400) NOT NULL,
  recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_department_review_issue(issue_type,division_id)
) ENGINE=InnoDB;

CREATE TABLE department_migration_reconciliation (
  id TINYINT PRIMARY KEY,
  legacy_combination_count INT UNSIGNED NOT NULL,
  department_count INT UNSIGNED NOT NULL,
  active_assignment_count INT UNSIGNED NOT NULL,
  mapped_assignment_count INT UNSIGNED NOT NULL,
  unmapped_assignment_count INT UNSIGNED NOT NULL,
  lead_period_count INT UNSIGNED NOT NULL,
  review_row_count INT UNSIGNED NOT NULL,
  reconciled_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CHECK(mapped_assignment_count + unmapped_assignment_count = active_assignment_count)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- OH-BE-0108: one department per distinct (division, legacy department name)
-- combination reachable through an active assignment.
--
-- Ids are derived from MD5 of the division and the normalized name rather than
-- `UUID()`: the same database state always produces the same ids, so a
-- rehearsal and the real run can be compared row by row, and re-running the
-- backfill in a recovery drill cannot fork the catalogue.
--
-- The code is derived from the name with a short hash of the same key that
-- makes the row unique, because a derived prefix alone collides (two names can
-- share eight alphanumerics) and a failed unique key would abort the whole
-- migration. Every derived code is listed for review so an administrator can
-- replace it with the one the division actually uses.
-- ---------------------------------------------------------------------------
INSERT INTO departments(id,division_id,name,code,description,is_active)
SELECT
  LOWER(CONCAT(
    SUBSTR(source.hash,1,8),'-',SUBSTR(source.hash,9,4),'-4',SUBSTR(source.hash,14,3),
    '-8',SUBSTR(source.hash,18,3),'-',SUBSTR(source.hash,21,12))),
  source.division_id,
  source.legacy_name,
  CONCAT(
    UPPER(LEFT(NULLIF(REGEXP_REPLACE(source.legacy_name,'[^A-Za-z0-9]',''),''),8)),
    '-',
    UPPER(SUBSTR(source.hash,1,3))),
  'Backfilled from the legacy employee department during migration 0013.',
  TRUE
FROM (
  SELECT DISTINCT
    a.division_id AS division_id,
    TRIM(e.department) AS legacy_name,
    MD5(CONCAT(a.division_id,':',LOWER(TRIM(e.department)))) AS hash
  FROM employee_division_assignments a
  JOIN employees e ON e.id = a.employee_id
  WHERE a.is_active = TRUE
    AND e.department IS NOT NULL
    AND TRIM(e.department) <> ''
    AND REGEXP_REPLACE(e.department,'[^A-Za-z0-9]','') <> ''
) source;

-- OH-BE-0109: map every active assignment whose employee's legacy department
-- names a department in that same division. An assignment that does not match
-- stays NULL and is reported, never guessed.
UPDATE employee_division_assignments a
  JOIN employees e ON e.id = a.employee_id
  JOIN departments d
    ON d.division_id = a.division_id
   AND d.normalized_name = LOWER(TRIM(e.department))
SET a.department_id = d.id
WHERE a.department_id IS NULL
  AND a.is_active = TRUE
  AND e.department IS NOT NULL
  AND TRIM(e.department) <> '';

-- OH-BE-0109: an initial open lead period per department, but only where the
-- legacy data says one thing. The period starts on the earliest date that data
-- attests the leadership — the earliest member assignment naming that lead, not
-- the migration date, so a historical authorization question still resolves. A department whose members disagree about their
-- legacy lead, or whose lead is no longer an active employee assigned to that
-- division, gets no appointment and is reported instead — inventing one would
-- hand somebody authority nobody granted.
INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,reason)
SELECT
  LOWER(CONCAT(
    SUBSTR(candidate.hash,1,8),'-',SUBSTR(candidate.hash,9,4),'-4',SUBSTR(candidate.hash,14,3),
    '-8',SUBSTR(candidate.hash,18,3),'-',SUBSTR(candidate.hash,21,12))),
  candidate.department_id,
  candidate.lead_employee_id,
  candidate.effective_from,
  'Backfilled from the legacy assignment lead during migration 0013.'
FROM (
  SELECT
    a.department_id AS department_id,
    MIN(a.lead_employee_id) AS lead_employee_id,
    MIN(a.effective_from) AS effective_from,
    COUNT(DISTINCT a.lead_employee_id) AS lead_count,
    MD5(CONCAT(a.department_id,':',MIN(a.lead_employee_id))) AS hash
  FROM employee_division_assignments a
  WHERE a.department_id IS NOT NULL
    AND a.lead_employee_id IS NOT NULL
    AND a.is_active = TRUE
  GROUP BY a.department_id
  HAVING COUNT(DISTINCT a.lead_employee_id) = 1
) candidate
JOIN departments d ON d.id = candidate.department_id
JOIN employees lead_employee ON lead_employee.id = candidate.lead_employee_id AND lead_employee.status = 'active'
WHERE EXISTS (
  SELECT 1 FROM employee_division_assignments la
  WHERE la.employee_id = candidate.lead_employee_id
    AND la.division_id = d.division_id
    AND la.is_active = TRUE
    AND (la.effective_to IS NULL OR la.effective_to >= CURRENT_DATE)
);

-- OH-BE-0110: everything the backfill could not settle, with its ids.
INSERT INTO department_migration_review(issue_type,division_id,department_id,employee_id,assignment_id,legacy_value,detail)
SELECT 'legacy_department_missing',a.division_id,NULL,a.employee_id,a.id,NULL,
  'The employee has no legacy department value, so this active assignment has no department placement.'
FROM employee_division_assignments a
JOIN employees e ON e.id = a.employee_id
WHERE a.is_active = TRUE AND a.department_id IS NULL
  AND (e.department IS NULL OR TRIM(e.department) = '');

INSERT INTO department_migration_review(issue_type,division_id,department_id,employee_id,assignment_id,legacy_value,detail)
SELECT 'unmapped_assignment',a.division_id,NULL,a.employee_id,a.id,TRIM(e.department),
  'The legacy department name matches no department in this assignment division.'
FROM employee_division_assignments a
JOIN employees e ON e.id = a.employee_id
WHERE a.is_active = TRUE AND a.department_id IS NULL
  AND e.department IS NOT NULL AND TRIM(e.department) <> '';

-- A legacy department name is an employee-level string, so an employee working
-- in two divisions produces the same name in both. That is legitimate — names
-- are unique only inside a division — but it is also what an employee counted
-- twice looks like, so every such pair is listed for confirmation rather than
-- assumed correct.
INSERT INTO department_migration_review(issue_type,division_id,department_id,employee_id,assignment_id,legacy_value,detail)
SELECT 'cross_division_department',d.division_id,d.id,NULL,NULL,d.name,
  CONCAT('A department with this name also exists in division ',other.division_id,
         '. Confirm they are separate departments rather than one employee recorded in two divisions.')
FROM departments d
JOIN departments other ON other.normalized_name = d.normalized_name AND other.division_id <> d.division_id;

INSERT INTO department_migration_review(issue_type,division_id,department_id,employee_id,assignment_id,legacy_value,detail)
SELECT 'conflicting_legacy_lead',d.division_id,d.id,NULL,NULL,NULL,
  CONCAT('Members of this department name ',conflict.lead_count,' different legacy leads, so no appointment was created.')
FROM (
  SELECT a.department_id AS department_id, COUNT(DISTINCT a.lead_employee_id) AS lead_count
  FROM employee_division_assignments a
  WHERE a.department_id IS NOT NULL AND a.lead_employee_id IS NOT NULL AND a.is_active = TRUE
  GROUP BY a.department_id
  HAVING COUNT(DISTINCT a.lead_employee_id) > 1
) conflict
JOIN departments d ON d.id = conflict.department_id;

INSERT INTO department_migration_review(issue_type,division_id,department_id,employee_id,assignment_id,legacy_value,detail)
SELECT 'ineligible_legacy_lead',d.division_id,d.id,single.lead_employee_id,NULL,NULL,
  'The single legacy lead is inactive or has no effective assignment in this division, so no appointment was created.'
FROM (
  SELECT a.department_id AS department_id, MIN(a.lead_employee_id) AS lead_employee_id
  FROM employee_division_assignments a
  WHERE a.department_id IS NOT NULL AND a.lead_employee_id IS NOT NULL AND a.is_active = TRUE
  GROUP BY a.department_id
  HAVING COUNT(DISTINCT a.lead_employee_id) = 1
) single
JOIN departments d ON d.id = single.department_id
WHERE NOT EXISTS (
  SELECT 1 FROM department_lead_assignments dla WHERE dla.department_id = single.department_id
);

-- For Phase B3: a mapped assignment whose frozen legacy lead is not the
-- department's appointed lead. Routing still reads the legacy column during the
-- compatibility deployment, so every disagreement is listed before any reader
-- is switched over.
INSERT INTO department_migration_review(issue_type,division_id,department_id,employee_id,assignment_id,legacy_value,detail)
SELECT 'legacy_lead_disagrees',a.division_id,a.department_id,a.employee_id,a.id,a.lead_employee_id,
  'The legacy assignment lead differs from the department appointment effective today.'
FROM employee_division_assignments a
JOIN department_lead_assignments dla
  ON dla.department_id = a.department_id
 AND dla.effective_from <= CURRENT_DATE
 AND (dla.effective_to IS NULL OR dla.effective_to >= CURRENT_DATE)
WHERE a.is_active = TRUE
  AND a.department_id IS NOT NULL
  AND a.lead_employee_id IS NOT NULL
  AND a.lead_employee_id <> dla.lead_employee_id;

INSERT INTO department_migration_review(issue_type,division_id,department_id,employee_id,assignment_id,legacy_value,detail)
SELECT 'generated_code_needs_review',d.division_id,d.id,NULL,NULL,d.code,
  'The code was derived from the department name during the backfill. Replace it with the code the division uses.'
FROM departments d
WHERE d.description = 'Backfilled from the legacy employee department during migration 0013.';

INSERT INTO department_migration_reconciliation(
  id,legacy_combination_count,department_count,active_assignment_count,
  mapped_assignment_count,unmapped_assignment_count,lead_period_count,review_row_count)
SELECT
  1,
  (SELECT COUNT(*) FROM (
     SELECT DISTINCT a.division_id, LOWER(TRIM(e.department))
     FROM employee_division_assignments a JOIN employees e ON e.id = a.employee_id
     WHERE a.is_active = TRUE AND e.department IS NOT NULL AND TRIM(e.department) <> ''
   ) combinations),
  (SELECT COUNT(*) FROM departments),
  (SELECT COUNT(*) FROM employee_division_assignments WHERE is_active = TRUE),
  (SELECT COUNT(*) FROM employee_division_assignments WHERE is_active = TRUE AND department_id IS NOT NULL),
  (SELECT COUNT(*) FROM employee_division_assignments WHERE is_active = TRUE AND department_id IS NULL),
  (SELECT COUNT(*) FROM department_lead_assignments),
  (SELECT COUNT(*) FROM department_migration_review);

-- ---------------------------------------------------------------------------
-- OH-BE-0111: the legacy columns are frozen, not removed.
--
-- These triggers coerce rather than signal, which is the 0011
-- `historical_time_entries_immutable` pattern and the only safe choice for a
-- compatibility deployment: legacy writers keep working, but whatever they send
-- for a legacy column is ignored and the migrated value is preserved. The
-- application service refuses the same change with a typed result and guidance,
-- so a person is told; this is the backstop for everything that bypasses it.
--
-- An INSERT may still carry a legacy lead, because routing (HR requests,
-- evaluations, notifications, task review) still reads that column until
-- Phase B3 switches those readers to department leadership. Every disagreement
-- between the two is already listed in `department_migration_review`.
-- ---------------------------------------------------------------------------
CREATE TRIGGER employees_legacy_department_read_only BEFORE UPDATE ON employees FOR EACH ROW
SET NEW.department = OLD.department;

CREATE TRIGGER assignment_legacy_lead_read_only BEFORE UPDATE ON employee_division_assignments FOR EACH ROW
SET NEW.lead_employee_id = OLD.lead_employee_id;
