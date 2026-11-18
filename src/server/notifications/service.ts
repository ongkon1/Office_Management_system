import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { leadsOfEmployee, reachesEmployee } from '@/server/organization/department-authority';
import { hasPermission } from '@/server/authorization/policy';
import { localParts } from '@/lib/calculation/instants';
import type { NotificationType } from '@/contracts/domain';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { canOpenRelated } from './access';
import { NOTIFICATION_TEMPLATES, canonicalType, hrefFor, storedRelated, type RelatedRecord } from './catalogue';

export type NotificationExecutor = Pick<Pool | PoolConnection, 'execute'>;
type Row = RowDataPacket & Record<string, unknown>;

export interface NotifyInput {
  readonly recipientUserIds: readonly string[];
  readonly type: NotificationType;
  readonly related: RelatedRecord;
  /**
   * The rule occurrence (`BE-0703`). The same type and occurrence never
   * notify the same person twice, however often the triggering code runs.
   */
  readonly occurrenceKey: string;
}

/** Deduplication is per recipient: the unique key is (recipient, this hash). */
export const deduplicationKey = (type: NotificationType, occurrenceKey: string) =>
  createHash('sha256').update(`${type}:${occurrenceKey}`).digest('hex');

const isDuplicate = (error: unknown) => (error as { errno?: number })?.errno === 1062;

/**
 * The one notification path (`BE-0701`–`BE-0705`). Call it with the
 * mutation's transaction connection so a rolled-back change sends nothing.
 *
 * For every candidate recipient, in order: the account must be active; the
 * recipient must be able to open the related record **now** (checked with
 * their own live permissions — a wide candidate list can never widen who is
 * told); their in-app preference must allow it unless the type is mandatory;
 * then the row is written under its deduplication key, and an email delivery
 * is queued only if they opted into email for that type. Text is the fixed
 * catalogue template; nothing about the record is interpolated.
 */
export class NotificationService {
  constructor(private readonly db: NotificationExecutor, private readonly now = () => new Date().toISOString()) {}

  async notify(input: NotifyInput): Promise<number> {
    const template = NOTIFICATION_TEMPLATES[input.type];
    const date = localParts(this.now(), 'Asia/Dhaka').date;
    const stored = storedRelated(input.related);
    let created = 0;
    for (const userId of new Set(input.recipientUserIds)) {
      const [users] = await this.db.execute<Row[]>("SELECT u.id FROM users u WHERE u.id=? AND u.status='active'", [userId]);
      if (!users[0]) continue;
      const actor = await loadActorPolicyContext(this.db, userId, date);
      if (!actor || !(await canOpenRelated(this.db, actor, input.related, date))) continue;
      const [preferences] = await this.db.execute<Row[]>(
        'SELECT in_app_enabled,email_enabled FROM notification_preferences WHERE user_id=? AND setting_key=?', [userId, template.settingKey]);
      const preference = preferences[0];
      if (preference && !preference.in_app_enabled && !template.mandatory) continue;
      const id = randomUUID();
      const payload = {
        title: template.title, body: template.body, href: hrefFor(input.related, actor.employeeId),
        requiresAction: template.requiresAction, relatedDate: stored.date,
      };
      try {
        await this.db.execute(
          'INSERT INTO notifications(id,recipient_user_id,notification_type,safe_payload,related_type,related_id,deduplication_key) VALUES(?,?,?,?,?,?,?)',
          [id, userId, input.type, JSON.stringify(payload), stored.relatedType, stored.relatedId, deduplicationKey(input.type, input.occurrenceKey)],
        );
      } catch (error) {
        if (isDuplicate(error)) continue;
        throw error;
      }
      created += 1;
      if (template.emailEligible && preference && Boolean(preference.email_enabled)) {
        await this.db.execute(
          "INSERT INTO notification_deliveries(id,notification_id,channel,template_key,next_attempt_at) VALUES(?,?,'email',?,?)",
          [randomUUID(), id, input.type, new Date(this.now())],
        );
      }
    }
    return created;
  }

