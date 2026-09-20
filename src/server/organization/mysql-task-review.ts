import { randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { RaisedTask, TaskReviewRepository } from './task-review';

interface TaskRow extends RowDataPacket {
  id: string;
  creator_employee_id: string;
  review_state: RaisedTask['reviewState'];
  version: number;
}

export class MysqlTaskReviewRepository implements TaskReviewRepository {
  constructor(
    private pool: Pool,
    private today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date()),
  ) {}

  async employeeForUser(userId: string) {
    const date = this.today();
    const [rows] = await this.pool.execute<
      (RowDataPacket & {
        id: string;
        lead_employee_id: string | null;
        division_id: string | null;
        is_team_lead: number;
      })[]
    >(
      `SELECT e.id,a.lead_employee_id,a.division_id,
       EXISTS(
         SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
         WHERE ur.user_id=e.user_id AND r.role_key='team_lead'
           AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?)
       ) AS is_team_lead
       FROM employees e
       LEFT JOIN employee_division_assignments a ON a.employee_id=e.id AND a.is_active=TRUE
         AND a.effective_from<=? AND(a.effective_to IS NULL OR a.effective_to>=?)
       WHERE e.user_id=? AND e.status='active'`,
      [date, date, date, date, userId],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      leadEmployeeId: rows.find((row) => row.lead_employee_id)?.lead_employee_id ?? null,
      divisionIds: [...new Set(rows.map((row) => row.division_id).filter((value): value is string => value !== null))],
      isTeamLead: Boolean(rows[0].is_team_lead),
    };
  }

  async currentLeadForEmployee(id: string) {
    const date = this.today();
    const [rows] = await this.pool.execute<(RowDataPacket & { lead_employee_id: string })[]>(
      `SELECT lead_employee_id FROM employee_division_assignments
       WHERE employee_id=? AND is_active=TRUE AND is_primary=TRUE
         AND effective_from<=? AND(effective_to IS NULL OR effective_to>=?) LIMIT 1`,
      [id, date, date],
    );
    return rows[0]?.lead_employee_id ?? null;
  }

  async projectAvailable(id: string, employeeId: string, divisionIds: readonly string[]) {
    if (!divisionIds.length) return false;
    const marks = divisionIds.map(() => '?').join(',');
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM projects p WHERE p.id=? AND p.is_active=TRUE AND p.status='active'
       AND p.division_id IN(${marks})
       AND EXISTS(SELECT 1 FROM employee_division_assignments a
         WHERE a.employee_id=? AND a.division_id=p.division_id AND a.is_active=TRUE
           AND a.effective_from<=? AND(a.effective_to IS NULL OR a.effective_to>=?))`,
      [id, ...divisionIds, employeeId, this.today(), this.today()],
    );
    return Boolean(rows[0]);
  }

  async insertSelfTask(input: Parameters<TaskReviewRepository['insertSelfTask']>[0]) {
    const id = randomUUID();
    await this.pool.execute(
      `INSERT INTO tasks(
        id,project_id,division_id,title,status,priority,assignee_employee_id,
        creator_employee_id,creator_role,estimated_minutes,due_date,description,review_state
       ) SELECT ?,p.id,p.division_id,?,'pending',?,?,?,?,?,?,?,? FROM projects p WHERE p.id=?`,
      [
        id, input.title, input.priority, input.employeeId, input.employeeId,
        input.requiresReview ? 'employee' : 'team_lead', input.estimatedMinutes,
        input.dueDate || null, input.description,
        input.requiresReview ? 'pending_review' : 'not_required', input.projectId,
      ],
    );
    return id;
  }

  async find(id: string) {
    const [rows] = await this.pool.execute<TaskRow[]>(
      'SELECT id,creator_employee_id,review_state,version FROM tasks WHERE id=? LIMIT 1',
      [id],
    );
    const row = rows[0];
    return row ? {
      id: row.id,
      creatorEmployeeId: row.creator_employee_id,
      reviewState: row.review_state,
      version: row.version,
    } : null;
  }

  async decideAtomic(input: Parameters<TaskReviewRepository['decideAtomic']>[0]) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [prior] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM task_review_decisions WHERE reviewer_employee_id=? AND idempotency_key=?',
        [input.reviewerEmployeeId, input.idempotencyKey],
      );
      if (prior[0]) {
        await connection.rollback();
        return 'replayed' as const;
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tasks SET review_state=?,reviewer_employee_id=?,reviewed_at=UTC_TIMESTAMP(6),
         review_note=?,version=version+1
         WHERE id=? AND version=? AND review_state='pending_review'`,
        [input.outcome, input.reviewerEmployeeId, input.note, input.taskId, input.expectedVersion],
      );
      if (result.affectedRows !== 1) {
        await connection.rollback();
        return 'conflict' as const;
      }
      await connection.execute(
        `INSERT INTO task_review_decisions(
          id,task_id,reviewer_employee_id,outcome,note,decided_at,idempotency_key,task_version
         ) VALUES(?,?,?,?,?,UTC_TIMESTAMP(6),?,?)`,
        [randomUUID(), input.taskId, input.reviewerEmployeeId, input.outcome, input.note,
          input.idempotencyKey, input.expectedVersion + 1],
      );
      await connection.commit();
      return 'applied' as const;
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') return 'conflict' as const;
      throw error;
    } finally {
      connection.release();
    }
  }
}
