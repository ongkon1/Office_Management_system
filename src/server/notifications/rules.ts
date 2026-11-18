import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { addDays } from '@/lib/format';
import { localParts } from '@/lib/calculation/instants';
import { leadsOfEmployee } from '@/server/organization/department-authority';
import { NotificationService } from './service';

type Row = RowDataPacket & Record<string, unknown>;
const isoDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

export interface RuleRunResult {
  readonly ruleKey: string;
  readonly windowKey: string;
  readonly outcome: 'completed' | 'already_completed' | 'running_elsewhere' | 'failed';
  readonly generated: number;
}

/** Days ahead of a due date that count as "approaching" (`REQ-NOT-001`). */
export const DEADLINE_WINDOW_DAYS = 2;

/**
 * Scheduled notification rules (`BE-0702`, `BE-0703`).
 *
 * Missing, under-time, overtime and critical days come from the HR attendance
 * job, which already runs daily; these rules cover what no mutation triggers:
 * approaching and overdue deadlines, and planned workload above capacity.
 *
 * Idempotency is layered. Each (rule, window) is claimed once in
 * `notification_rule_runs`, so a second run of the same day is a no-op and two
 * workers cannot run it concurrently; a crashed run is reclaimed after its
 * lease. Underneath, every notification still carries an occurrence key, so
 * even a reclaimed partial run cannot notify anyone twice.
 */
export class NotificationRuleRunner {
  constructor(
    private readonly pool: Pool,
    private readonly now = () => new Date().toISOString(),
    private readonly leaseSeconds = 600,
  ) {}

  private today() { return localParts(this.now(), 'Asia/Dhaka').date; }

  async runDaily(): Promise<RuleRunResult[]> {
    const today = this.today();
    return [
      await this.run('deadline_approaching', today, (db) => this.deadlines(db, today)),
      await this.run('task_overdue', today, (db) => this.overdue(db, today)),
      await this.run('workload_warning', today, (db) => this.workload(db, today)),
    ];
  }

