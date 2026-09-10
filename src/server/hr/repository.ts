import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import type { LeaveRequest, WfhRequest, Evaluation, EvaluationPeriod, EvaluationWeighting } from '@/contracts/domain';
import { MysqlTimeRepository } from '@/server/time/mysql-repository';
import type { ActorPolicyContext } from '@/server/authorization/policy';
export type Row = RowDataPacket & Record<string, unknown>;
export type RequestKind = 'wfh' | 'leave';
export type HrRequest = (WfhRequest | LeaveRequest) & {
    version: number;
    requestedMinutes?: number;
    attachmentIds: readonly string[];
};
export const decode = <T>(value: unknown, fallback: T): T => value == null ? fallback : typeof value === 'string' ? JSON.parse(value) as T : value as T;
export const date = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
export const instant = (value: unknown) => value instanceof Date ? value.toISOString() : String(value).replace(' ', 'T').replace(/Z?$/, 'Z');
const table = (kind: RequestKind) => kind === 'wfh' ? 'wfh_requests' : 'leave_requests';
export class HrRepository {
    readonly time: MysqlTimeRepository;
    constructor(readonly pool: Pool, readonly connection?: PoolConnection) {
        this.time = new MysqlTimeRepository(pool, connection);
    }
    private get db() {
        return this.connection ?? this.pool;
    }
    async rows(sql: string, values: (string | number | boolean | null | Date)[] = []): Promise<Row[]> {
        const [rows] = await this.db.execute<Row[]>(sql, values);
        return rows;
    }
    async execute(sql: string, values: (string | number | boolean | null | Date)[] = []) {
        await this.db.execute(sql, values);
    }
    async transaction<T>(work: (tx: HrRepository) => Promise<Result<T>>): Promise<Result<T>> {
        if (this.connection)
            return work(this);
        const c = await this.pool.getConnection();
        try {
            await c.beginTransaction();
            const tx = new HrRepository(this.pool, c);
            await tx.time.lockPeriods();
            const result = await work(tx);
            if (result.status === 'success')
                await c.commit();
            else
                await c.rollback();
            return result;
        }
        catch (error) {
            await c.rollback();
            throw error;
        }
        finally {
            c.release();
        }
    }
    async employees() {
        return this.rows("SELECT * FROM employees WHERE status='active'");
    }
    async employee(id: string) {
        return (await this.rows('SELECT * FROM employees WHERE id=?', [id]))[0] ?? null;
    }
    async assignments(id: string, on: string) {
        return this.rows('SELECT a.*,d.is_government FROM employee_division_assignments a JOIN divisions d ON d.id=a.division_id WHERE a.employee_id=? AND a.is_active=TRUE AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)', [id, on, on]);
    }
    async requests(kind: RequestKind) {
        return (await this.rows(`SELECT r.*,e.user_id${kind === 'leave' ? ',lt.type_key' : ''} FROM ${table(kind)} r JOIN employees e ON e.id=r.employee_id ${kind === 'leave' ? 'JOIN leave_types lt ON lt.id=r.leave_type_id' : ''}`)).map(r => this.requestFrom(kind, r));
    }
    async request(kind: RequestKind, id: string) {
        return (await this.requests(kind)).find(r => r.id === id) ?? null;
    }
    private requestFrom(kind: RequestKind, r: Row): HrRequest {
        const actor = { userId: String(r.user_id), displayName: 'Employee' };
        const common = {
            id: String(r.id), employeeId: String(r.employee_id), reason: String(r.reason), portion: r.portion as 'full_day' | 'half_day', state: (r.status === 'submitted' ? 'pending' : r.status) as HrRequest['state'], attachmentIds: [], decision: null, createdAt: instant(r.created_at), updatedAt: instant(r.updated_at), createdBy: actor, updatedBy: actor, version: Number(r.version)
        };
        const fallback: HrRequest = kind === 'wfh' ? {
            ...common, requestDate: date(r.created_at), wfhDate: date(r.wfh_date), divisionId: String(r.division_id), plannedTasks: String(r.planned_tasks), contactAvailability: String(r.contact_availability)
        } : {
            ...common, leaveType: r.type_key as 'annual' | 'sick' | 'casual' | 'unpaid', startDate: date(r.start_date), endDate: date(r.end_date), totalDays: Number(r.requested_minutes) / 420, requestedMinutes: Number(r.requested_minutes)
        };
        return { ...decode<HrRequest>(r.payload, fallback), version: Number(r.version) };
    }
    async leaveTypes() {
        return this.rows('SELECT * FROM leave_types WHERE is_active=TRUE');
    }
    async balances(employeeId: string, year: number) {
        return this.rows('SELECT b.*,t.type_key FROM leave_balances b JOIN leave_types t ON t.id=b.leave_type_id WHERE b.employee_id=? AND b.year=?', [employeeId, year]);
    }
    async saveRequest(kind: RequestKind, r: HrRequest, create = false) {
        const status = r.state === 'pending' ? 'submitted' : r.state;
        if (kind === 'wfh' && 'wfhDate' in r) {
            if (create)
                await this.execute('INSERT INTO wfh_requests(id,employee_id,division_id,wfh_date,portion,reason,planned_tasks,contact_availability,status,payload,version) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [r.id, r.employeeId, r.divisionId, r.wfhDate, r.portion, r.reason, r.plannedTasks, r.contactAvailability, status, JSON.stringify(r), r.version]);
            else
                await this.execute('UPDATE wfh_requests SET division_id=?,wfh_date=?,portion=?,reason=?,planned_tasks=?,contact_availability=?,status=?,payload=?,version=? WHERE id=?', [r.divisionId, r.wfhDate, r.portion, r.reason, r.plannedTasks, r.contactAvailability, status, JSON.stringify(r), r.version, r.id]);
        }
        else if ('leaveType' in r) {
            const type = (await this.leaveTypes()).find(t => t.type_key === r.leaveType);
            if (!type)
                throw new Error('Missing leave type');
            if (create)
                await this.execute('INSERT INTO leave_requests(id,employee_id,leave_type_id,start_date,end_date,portion,requested_minutes,reason,status,payload,version) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [r.id, r.employeeId, String(type.id), r.startDate, r.endDate, r.portion, r.requestedMinutes ?? 0, r.reason, status, JSON.stringify(r), r.version]);
            else
                await this.execute('UPDATE leave_requests SET leave_type_id=?,start_date=?,end_date=?,portion=?,requested_minutes=?,reason=?,status=?,payload=?,version=? WHERE id=?', [String(type.id), r.startDate, r.endDate, r.portion, r.requestedMinutes ?? 0, r.reason, status, JSON.stringify(r), r.version, r.id]);
        }
    }
    async adjustBalance(id: string, reserved: number, used: number) {
        await this.execute('UPDATE leave_balances SET reserved_minutes=reserved_minutes+?,used_minutes=used_minutes+?,version=version+1 WHERE id=?', [reserved, used, id]);
    }
    async history(kind: string, id: string) {
        return this.rows('SELECT * FROM hr_workflow_history WHERE resource_type=? AND resource_id=? ORDER BY created_at,id', [kind, id]);
    }
    async record(actor: ActorPolicyContext, kind: string, id: string, before: unknown, after: unknown, reason: string | null = null) {
        await this.execute('INSERT INTO hr_workflow_history(id,resource_id,resource_type,actor_user_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?,?)', [randomUUID(), id, kind, actor.userId, before == null ? null : JSON.stringify(before), JSON.stringify(after), reason]);
        await this.time.audit({
            actorUserId: actor.userId, action: `hr.${kind}.change`, resourceId: id, before: kind === 'evaluation' ? 'restricted' : before ?? null, after: kind === 'evaluation' ? 'restricted' : after, reason, correlationId: randomUUID()
        });
    }
    async job(key: string, kind: string, due: string, payload: unknown, employeeId: string | null = null, resourceId: string | null = null) {
        await this.execute('INSERT INTO hr_jobs(id,job_key,kind,due_at,payload,employee_id,resource_id) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE job_key=VALUES(job_key)', [randomUUID(), key, kind, new Date(due), JSON.stringify(payload), employeeId, resourceId]);
    }
    async periods() {
        return (await this.rows('SELECT payload FROM evaluation_periods WHERE payload IS NOT NULL')).map(r => decode<EvaluationPeriod>(r.payload, {} as EvaluationPeriod));
    }
    async evaluations() {
        return (await this.rows('SELECT payload FROM evaluations WHERE payload IS NOT NULL')).map(r => decode<Evaluation & {
            version: number;
        }>(r.payload, {} as Evaluation & {
            version: number;
        }));
    }
    async weightings() {
        return (await this.rows('SELECT * FROM evaluation_weightings ORDER BY version')).map(r => ({ version: Number(r.version), effectiveFrom: date(r.effective_from), weights: decode<EvaluationWeighting['weights']>(r.weights, {} as EvaluationWeighting['weights']) }));
    }
}
