-- BE-1201..BE-1210: retire Finance Manager for assignment while preserving history.
-- This migration deliberately does NOT grant finance.cost.view to the HR role.
-- That wider role grant belongs to BE-1401/BE-1402 and must cut over with Frontend Phase 12.
-- Recovery: drizzle/recovery/0018_finance_role_consolidation.sql

CREATE TABLE role_consolidation_migration_users (
  user_id CHAR(36) PRIMARY KEY,
  finance_user_role_id CHAR(36) NOT NULL,
  had_hr_role BOOLEAN NOT NULL,
  had_role_cost_permission BOOLEAN NOT NULL,
  had_personal_cost_grant BOOLEAN NOT NULL,
  created_hr_role_id CHAR(36) NULL,
  created_cost_grant_id CHAR(36) NULL,
  migrated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_role_consolidation_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO role_consolidation_migration_users(
  user_id,finance_user_role_id,had_hr_role,had_role_cost_permission,had_personal_cost_grant
)
SELECT ur.user_id,MIN(ur.id),
  EXISTS(
    SELECT 1 FROM user_roles hur JOIN roles hr ON hr.id=hur.role_id
    WHERE hur.user_id=ur.user_id AND hr.role_key='hr_manager'
      AND hur.effective_from<=CURRENT_DATE AND (hur.effective_to IS NULL OR hur.effective_to>=CURRENT_DATE)
  ),
  EXISTS(
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=fr.id AND p.permission_key='finance.cost.view'
  ),
  EXISTS(
    SELECT 1 FROM scoped_grants sg JOIN permissions p ON p.id=sg.permission_id
    WHERE sg.user_id=ur.user_id AND p.permission_key='finance.cost.view'
      AND sg.division_id IS NULL AND sg.project_id IS NULL
      AND sg.effective_from<=CURRENT_DATE AND (sg.effective_to IS NULL OR sg.effective_to>=CURRENT_DATE)
  )
FROM user_roles ur JOIN roles fr ON fr.id=ur.role_id
WHERE fr.role_key='finance_manager'
  AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)
GROUP BY ur.user_id;

UPDATE role_consolidation_migration_users
SET created_hr_role_id=CONCAT(
  SUBSTR(MD5(CONCAT('phase12:hr:',user_id)),1,8),'-',
  SUBSTR(MD5(CONCAT('phase12:hr:',user_id)),9,4),'-4',
  SUBSTR(MD5(CONCAT('phase12:hr:',user_id)),14,3),'-8',
  SUBSTR(MD5(CONCAT('phase12:hr:',user_id)),18,3),'-',
  SUBSTR(MD5(CONCAT('phase12:hr:',user_id)),21,12)
)
WHERE had_hr_role=FALSE;

INSERT INTO user_roles(id,user_id,role_id,effective_from)
SELECT m.created_hr_role_id,m.user_id,hr.id,CURRENT_DATE
FROM role_consolidation_migration_users m JOIN roles hr ON hr.role_key='hr_manager'
WHERE m.created_hr_role_id IS NOT NULL;

UPDATE role_consolidation_migration_users
SET created_cost_grant_id=CONCAT(
  SUBSTR(MD5(CONCAT('phase12:cost:',user_id)),1,8),'-',
  SUBSTR(MD5(CONCAT('phase12:cost:',user_id)),9,4),'-4',
  SUBSTR(MD5(CONCAT('phase12:cost:',user_id)),14,3),'-8',
  SUBSTR(MD5(CONCAT('phase12:cost:',user_id)),18,3),'-',
  SUBSTR(MD5(CONCAT('phase12:cost:',user_id)),21,12)
)
WHERE had_role_cost_permission=TRUE AND had_personal_cost_grant=FALSE;

INSERT INTO scoped_grants(id,user_id,permission_id,effective_from)
SELECT m.created_cost_grant_id,m.user_id,p.id,CURRENT_DATE
FROM role_consolidation_migration_users m JOIN permissions p ON p.permission_key='finance.cost.view'
WHERE m.created_cost_grant_id IS NOT NULL;

-- Append one audit event per affected account. Historical Finance review rows
-- are intentionally not updated: their recorded actor role remains readable.
INSERT INTO audit_events(
  event_id,actor_user_id,action,resource_type,resource_id,scope_json,reason,
  correlation_id,before_protected,after_protected
)
SELECT
  CONCAT(SUBSTR(MD5(CONCAT('phase12:audit:',user_id)),1,8),'-',SUBSTR(MD5(CONCAT('phase12:audit:',user_id)),9,4),'-4',SUBSTR(MD5(CONCAT('phase12:audit:',user_id)),14,3),'-8',SUBSTR(MD5(CONCAT('phase12:audit:',user_id)),18,3),'-',SUBSTR(MD5(CONCAT('phase12:audit:',user_id)),21,12)),
  NULL,'role.finance_consolidated','user',user_id,
  JSON_OBJECT('initiator','schema_migration','migration','0018'),
  'Finance Manager role retired; HR capability assigned with existing cost access preserved exactly.',
  CONCAT(SUBSTR(MD5(CONCAT('phase12:correlation:',user_id)),1,8),'-',SUBSTR(MD5(CONCAT('phase12:correlation:',user_id)),9,4),'-4',SUBSTR(MD5(CONCAT('phase12:correlation:',user_id)),14,3),'-8',SUBSTR(MD5(CONCAT('phase12:correlation:',user_id)),18,3),'-',SUBSTR(MD5(CONCAT('phase12:correlation:',user_id)),21,12)),
  JSON_OBJECT('activeRole','finance_manager','hadHrRole',had_hr_role,'hadFinanceCostView',(had_role_cost_permission OR had_personal_cost_grant)),
  JSON_OBJECT('activeRole','hr_manager','financeManagerAssignable',FALSE,'financeCostViewPreserved',(had_role_cost_permission OR had_personal_cost_grant))
FROM role_consolidation_migration_users;

UPDATE roles SET is_active=FALSE WHERE role_key='finance_manager';

