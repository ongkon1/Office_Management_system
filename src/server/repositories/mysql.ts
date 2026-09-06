import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import type {
  DailySummaryRecord,
  DailySummaryRepository,
  DivisionRecord,
  DivisionRepository,
  RepositoryScope,
} from './ports';

type Executor = Pick<Pool | PoolConnection, 'execute'>;

interface DivisionRow extends RowDataPacket {
  id: string;
  division_key: string;
  name: string;
  is_active: number;
  is_government: number;
  version: number;
}

interface SummaryRow extends RowDataPacket {
  employee_id: string;
  work_date: string;
  active_minutes: number;
  break_minutes: number;
  total_minutes: number;
  classification: DailySummaryRecord['classification'];
  policy_version_id: string;
}

function executor(pool: Pool, connection?: PoolConnection): Executor {
  return connection ?? pool;
}

function visibleDivisionClause(scope: RepositoryScope): { sql: string; values: (string | boolean)[] } {
  if (scope.allowedDivisionIds.length === 0) return { sql: '1 = 0', values: [] };
  const placeholders = scope.allowedDivisionIds.map(() => '?').join(',');
  return {
    sql: `id IN (${placeholders}) AND (? = TRUE OR is_government = FALSE)`,
    values: [...scope.allowedDivisionIds, scope.canAccessGovernmentProjects],
  };
}

export class MysqlDivisionRepository implements DivisionRepository {
  constructor(private readonly pool: Pool) {}

  async listVisible(scope: RepositoryScope, connection?: PoolConnection): Promise<readonly DivisionRecord[]> {
    const predicate = visibleDivisionClause(scope);
    const [rows] = await executor(this.pool, connection).execute<DivisionRow[]>(
      `SELECT id, division_key, name, is_active, is_government, version FROM divisions WHERE ${predicate.sql} ORDER BY name`,
      predicate.values,
    );
    return rows.map(mapDivision);
  }

  async findVisibleById(id: string, scope: RepositoryScope, connection?: PoolConnection): Promise<DivisionRecord | null> {
    const predicate = visibleDivisionClause(scope);
    const [rows] = await executor(this.pool, connection).execute<DivisionRow[]>(
      `SELECT id, division_key, name, is_active, is_government, version FROM divisions WHERE id = ? AND ${predicate.sql} LIMIT 1`,
      [id, ...predicate.values],
    );
    return rows[0] ? mapDivision(rows[0]) : null;
  }
}

export class MysqlDailySummaryRepository implements DailySummaryRepository {
  constructor(private readonly pool: Pool) {}

  async listForEmployee(employeeId: string, range: { from: string; to: string }, scope: RepositoryScope, connection?: PoolConnection): Promise<readonly DailySummaryRecord[]> {
    if (!scope.actorUserId || !scope.allowedEmployeeIds.includes(employeeId)) return [];
    const [rows] = await executor(this.pool, connection).execute<SummaryRow[]>(
      `SELECT employee_id, CAST(work_date AS CHAR) work_date, active_minutes, break_minutes, total_minutes, classification, policy_version_id
       FROM daily_summaries WHERE employee_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date`,
      [employeeId, range.from, range.to],
    );
    return rows.map((row) => ({
      employeeId: row.employee_id,
      workDate: row.work_date,
      activeMinutes: row.active_minutes,
      breakMinutes: row.break_minutes,
      totalMinutes: row.total_minutes,
      classification: row.classification,
      policyVersionId: row.policy_version_id,
    }));
  }
}

function mapDivision(row: DivisionRow): DivisionRecord {
  return {
    id: row.id,
    code: row.division_key,
    name: row.name,
    isActive: Boolean(row.is_active),
    isRestricted: Boolean(row.is_government),
    version: row.version,
  };
}
