import type { TeamTimesheetService } from '@/contracts/services';
import type { TeamTimesheetRowView } from '@/contracts/view-models';
import type { ListQuery } from '@/contracts/query';
import { invalid } from './validation';
import { BackendTimesheetService, paginate } from './adapters';
import type { TimeApplication } from './application';
/** Team views consume the same authorized day results as the employee views. */
export class BackendTeamTimesheetService implements TeamTimesheetService {
    constructor(private readonly app: TimeApplication) { }
    getEmployeeDay(input: {
        employeeId: string;
        date: string;
    }) { return new BackendTimesheetService(this.app).getDay(input); }
    async listTeamDays(query: ListQuery) {
        const range = query.filters?.dateRange;
        if (!range)
            return invalid('dateRange', 'Choose a date range.');
        const actor = await this.app.resolveActor(range.from);
        if (!actor)
            return { status: 'unauthenticated' as const, code: 'UNAUTHENTICATED' as const, message: 'Sign in to continue.', reason: 'no_session' as const };
        const employeeIds = query.filters?.employeeIds ?? [...actor.employeeIds];
        const rows: TeamTimesheetRowView[] = [];
        for (const employeeId of employeeIds) {
            const summaries = await this.app.summaries(employeeId, range.from, range.to);
            if (summaries.status !== 'success')
                return summaries;
            for (const summary of summaries.data) {
                if (query.filters?.dayStatuses && !query.filters.dayStatuses.includes(summary.status))
                    continue;
                const day = await this.getEmployeeDay({ employeeId, date: summary.workDate });
                if (day.status !== 'success')
                    return day;
                if (query.filters?.divisionIds && !day.data.divisionContributions.some((c) => query.filters!.divisionIds!.includes(c.division.id)))
                    continue;
                const employee = await this.app.repository.employeeRef(employeeId);
                if (!employee)
                    continue;
                if (query.search?.term && !`${employee.fullName} ${employee.employeeCode}`.toLowerCase().includes(query.search.term.trim().toLowerCase()))
                    continue;
                rows.push({ employee, date: summary.workDate, dateLabel: day.data.dateLabel, active: day.data.summary.active, break: day.data.summary.break, total: day.data.summary.total, divisionContributions: day.data.divisionContributions, workLocations: [...new Set(day.data.entries.map((e) => e.workLocationLabel))], status: day.data.summary.status, hasOpenRemark: day.data.remarks.some((r) => r.state !== 'resolved'), href: `/team/timesheets/${employeeId}/${summary.workDate}` });
            }
        }
        rows.sort((a, b) => (query.sort?.direction === 'desc' ? -1 : 1) * (a.date.localeCompare(b.date) || a.employee.id.localeCompare(b.employee.id)));
        return paginate(rows, query);
    }
}