  /** Employees → their user accounts, then `notify`. */
  async notifyEmployees(employeeIds: readonly string[], input: Omit<NotifyInput, 'recipientUserIds'>): Promise<number> {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    if (!ids.length) return 0;
    const [rows] = await this.db.execute<Row[]>(
      `SELECT user_id FROM employees WHERE status='active' AND id IN (${ids.map(() => '?').join(',')})`, ids);
    return this.notify({ ...input, recipientUserIds: rows.map((row) => String(row.user_id)) });
  }

  /**
   * The Phase 3/4 entry point, kept for its callers. A type the catalogue does
   * not know is refused loudly rather than stored as free text.
   */
  async send(input: { employeeIds: readonly string[]; type: string; resourceType: 'task' | 'timesheet'; resourceId: string; eventKey: string; date?: string }) {
    const type = canonicalType(input.type);
    if (!type) throw new Error(`Unknown notification type: ${input.type}`);
    if (type === 'significant_variance' && !(await this.overEstimate(input.resourceId))) return 0;
    const related: RelatedRecord = input.resourceType === 'task'
      ? { type: 'task', id: input.resourceId }
      : { type: 'timesheet', employeeId: input.resourceId, date: input.date ?? localParts(this.now(), 'Asia/Dhaka').date };
    return this.notifyEmployees(input.employeeIds, { type, related, occurrenceKey: input.eventKey });
  }

  /**
   * D6 matches the frontend: flag positive variance against the estimate,
   * never cap work. The total is the task's saved minutes; whether a given
   * recipient may see the task at all is decided per recipient in `notify`.
   */
  private async overEstimate(taskId: string) {
    const [rows] = await this.db.execute<Row[]>(
      `SELECT t.estimated_minutes,(SELECT COALESCE(SUM(te.active_minutes),0) FROM time_entries te
        WHERE te.task_id=t.id AND te.is_active=TRUE AND te.status<>'draft') actual FROM tasks t WHERE t.id=?`, [taskId]);
    return Boolean(rows[0]) && Number(rows[0].estimated_minutes ?? 0) > 0 && Number(rows[0].actual) > Number(rows[0].estimated_minutes);
  }

  /**
   * Timesheet events (`REQ-NOT-001`/`002`/`003`, `OH-BE-0308`). Candidates are
   * the employee, whoever leads them on that date through either route, and
   * HR. Every candidate is still authorized individually, and a lead or HR
   * recipient is skipped when any of the day's work sits in a division they
   * cannot see — naming the day would otherwise reveal it.
   */
  async timeEvent(rawType: string, eventKey: string, employeeId: string, date: string) {
    const type = canonicalType(rawType);
    if (!type) throw new Error(`Unknown notification type: ${rawType}`);
    const leads = await leadsOfEmployee(this.db, employeeId, date);
    const leadPlaceholders = leads.length > 0 ? leads.map(() => '?').join(',') : null;
    // Remarks and correction requests concern the employee and their lead;
    // overtime, critical time and period amendments also reach HR (`REQ-NOT-003`).
    const includeHr = type === 'critical_time' || type === 'overtime' || type === 'period_verified';
    const [rows] = await this.db.execute<Row[]>(`SELECT DISTINCT e.id,e.user_id FROM employees e WHERE e.id=?${leadPlaceholders ? ` OR e.id IN (${leadPlaceholders})` : ''}${includeHr ? ` OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=e.user_id AND r.role_key='hr_manager' AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?))` : ''}`,
      [employeeId, ...leads, ...(includeHr ? [date, date] : [])]);
    const [entries] = await this.db.execute<Row[]>("SELECT DISTINCT t.division_id,d.is_government FROM time_entries t JOIN divisions d ON d.id=t.division_id WHERE t.employee_id=? AND t.work_date=? AND t.is_active=TRUE AND t.status<>'draft'", [employeeId, date]);
    const recipients: string[] = [];
    for (const row of rows) {
      const actor = await loadActorPolicyContext(this.db, String(row.user_id), date);
      if (!actor || entries.some((e) => (e.is_government && !hasPermission(actor, 'organization.government.view')) || !reachesEmployee(actor, { employeeId, divisionId: String(e.division_id) }))) continue;
      recipients.push(String(row.user_id));
    }
    return this.notify({ recipientUserIds: recipients, type, related: { type: 'timesheet', employeeId, date }, occurrenceKey: eventKey });
  }
}
