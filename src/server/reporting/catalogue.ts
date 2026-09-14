import { hasPermission, type ActorPolicyContext } from '@/server/authorization/policy';
import type { ReportCategory } from '@/contracts/reporting';
export interface ReportSpec {
    key: string;
    title: string;
    category: ReportCategory;
    group: 'day' | 'week' | 'month' | 'employee' | 'division' | 'project' | 'task' | 'hr';
    permission: string;
    financial?: boolean;
    costOnly?: boolean;
}
const time = (key: string, title: string, group: ReportSpec['group'] = 'day'): ReportSpec => ({ key, title, group, category: 'timesheet', permission: 'report.read' });
const hr = (key: string, title: string, category: ReportCategory = 'hr'): ReportSpec => ({ key, title, group: 'hr', category, permission: 'report.hr.read' });
const finance = (key: string, title: string, group: ReportSpec['group'] = 'employee', costOnly = false): ReportSpec => ({ key, title, group, category: 'finance', permission: 'report.finance.read', financial: true, costOnly });
export const REPORTS: readonly ReportSpec[] = [
    time('timesheet-detail', 'Daily timesheet'), time('weekly-hours', 'Weekly hours', 'week'), time('monthly-hours', 'Monthly hours', 'month'),
    time('employee-hours', 'Employee hours', 'employee'), time('division-contribution', 'Division contribution', 'division'), time('project-hours', 'Project hours', 'project'), time('task-hours', 'Task hours', 'task'),
    time('overtime-summary', 'Overtime summary'), time('under-time', 'Under-time'), time('missing', 'Missing time'), time('critical', 'Critical time'), time('wfh-hours', 'WFH hours'),
    hr('attendance-register', 'Attendance register', 'attendance'), hr('leave-register', 'Leave register'), hr('wfh-register', 'WFH register', 'wfh'),
    hr('evaluation-progress', 'Evaluation progress', 'evaluation'), hr('performance-history', 'Performance history', 'evaluation'), hr('workload-capacity', 'Workload and capacity', 'workload'), hr('headcount', 'Headcount and assignments'), hr('remarks-register', 'Remarks and corrections', 'remarks'),
    finance('payroll-hours', 'Payroll hours and cost'), finance('finance-overtime', 'Verified overtime', 'day'), finance('project-cost', 'Project labour cost', 'project'), finance('division-cost', 'Division labour cost', 'division'), finance('billable-hours', 'Billable and non-billable hours', 'project'), finance('budget-actual', 'Budget versus actual', 'project', true), finance('cost-rates', 'Effective cost rates', 'hr', true), finance('payroll-ready', 'Payroll-ready data'),
];
export function canRun(actor: ActorPolicyContext, spec: ReportSpec) {
    const allowed = hasPermission(actor, spec.permission) || (spec.permission === 'report.read' && hasPermission(actor, 'report.hr.read'));
    return allowed && (!spec.costOnly || hasPermission(actor, 'finance.cost.view'));
}