  async run(ruleKey: string, windowKey: string, generate: (db: PoolConnection) => Promise<number>): Promise<RuleRunResult> {
    const claim = await this.claim(ruleKey, windowKey);
    if (claim.outcome !== 'claimed') return { ruleKey, windowKey, outcome: claim.outcome, generated: 0 };
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const generated = await generate(connection);
      await connection.execute(
        "UPDATE notification_rule_runs SET state='completed',completed_at=UTC_TIMESTAMP(6),generated_count=? WHERE id=? AND state='running'",
        [generated, claim.id]);
      await connection.commit();
      return { ruleKey, windowKey, outcome: 'completed', generated };
    } catch {
      await connection.rollback();
      await this.pool.execute("UPDATE notification_rule_runs SET state='failed' WHERE id=?", [claim.id]);
      return { ruleKey, windowKey, outcome: 'failed', generated: 0 };
    } finally {
      connection.release();
    }
  }

  private async claim(ruleKey: string, windowKey: string): Promise<{ outcome: 'claimed'; id: string } | { outcome: 'already_completed' | 'running_elsewhere' }> {
    const lease = new Date(Date.parse(this.now()) + this.leaseSeconds * 1000);
    const id = randomUUID();
    try {
      await this.pool.execute('INSERT INTO notification_rule_runs(id,rule_key,window_key,lease_until) VALUES(?,?,?,?)', [id, ruleKey, windowKey, lease]);
      return { outcome: 'claimed', id };
    } catch (error) {
      if ((error as { errno?: number }).errno !== 1062) throw error;
    }
    // The window exists: take it over only if it failed or its lease lapsed.
    const [result] = await this.pool.execute<import('mysql2/promise').ResultSetHeader>(
      `UPDATE notification_rule_runs SET state='running',lease_until=?,started_at=UTC_TIMESTAMP(6)
       WHERE rule_key=? AND window_key=? AND (state='failed' OR (state='running' AND lease_until<?))`,
      [lease, ruleKey, windowKey, new Date(this.now())]);
    const [rows] = await this.pool.execute<Row[]>('SELECT id,state FROM notification_rule_runs WHERE rule_key=? AND window_key=?', [ruleKey, windowKey]);
    if (result.affectedRows === 1) return { outcome: 'claimed', id: String(rows[0].id) };
    return { outcome: rows[0]?.state === 'completed' ? 'already_completed' : 'running_elsewhere' };
  }

  /** Open tasks due today or within the window, told to their assignee once per due date. */
  private async deadlines(db: PoolConnection, today: string) {
    const [tasks] = await db.execute<Row[]>(
      `SELECT t.id,t.assignee_employee_id,t.due_date FROM tasks t JOIN projects p ON p.id=t.project_id
       WHERE t.is_active=TRUE AND p.is_active=TRUE AND t.status<>'completed' AND t.assignee_employee_id IS NOT NULL
         AND t.due_date BETWEEN ? AND ?`, [today, addDays(today, DEADLINE_WINDOW_DAYS)]);
    const notifications = new NotificationService(db, this.now);
    let count = 0;
    for (const task of tasks) {
      count += await notifications.notifyEmployees([String(task.assignee_employee_id)], {
        type: 'deadline_approaching', related: { type: 'task', id: String(task.id) },
        occurrenceKey: `deadline:${String(task.id)}:${isoDate(task.due_date)}`,
      });
    }
    return count;
  }

  /** Open tasks past due, told to the assignee and whoever leads them (`REQ-NOT-002`). */
  private async overdue(db: PoolConnection, today: string) {
    const [tasks] = await db.execute<Row[]>(
      `SELECT t.id,t.assignee_employee_id,t.due_date FROM tasks t JOIN projects p ON p.id=t.project_id
       WHERE t.is_active=TRUE AND p.is_active=TRUE AND t.status<>'completed' AND t.assignee_employee_id IS NOT NULL AND t.due_date<?`, [today]);
    const notifications = new NotificationService(db, this.now);
    let count = 0;
    for (const task of tasks) {
      const assignee = String(task.assignee_employee_id);
      count += await notifications.notifyEmployees([assignee, ...await leadsOfEmployee(db, assignee, today)], {
        type: 'task_overdue', related: { type: 'task', id: String(task.id) },
        occurrenceKey: `overdue:${String(task.id)}:${isoDate(task.due_date)}`,
      });
    }
    return count;
  }

  /**
   * A planned week above capacity, told to the employee's leads and HR
   * (`REQ-NOT-002`, `REQ-NOT-003`). The test is the workload screen's own:
   * planned × 100 above capacity × the configured over-allocation percent,
   * where capacity is the engine-derived figure the planner stored when the
   * plan was saved. Weeks are matched as stored — any plan whose seven days
   * contain today — and warned about once per employee and week.
   */
  private async workload(db: PoolConnection, today: string) {
    const [settings] = await db.execute<Row[]>('SELECT overallocation_percent FROM workload_settings WHERE id=1');
    const threshold = Number(settings[0]?.overallocation_percent ?? 100);
    const [rows] = await db.execute<Row[]>(
      `SELECT employee_id,week_start_date,SUM(planned_minutes) planned,MAX(capacity_minutes) capacity FROM workload_allocations
       WHERE week_start_date BETWEEN ? AND ? GROUP BY employee_id,week_start_date
       HAVING MAX(capacity_minutes)>0 AND SUM(planned_minutes)*100>MAX(capacity_minutes)*?`, [addDays(today, -6), today, threshold]);
    if (!rows.length) return 0;
    const [hr] = await db.execute<Row[]>(
      `SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
       WHERE r.role_key='hr_manager' AND u.status='active' AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?)`, [today, today]);
    const notifications = new NotificationService(db, this.now);
    let count = 0;
    for (const row of rows) {
      const employeeId = String(row.employee_id);
      const week = isoDate(row.week_start_date);
      const input = { type: 'workload_warning' as const, related: { type: 'workload' as const, employeeId, week }, occurrenceKey: `workload:${employeeId}:${week}` };
      count += await notifications.notifyEmployees(await leadsOfEmployee(db, employeeId, today), input);
      count += await notifications.notify({ ...input, recipientUserIds: hr.map((h) => String(h.user_id)) });
    }
    return count;
  }
}
