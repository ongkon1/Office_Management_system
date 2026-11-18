import type { RowDataPacket } from 'mysql2/promise';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import {
  documentReach,
  employeeReach,
  evaluationReach,
  isOrganizationWide,
  isReadOnly,
  messageScopeReach,
  projectReach,
  taskReach,
  type Executor,
  type MessageScopeType,
} from '@/server/authorization/record-access';
import { canOpenRelated } from '@/server/notifications/access';
import type { AttachmentOwnerType } from './policy';
import { canViewApproval } from '@/lib/approval-chain';

type Row = RowDataPacket & Record<string, unknown>;

export interface OwnerAccess {
  /** May download the owner's clean attachments. */
  readonly read: boolean;
  /** May add an attachment to this owner. */
  readonly attach: boolean;
}

const NONE: OwnerAccess = { read: false, attach: false };

/**
 * `BE-0712`, `REQ-COM-003`. An attachment has exactly the visibility of the
 * record that owns it — there is no separate file permission to forget. Who
 * may *add* one is narrower: the person whose record it is, or whoever manages
 * the shared space. Management/View-Only never attaches anything.
 */
export async function ownerAccess(db: Executor, actor: ActorPolicyContext, ownerType: AttachmentOwnerType, ownerId: string, date: string): Promise<OwnerAccess> {
  const one = async (sql: string) => {
    const [rows] = await db.execute<Row[]>(sql, [ownerId]);
    return rows[0] ?? null;
  };
  const writable = !isReadOnly(actor);
  switch (ownerType) {
    case 'profile': {
      const read = await employeeReach(db, actor, ownerId);
      return { read, attach: read && writable && (actor.employeeId === ownerId || isOrganizationWide(actor)) };
    }
    // Evidence uploaded before its work log or request exists: owned by the
    // employee, readable by whoever reaches them, attachable only by them.
    case 'time_entry':
    case 'wfh_request':
    case 'leave_request': {
      const read = await employeeReach(db, actor, ownerId);
      return { read, attach: read && writable && actor.employeeId === ownerId };
    }
    case 'conveyance_claim': {
      const row = await one('SELECT submitter_user_id,submitter_employee_id,assigned_team_lead_employee_id,submitter_role,stage,outcome,submitted_at_utc,decided_at_utc FROM conveyance_claims WHERE id=?');
      if (!row) {
        const read = await employeeReach(db, actor, ownerId);
        return { read, attach: read && writable && actor.employeeId === ownerId };
      }
      const reviewerRole = actor.roles.includes('super_admin') ? 'super_admin'
        : actor.roles.includes('hr_manager') ? 'hr_manager'
          : actor.roles.includes('team_lead') || (actor.departmentLeadScopes?.length ?? 0) > 0 ? 'team_lead' : null;
      const read = canViewApproval({
        id: ownerId, submitterUserId: String(row.submitter_user_id), submitterEmployeeId: String(row.submitter_employee_id),
        submitterRole: String(row.submitter_role) as 'employee' | 'team_lead', teamLeadEmployeeId: row.assigned_team_lead_employee_id ? String(row.assigned_team_lead_employee_id) : null,
        stage: String(row.stage) as 'team_lead_review' | 'reviewer_review' | 'decided', outcome: row.outcome ? String(row.outcome) as 'approved' | 'rejected' | 'withdrawn' : null,
        submittedAt: row.submitted_at_utc instanceof Date ? row.submitted_at_utc.toISOString() : String(row.submitted_at_utc),
        decidedAt: row.decided_at_utc instanceof Date ? row.decided_at_utc.toISOString() : row.decided_at_utc ? String(row.decided_at_utc) : null,
        reviews: [],
      }, { userId: actor.userId, employeeId: actor.employeeId, reviewerRole });
      return { read, attach: false };
    }
    case 'project': {
      const reach = await projectReach(db, actor, ownerId, date);
      return { read: Boolean(reach), attach: Boolean(reach) && writable };
    }
    case 'task': {
      const reach = await taskReach(db, actor, ownerId);
      return { read: Boolean(reach), attach: Boolean(reach) && writable };
    }
    case 'remark': {
      const row = await one('SELECT employee_id,author_user_id FROM general_remarks WHERE id=?');
      if (!row || !(await canOpenRelated(db, actor, { type: 'remark', id: ownerId }, date))) return NONE;
      return { read: true, attach: writable && (row.author_user_id === actor.userId || row.employee_id === actor.employeeId) };
    }
    case 'evaluation': {
      if (!(await evaluationReach(db, actor, ownerId))) return NONE;
      const row = await one('SELECT employee_id,reviewer_employee_id FROM evaluations WHERE id=?');
      return { read: true, attach: writable && Boolean(row) && (row!.employee_id === actor.employeeId || row!.reviewer_employee_id === actor.employeeId) };
    }
    case 'message': {
      const row = await one('SELECT sender_user_id,scope_type,scope_id FROM messages WHERE id=?');
      if (!row || !(await messageScopeReach(db, actor, String(row.scope_type) as MessageScopeType, String(row.scope_id), date))) return NONE;
      return { read: true, attach: writable && row.sender_user_id === actor.userId };
    }
    case 'document': {
      const reach = await documentReach(db, actor, ownerId, date);
      return { read: Boolean(reach?.isActive), attach: Boolean(reach?.canManage) };
    }
  }
}
