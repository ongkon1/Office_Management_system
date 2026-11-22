-- Reverses only assignments/grants created by migration 0018. Historical
-- decisions and the original Finance user-role rows were never rewritten.
INSERT INTO audit_events(
  event_id,actor_user_id,action,resource_type,resource_id,scope_json,reason,
  correlation_id,before_protected,after_protected
)
SELECT
  UUID(),NULL,'role.finance_consolidation_rolled_back','user',user_id,
  JSON_OBJECT('initiator','schema_recovery','migration','0018'),
  'Rollback of Finance Manager to HR role consolidation.',UUID(),
  JSON_OBJECT('activeRole','hr_manager','financeManagerAssignable',FALSE),
  JSON_OBJECT('activeRole','finance_manager','financeManagerAssignable',TRUE)
FROM role_consolidation_migration_users;

DELETE sg FROM scoped_grants sg
JOIN role_consolidation_migration_users m ON m.created_cost_grant_id=sg.id;

DELETE ur FROM user_roles ur
JOIN role_consolidation_migration_users m ON m.created_hr_role_id=ur.id;

UPDATE roles SET is_active=TRUE WHERE role_key='finance_manager';
DROP TABLE role_consolidation_migration_users;

