import mysql from 'mysql2/promise';
import { migrationDatabaseUrl } from './db-lib.mjs';

const connection = await mysql.createConnection({ uri: migrationDatabaseUrl(), timezone: 'Z' });
try {
  const [[summary]] = await connection.query(`
    SELECT
      COUNT(*) affected_users,
      COALESCE(SUM(had_hr_role),0) already_hr,
      COALESCE(SUM(created_hr_role_id IS NOT NULL),0) hr_roles_created,
      COALESCE(SUM(had_role_cost_permission OR had_personal_cost_grant),0) cost_access_before,
      COALESCE(SUM(created_cost_grant_id IS NOT NULL),0) cost_grants_created
    FROM role_consolidation_migration_users
  `);
  const [[role]] = await connection.query(
    "SELECT is_active FROM roles WHERE role_key='finance_manager'",
  );
  const [[hrCost]] = await connection.query(`
    SELECT COUNT(*) count FROM role_permissions rp
    JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
    WHERE r.role_key='hr_manager' AND p.permission_key='finance.cost.view'
  `);
  const [[history]] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM requisition_reviews WHERE reviewer_role='finance_manager') finance_requisition_reviews,
      (SELECT COUNT(*) FROM conveyance_reviews WHERE reviewer_role='finance_manager') finance_conveyance_reviews,
      (SELECT COUNT(*) FROM audit_events WHERE action='role.finance_consolidated') migration_audits
  `);
  console.log(JSON.stringify({
    financeRoleAssignable: Boolean(role?.is_active),
    hrRoleHasCostPermission: Number(hrCost.count) > 0,
    affectedUsers: Number(summary.affected_users),
    alreadyHr: Number(summary.already_hr),
    hrRolesCreated: Number(summary.hr_roles_created),
    costAccessBefore: Number(summary.cost_access_before),
    costGrantsCreated: Number(summary.cost_grants_created),
    historicalFinanceRequisitionReviews: Number(history.finance_requisition_reviews),
    historicalFinanceConveyanceReviews: Number(history.finance_conveyance_reviews),
    migrationAuditEvents: Number(history.migration_audits),
  }, null, 2));
} finally {
  await connection.end();
}
