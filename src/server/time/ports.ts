import type { DailySummary, GeneralRemark, TimeEntry, TimerSession, TimesheetPeriod, WorkPolicy, Project, Task, Division } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import type { LeaveContext } from '@/lib/calculation/engine';
import type { ActorPolicyContext } from '@/server/authorization/policy';
export interface StoredEntry extends TimeEntry {
    readonly attachmentIds: readonly string[];
    readonly version: number;
    readonly policyId: string;
    readonly timezone: string;
    readonly overtimeReason: string | null;
    readonly criticalExplanation: string | null;
    readonly isActive: boolean;
}
export interface DayContext {
    readonly policy: WorkPolicy;
    readonly policyId: string;
    readonly entries: readonly StoredEntry[];
    readonly effectiveDivisionIds: readonly string[];
    readonly divisions: readonly Division[];
    readonly projects: readonly Project[];
    readonly tasks: readonly Task[];
    readonly leave: LeaveContext | null;
    readonly holidayName: string | null;
    readonly approvedWfh: boolean;
    readonly breakOverrideMinutes: number | null;
    readonly breakReason: string | null;
    readonly period: StoredPeriod | null;
    readonly snapshot: DailySummary | null;
}
export interface StoredTimer extends TimerSession {
    readonly timezone: string;
    readonly policyId: string;
    readonly stoppedAt: string | null;
    readonly cancelledAt: string | null;
    readonly draft: import('@/contracts/services').TimeEntryInput | null;
}
export interface StoredPeriod extends TimesheetPeriod {
    readonly version: number;
    readonly policyId: string;
}
export interface TimeAudit {
    readonly actorUserId: string;
    readonly action: string;
    readonly resourceId: string;
    readonly employeeId?: string;
    readonly before: unknown;
    readonly after: unknown;
    readonly reason?: string | null;
    readonly correlationId: string;
}
/** Every method in a transaction uses the same connection, including audit/outbox. */
export interface TimeRepository {
    transaction<T>(work: (tx: TimeRepository) => Promise<Result<T>>): Promise<Result<T>>;
    lockEmployee(id: string): Promise<boolean>;
    lockPeriods(): Promise<void>;
    context(employeeId: string, date: string, policyId?: string): Promise<DayContext | null>;
    overlapsClock(employeeId: string, start: string, end: string, excludeId?: string): Promise<boolean>;
    entry(id: string): Promise<StoredEntry | null>;
    saveEntry(entry: StoredEntry, expectedVersion?: number): Promise<boolean>;
    saveSummary(summary: DailySummary, policyId: string, context: DayContext): Promise<void>;
    saveBreak(employeeId: string, date: string, minutes: number, reason: string, policyId: string): Promise<void>;
    timer(id: string): Promise<StoredTimer | null>;
    runningTimer(employeeId: string): Promise<StoredTimer | null>;
    saveTimer(timer: StoredTimer, actorUserId: string): Promise<void>;
    replay(actorId: string, operation: string, key: string): Promise<{
        hash: string;
        result: Result<unknown>;
    } | null>;
    remember(actorId: string, operation: string, key: string, hash: string, result: Result<unknown>): Promise<void>;
    audit(event: TimeAudit): Promise<void>;
    enqueue(key: string, type: string, employeeId: string, date: string): Promise<void>;
    attachmentAllowed(id: string, employeeId: string, actor: ActorPolicyContext): Promise<boolean>;
    taskRemarkAllowed(taskId: string, employeeId: string, actor: ActorPolicyContext): Promise<boolean>;
    employeeRef(id: string): Promise<import('@/contracts/view-models').EmployeeRef | null>;
    employeeIds(): Promise<readonly string[]>;
    periods(): Promise<readonly StoredPeriod[]>;
    savePeriod(period: StoredPeriod): Promise<void>;
    verification(period: StoredPeriod, summaries: readonly DailySummary[], actorId: string, note: string | null): Promise<void>;
    remarks(employeeId: string): Promise<readonly GeneralRemark[]>;
    remark(id: string): Promise<GeneralRemark | null>;
    saveRemark(remark: GeneralRemark, actorId: string): Promise<void>;
}
