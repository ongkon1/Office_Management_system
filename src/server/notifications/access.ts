import type { RowDataPacket } from 'mysql2/promise';
import { hasPermission, type ActorPolicyContext } from '@/server/authorization/policy';
import {
  canSeeGovernment,
  documentReach,
  employeeReach,
  evaluationReach,
  messageScopeReach,
  projectReach,
  taskReach,
  type Executor,
  type MessageScopeType,
} from '@/server/authorization/record-access';
import type { RelatedRecord } from './catalogue';

type Row = RowDataPacket & Record<string, unknown>;

/**
 * `BE-0705`. May this actor open the record a notification (or a webhook
 * event) points at? Asked twice: before a notification is created for a
 * recipient, and again whenever its link is offered — so a person who has
 * since lost access is shown a notification with no way into the record.
 *
 * Every branch reads the live row through the shared reach rules, and every
 * unknown or missing record answers `false`.
 */
export async function canOpenRelated(db: Executor, actor: ActorPolicyContext, related: RelatedRecord, date: string): Promise<boolean> {
  const one = async (sql: string, values: string[]) => {
    const [rows] = await db.execute<Row[]>(sql, values);
    return rows[0] ?? null;
  };
  switch (related.type) {
    case 'task':
      return Boolean(await taskReach(db, actor, related.id));
    case 'project':
      return Boolean(await projectReach(db, actor, related.id, date));
    case 'timesheet':
      return employeeReach(db, actor, related.employeeId, { date: related.date });
    case 'workload':
      return actor.employeeId !== related.employeeId
        && (hasPermission(actor, 'time.team.read') || actor.roles.includes('hr_manager') || actor.roles.includes('super_admin'))
        && employeeReach(db, actor, related.employeeId);
    case 'request': {
      const row = await one(related.kind === 'wfh'
        ? 'SELECT r.employee_id,d.is_government FROM wfh_requests r JOIN divisions d ON d.id=r.division_id WHERE r.id=?'
        : 'SELECT r.employee_id,FALSE is_government FROM leave_requests r WHERE r.id=?', [related.id]);
      if (!row || (row.is_government && !canSeeGovernment(actor))) return false;
      return employeeReach(db, actor, String(row.employee_id));
    }
    case 'evaluation':
      return evaluationReach(db, actor, related.id);
    case 'remark': {
      const row = await one('SELECT employee_id,related_type,related_id,related_work_date FROM general_remarks WHERE id=?', [related.id]);
      if (!row) return false;
      if (row.related_type === 'task' && row.related_id && !(await taskReach(db, actor, String(row.related_id)))) return false;
      const workDate = row.related_work_date instanceof Date ? row.related_work_date.toISOString().slice(0, 10) : row.related_work_date ? String(row.related_work_date) : undefined;
      return employeeReach(db, actor, String(row.employee_id), { date: workDate });
    }
    case 'period':
      return Boolean(await one('SELECT id FROM timesheet_periods WHERE id=?', [related.id])) && actor.employeeId !== null;
    case 'export':
      return Boolean(await one('SELECT id FROM export_jobs WHERE id=? AND requested_by_user_id=?', [related.id, actor.userId]));
    case 'message': {
      const row = await one('SELECT scope_type,scope_id FROM messages WHERE id=?', [related.id]);
      return Boolean(row && await messageScopeReach(db, actor, String(row.scope_type) as MessageScopeType, String(row.scope_id), date));
    }
    case 'document':
      return Boolean(await documentReach(db, actor, related.id, date));
    case 'requisition': {
      const row = await one('SELECT submitter_user_id,assigned_team_lead_employee_id,stage FROM requisitions WHERE id=?', [related.id]);
      if (!row) return false;
      if (String(row.submitter_user_id) === actor.userId) return true;
      if (row.assigned_team_lead_employee_id && String(row.assigned_team_lead_employee_id) === actor.employeeId) return true;
      return row.stage !== 'team_lead_review' && (actor.roles.includes('hr_manager') || actor.roles.includes('super_admin'));
    }
    case 'conveyance': {
      const row = await one('SELECT submitter_user_id,assigned_team_lead_employee_id,stage FROM conveyance_claims WHERE id=?', [related.id]);
      if (!row) return false;
      if (String(row.submitter_user_id) === actor.userId) return true;
      if (row.assigned_team_lead_employee_id && String(row.assigned_team_lead_employee_id) === actor.employeeId) return true;
      return row.stage !== 'team_lead_review' && (actor.roles.includes('hr_manager') || actor.roles.includes('super_admin'));
    }
  }
}
