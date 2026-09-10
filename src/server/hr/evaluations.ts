import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Evaluation, EvaluationRead, EvaluationFacts, EvaluationPeriod, EvaluationWeighting, EvaluationAreaKey, EvaluationCompetencyKey, EvaluationScore } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { daysBetween } from '@/lib/format';
import { aggregateSummaries } from '@/lib/calculation/engine';
import { hasPermission, indistinguishableNotFound, type ActorPolicyContext } from '@/server/authorization/policy';
import { TimeApplication } from '@/server/time/application';
import { dateSchema, invalid, conflict } from '@/server/time/validation';
import { RequestApplication } from './requests';
import { HrRepository, date } from './repository';
export const DEFAULT_WEIGHTS = {
    task_completion: 30, work_quality: 25, timeliness: 15, teamwork_communication: 10, responsibility: 10, learning_initiative: 10
} as const;
export const COMPETENCIES: Record<EvaluationAreaKey, readonly EvaluationCompetencyKey[]> = {
    task_completion: [], work_quality: ['work_quality', 'problem_solving', 'documentation'],
    timeliness: ['timeliness'], teamwork_communication: ['teamwork', 'communication'],
    responsibility: ['responsibility'], learning_initiative: ['initiative', 'learning_improvement']
};
export function completeCompetencies(scores: readonly EvaluationScore[]) {
    return AREAS.every(area => {
        const supplied = scores.find(score => score.area === area)?.competencies ?? [];
        return supplied.length === COMPETENCIES[area].length && new Set(supplied.map(s => s.area)).size === supplied.length && supplied.every(s =>
            COMPETENCIES[area].includes(s.area) && Number.isInteger(s.score) && s.score >= 1 && s.score <= 5 && Boolean(s.comment.trim()));
    });
}
export const AREAS = Object.keys(DEFAULT_WEIGHTS) as EvaluationAreaKey[];
export function weightedScore(scores: readonly EvaluationScore[], weights: EvaluationWeighting['weights']): number | null {
    if (Object.keys(weights).length !== AREAS.length || AREAS.some(a => !Number.isInteger(weights[a]) || weights[a] < 0) || AREAS.reduce((n, a) => n + weights[a], 0) !== 100)
        return null;
    if (scores.length !== AREAS.length || new Set(scores.map(s => s.area)).size !== AREAS.length || scores.some(s => !AREAS.includes(s.area) || !Number.isInteger(s.score) || s.score < 1 || s.score > 5))
        return null;
    return scores.reduce((n, s) => n + s.score * weights[s.area], 0) / 100;
}
const selfSchema = z.object({
    achievements: z.string().max(10000), completedProjects: z.string().max(10000), challenges: z.string().max(10000), skills: z.string().max(10000), trainingNeeds: z.string().max(10000), goals: z.string().max(10000), supportRequired: z.string().max(10000)
});
type StoredEvaluation = Evaluation & {
    version: number;
};
export class EvaluationApplication {
    constructor(readonly requests: RequestApplication) {
    }
    private manager(actor: ActorPolicyContext) {
        return this.requests.isHr(actor) && hasPermission(actor, 'evaluation.manage');
    }
    private async visible(tx: HrRepository, actor: ActorPolicyContext, e: Evaluation) {
        const period = (await tx.periods()).find(p => p.id === e.periodId);
        if (!period)
            return false;
        if (!await this.requests.canRead(tx, actor, e.employeeId, period.startDate))
            return false;
        return actor.employeeId === e.employeeId || ((actor.employeeId === e.reviewerEmployeeId || this.manager(actor)) && hasPermission(actor, 'evaluation.private.view'));
    }
    private disclose(actor: ActorPolicyContext, e: Evaluation): EvaluationRead {
        if (actor.employeeId === e.employeeId && e.state !== 'published')
            return {
                ...e, reviewerScores: 'restricted', reviewerSummary: 'restricted', weightedScore: 'restricted'
            };
        return e;
    }
    async list(): Promise<Result<readonly EvaluationRead[]>> {
        return this.requests.run(async () => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor)
                return indistinguishableNotFound();
            const rows: EvaluationRead[] = [];
            for (const e of await this.requests.repository.evaluations())
                if (await this.visible(this.requests.repository, actor, e))
                    rows.push(this.disclose(actor, e));
            return success(rows);
        });
    }
    async get(id: string): Promise<Result<EvaluationRead>> {
        const result = await this.list();
        if (result.status !== 'success')
            return result;
        const e = result.data.find(e => e.id === id);
        return e ? success(e) : indistinguishableNotFound();
    }
    async periods(): Promise<Result<readonly EvaluationPeriod[]>> {
        return this.requests.run(async () => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor)
                return indistinguishableNotFound();
            if (this.manager(actor))
                return success(await this.requests.repository.periods());
            const evaluations = await this.list();
            if (evaluations.status !== 'success')
                return evaluations;
            return success((await this.requests.repository.periods()).filter(p => evaluations.data.some(e => e.periodId === p.id)));
        });
    }
    async setPeriodOpen(id: string, isOpen: boolean) {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor || !this.manager(actor))
                return indistinguishableNotFound();
            const before = (await tx.periods()).find(p => p.id === id);
            if (!before)
                return indistinguishableNotFound();
            const next = {
                ...before, isOpen, updatedAt: this.requests.now(), updatedBy: { userId: actor.userId, displayName: 'HR' }
            };
            await tx.execute('UPDATE evaluation_periods SET status=?,payload=?,version=version+1 WHERE id=?', [isOpen ? 'open' : 'closed', JSON.stringify(next), id]);
            await tx.record(actor, 'evaluation_period', id, before, next);
            return success(next);
        }));
    }
    async history(id: string) {
        return this.requests.run(async () => {
            const actor = await this.requests.resolveActor(this.requests.today());
            const e = (await this.requests.repository.evaluations()).find(e => e.id === id);
            if (!actor || !e || !hasPermission(actor, 'evaluation.private.view') || !await this.visible(this.requests.repository, actor, e))
                return indistinguishableNotFound();
            return success(await this.requests.repository.history('evaluation', id));
        });
    }
    async createPeriod(raw: unknown): Promise<Result<EvaluationPeriod>> {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor || !this.manager(actor))
                return indistinguishableNotFound();
            const parsed = z.object({
                name: z.string().trim().min(1).max(120), type: z.enum(['monthly', 'quarterly', 'half_yearly', 'annual', 'project_based', 'probation']), startDate: dateSchema, endDate: dateSchema, dueDate: dateSchema, weightingVersion: z.number().int().positive(), isOpen: z.boolean()
            }).safeParse(raw);
            if (!parsed.success)
                return invalid('period', parsed.error.issues[0].message);
            const p = parsed.data;
            if (p.endDate < p.startDate || p.dueDate < p.endDate || daysBetween(p.startDate, p.endDate) > 366)
                return invalid('endDate', 'Use an ordered period up to 367 days, with a due date on or after its end.');
            let weights = (await tx.weightings()).find(w => w.version === p.weightingVersion && w.effectiveFrom <= p.startDate);
            if (!weights && p.weightingVersion === 1 && !(await tx.weightings()).length) {
                weights = { version: 1, effectiveFrom: p.startDate, weights: DEFAULT_WEIGHTS };
                await tx.execute('INSERT INTO evaluation_weightings(version,effective_from,weights,created_by_user_id) VALUES(1,?,?,?)', [p.startDate, JSON.stringify(DEFAULT_WEIGHTS), actor.userId]);
            }
            if (!weights)
                return invalid('weightingVersion', 'Choose a weighting effective at the start of this period.');
            const ref = { userId: actor.userId, displayName: 'HR' }, period: EvaluationPeriod = {
                ...p, id: randomUUID(), createdAt: this.requests.now(), updatedAt: this.requests.now(), createdBy: ref, updatedBy: ref
            };
            await tx.execute('INSERT INTO evaluation_periods(id,label,start_date,end_date,status,weights,payload) VALUES(?,?,?,?,?,?,?)', [period.id, period.name, period.startDate, period.endDate, period.isOpen ? 'open' : 'closed', JSON.stringify(weights.weights), JSON.stringify(period)]);
            await tx.record(actor, 'evaluation_period', period.id, null, period);
            return success(period);
        }));
    }
    async versionWeights(input: EvaluationWeighting): Promise<Result<EvaluationWeighting>> {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor || !hasPermission(actor, 'evaluation.weight.manage') || actor.roles.includes('management'))
                return indistinguishableNotFound();
            if (!Number.isInteger(input.version) || input.version < 1 || !dateSchema.safeParse(input.effectiveFrom).success || weightedScore(AREAS.map(area => ({ area, score: 1, comment: null })), input.weights) === null)
                return invalid('weights', 'Use the six whole-percent weights totaling 100.');
            const weights = await tx.weightings();
            if (weights.some(w => w.version >= input.version))
                return conflict('Append a newer weighting version; historical weights are immutable.');
            await tx.execute('INSERT INTO evaluation_weightings(version,effective_from,weights,created_by_user_id) VALUES(?,?,?,?)', [input.version, input.effectiveFrom, JSON.stringify(input.weights), actor.userId]);
            await tx.record(actor, 'weighting', String(input.version), null, input);
            return success(input);
        }));
    }
    async facts(tx: HrRepository, employeeId: string, period: EvaluationPeriod): Promise<Result<EvaluationFacts>> {
        const time = new TimeApplication(tx.time, this.requests.resolveActor, this.requests.now);
        const days = await time.summaries(employeeId, period.startDate, period.endDate);
        if (days.status !== 'success')
            return days;
        const totals = aggregateSummaries(days.data);
        const tasks = await tx.rows('SELECT * FROM tasks WHERE assignee_employee_id=? AND is_active=TRUE AND (start_date IS NULL OR start_date<=?) AND (due_date IS NULL OR due_date>=?)', [employeeId, period.endDate, period.startDate]);
        const actor = await this.requests.resolveActor(period.startDate);
        if (!actor)
            return indistinguishableNotFound();
        const c = await tx.time.context(employeeId, period.startDate);
        if (!c)
            return indistinguishableNotFound();
        const visible = tasks.filter(t => !c.divisions.find(d => d.id === t.division_id)?.isRestricted || hasPermission(actor, 'organization.government.view'));
        const completed = visible.filter(t => t.status === 'completed').length, overdue = visible.filter(t => t.status !== 'completed' && t.due_date && date(t.due_date) < period.endDate).length;
        const estimates = visible.reduce((n, t) => n + Number(t.estimated_minutes ?? 0), 0), actual = days.data.reduce((n, s) => n + (s.taskContributions ?? []).filter(t => visible.some(v => v.id === t.taskId)).reduce((m, t) => m + t.activeMinutes, 0), 0);
        const divisions = new Map<string, number>(), projects = new Map<string, number>();
        for (const day of days.data) {
            for (const d of day.divisionContributions)
                divisions.set(d.divisionId, (divisions.get(d.divisionId) ?? 0) + d.activeMinutes);
            for (const p of day.projectContributions)
                projects.set(p.projectId, (projects.get(p.projectId) ?? 0) + p.activeMinutes);
        }
        const remarks = await time.listRemarks(employeeId);
        if (remarks.status !== 'success')
            return remarks;
        return success({
            requiredActiveMinutes: totals.requiredActiveMinutes, actualActiveMinutes: totals.activeMinutes, breakMinutes: totals.breakMinutes, overtimeMinutes: totals.overtimeMinutes, missingDayCount: totals.missingDayCount, tasksCompleted: completed, tasksOverdue: overdue, taskCompletionRate: visible.length ? Math.round(completed * 100 / visible.length) : 0, estimateVariancePercent: estimates ? Math.round((actual - estimates) * 100 / estimates) : 0, divisionContributions: [...divisions].map(([divisionId, activeMinutes]) => ({ divisionId, activeMinutes })), projectContributions: [...projects].map(([projectId, activeMinutes]) => ({ projectId, activeMinutes })), wfhDayCount: days.data.filter(d => d.attendance === 'wfh').length, leaveDayCount: days.data.reduce((n, d) => n + (d.attendance === 'approved_leave' ? 1 : d.attendance === 'half_day_leave' ? 0.5 : 0), 0), remarkCount: remarks.data.filter(r => r.createdAt.slice(0, 10) >= period.startDate && r.createdAt.slice(0, 10) <= period.endDate).length
        });
    }
    async assign(periodId: string, employeeId: string, reviewerEmployeeId: string): Promise<Result<EvaluationRead>> {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor || !this.manager(actor) || !hasPermission(actor, 'evaluation.private.view'))
                return indistinguishableNotFound();
            const period = (await tx.periods()).find(p => p.id === periodId), employee = await tx.employee(employeeId), reviewer = await tx.employee(reviewerEmployeeId);
            if (!period || !employee || !reviewer)
                return indistinguishableNotFound();
            if (!period.isOpen || employee.status !== 'active' || reviewer.status !== 'active' || employeeId === reviewerEmployeeId || employee.hire_date && date(employee.hire_date) > period.endDate)
                return invalid('employeeId', 'Choose an eligible active employee and a different active reviewer in an open period.');
            if (!(await tx.assignments(employeeId, period.endDate)).some(a => a.is_primary && a.lead_employee_id === reviewerEmployeeId))
                return invalid('reviewerEmployeeId', 'Assign the employee’s effective primary Team Lead.');
            if ((await tx.evaluations()).some(e => e.periodId === periodId && e.employeeId === employeeId))
                return conflict('This employee already has an evaluation in this period.');
            const facts = await this.facts(tx, employeeId, period);
            if (facts.status !== 'success')
                return facts;
            const ref = { userId: actor.userId, displayName: 'HR' }, e: StoredEvaluation = {
                id: randomUUID(), periodId, employeeId, reviewerEmployeeId, state: 'not_started', facts: facts.data, selfEvaluation: null, reviewerScores: [], reviewerSummary: null, weightingVersion: period.weightingVersion, weightedScore: null, publishedAt: null, publishedBy: null, version: 1, createdAt: this.requests.now(), updatedAt: this.requests.now(), createdBy: ref, updatedBy: ref
            };
            await this.persist(tx, e, true);
            await tx.record(actor, 'evaluation', e.id, null, e);
            await tx.job(`evaluation:${e.id}:due`, 'evaluation.reminder', `${period.dueDate}T03:00:00Z`, { id: e.id }, reviewerEmployeeId, e.id);
            return success(e);
        }));
    }
    private async persist(tx: HrRepository, e: StoredEvaluation, create = false) {
        const state = e.state === 'published' ? 'published' : e.state === 'hr_review' ? 'review_submitted' : e.state === 'reviewer_scoring' ? 'self_submitted' : 'draft';
        if (create)
            await tx.execute('INSERT INTO evaluations(id,period_id,employee_id,reviewer_employee_id,status,payload) VALUES(?,?,?,?,?,?)', [e.id, e.periodId, e.employeeId, e.reviewerEmployeeId, state, JSON.stringify(e)]);
        else
            await tx.execute('UPDATE evaluations SET status=?,final_score=?,published_at=?,payload=?,version=? WHERE id=?', [state, e.weightedScore, e.publishedAt ? new Date(e.publishedAt) : null, JSON.stringify(e), e.version, e.id]);
    }
    async change(id: string, action: 'save_self' | 'submit_self' | 'save_scores' | 'submit_review' | 'publish' | 'return', input: unknown = null, expectedVersion?: number): Promise<Result<EvaluationRead>> {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor || actor.roles.includes('management'))
                return indistinguishableNotFound();
            const before = (await tx.evaluations()).find(e => e.id === id);
            if (!before || !await this.visible(tx, actor, before))
                return indistinguishableNotFound();
            if (before.state === 'published' || (['save_self', 'save_scores'].includes(action) && !Number.isInteger(expectedVersion)) || expectedVersion !== undefined && before.version !== expectedVersion)
                return conflict('This evaluation is published or has changed.');
            const period = (await tx.periods()).find(p => p.id === before.periodId);
            if (!period?.isOpen)
                return conflict('This evaluation period is closed.');
            let next: StoredEvaluation = {
                ...before, version: before.version + 1, updatedAt: this.requests.now(), updatedBy: { userId: actor.userId, displayName: 'Reviewer' }
            };
            if (action === 'save_self' || action === 'submit_self') {
                if (actor.employeeId !== before.employeeId || !['not_started', 'self_evaluation'].includes(before.state))
                    return indistinguishableNotFound();
                if (action === 'save_self') {
                    const parsed = selfSchema.safeParse(input);
                    if (!parsed.success)
                        return invalid('selfEvaluation', parsed.error.issues[0].message);
                    next = { ...next, state: 'self_evaluation', selfEvaluation: { ...parsed.data, submittedAt: null } };
                }
                else {
                    if (!before.selfEvaluation || Object.entries(before.selfEvaluation).some(([key, value]) => key !== 'submittedAt' && !(value as string)?.trim()))
                        return invalid('selfEvaluation', 'Complete each self-evaluation area before submitting.');
                    next = { ...next, state: 'reviewer_scoring', selfEvaluation: { ...before.selfEvaluation, submittedAt: this.requests.now() } };
                }
            }
            else if (action === 'save_scores' || action === 'submit_review') {
                if (actor.employeeId !== before.reviewerEmployeeId || actor.employeeId === before.employeeId || before.state !== 'reviewer_scoring' || !hasPermission(actor, 'evaluation.manage') || !hasPermission(actor, 'evaluation.private.view'))
                    return indistinguishableNotFound();
                const weighting = (await tx.weightings()).find(w => w.version === before.weightingVersion);
                if (!weighting)
                    return conflict('The recorded weighting is unavailable.');
                if (action === 'save_scores') {
                    const parsed = z.object({ scores: z.array(z.object({ area: z.enum(AREAS as [
                                EvaluationAreaKey,
                                ...EvaluationAreaKey[]
                            ]), score: z.number().int().min(1).max(5), comment: z.string().trim().min(1).max(10000), competencies: z.array(z.object({ area: z.enum(['work_quality', 'timeliness', 'responsibility', 'communication', 'teamwork', 'problem_solving', 'initiative', 'documentation', 'learning_improvement']), score: z.number().int().min(1).max(5), comment: z.string().trim().min(1).max(10000) })).optional() })), summary: z.string().max(10000).nullable() }).safeParse(input);
                    if (!parsed.success)
                        return invalid('scores', 'Provide a score of 1–5 and a comment for every required area.');
                    const score = weightedScore(parsed.data.scores, weighting.weights);
                    if (score === null)
                        return invalid('scores', 'Score each of the six areas exactly once.');
                    next = {
                        ...next, reviewerScores: parsed.data.scores, reviewerSummary: parsed.data.summary, weightedScore: score
                    };
                }
                else {
                    if (weightedScore(before.reviewerScores, weighting.weights) === null || !completeCompetencies(before.reviewerScores))
                        return invalid('scores', 'Complete all six weighted areas and the nine qualitative scores and comments before submitting.');
                    const facts = await this.facts(tx, before.employeeId, period);
                    if (facts.status !== 'success')
                        return facts;
                    next = { ...next, state: 'hr_review', facts: facts.data };
                }
            }
            else {
                if (!this.manager(actor) || !hasPermission(actor, 'evaluation.private.view') || before.state !== 'hr_review')
                    return indistinguishableNotFound();
                if (action === 'return') {
                    if (typeof input !== 'string' || !input.trim())
                        return invalid('reason', 'Explain why the review needs revision.');
                    next = { ...next, state: 'reviewer_scoring' };
                }
                else
                    next = {
                        ...next, state: 'published', publishedAt: this.requests.now(), publishedBy: { userId: actor.userId, displayName: 'HR' }
                    };
            }
            await this.persist(tx, next);
            await tx.record(actor, 'evaluation', id, before, next, action === 'return' ? String(input) : null);
            if (next.state === 'published')
                await tx.job(`evaluation:${id}:published`, 'evaluation.published', this.requests.now(), { id }, next.employeeId, id);
            return success(this.disclose(actor, next));
        }));
    }
}
