/**
 * Tasks, remarks, and the employee dashboard view.
 *
 * Actual time on a task or project is always derived from linked time entries
 * here, never read from a stored total (`REQ-WORK-002`, `REQ-WORK-007`).
 */

import type { GeneralRemark, Task } from '@/contracts/domain';
import { success, type Result } from '@/contracts/results';
import type {
  DeadlineView,
  EmployeeDashboardView,
  RemarkSummaryView,
  TaskSummaryView,
} from '@/contracts/view-models';
import { addDays, daysBetween, formatDate, formatDateWithWeekday } from '@/lib/format';
import { toDurationView, REMARK_STATE_LABEL, TASK_STATUS_LABEL } from '@/lib/status';
import { DEMO_TODAY, LEAVE_TYPES, STANDARD_POLICY } from '@/fixtures';
import { DIVISIONS, findAccountByUserId } from './accounts';
import { mockStore } from './store';
import {
  actualTaskMinutes,
  assignmentsFor,
  divisionById,
  projectById,
} from './organization';
import { summaryFor, weekStart } from './timesheet';
import { toReviewStateView } from './task-review';
import { aggregateSummaries } from '@/lib/calculation/engine';

const LATENCY_MS = 200;
const delay = (ms = LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

const EMPLOYEE_NAMES: Record<string, string> = {
  'emp-1001': 'Nadia Rahman',
  'emp-1002': 'Tanvir Ahmed',
  'emp-1003': 'Sadia Karim',
  'emp-1004': 'Sumaiya Noor',
  'emp-2001': 'Imran Hossain',
  'emp-2002': 'Farhana Islam',
  'emp-3001': 'Rezaul Haque',
};

function employeeRef(employeeId: string) {
  return {
    id: employeeId,
    fullName: EMPLOYEE_NAMES[employeeId] ?? employeeId,
    employeeCode: employeeId.replace('emp-', 'EMP-'),
    avatarUrl: null,
    designation: null,
  };
}

function divisionRef(divisionId: string) {
  const division = divisionById(divisionId);
  return division
    ? {
        id: division.id,
        name: division.name,
        code: division.code,
        isRestricted: division.isRestricted,
      }
    : { id: divisionId, name: divisionId, code: divisionId, isRestricted: false };
}

export function toTaskSummary(task: Task): TaskSummaryView {
  const project = projectById(task.projectId);
  const actual = actualTaskMinutes(task.id);
  const isOverdue =
    task.status !== 'completed' && task.dueDate !== null && task.dueDate < DEMO_TODAY;

  return {
    id: task.id,
    title: task.title,
    project: project
      ? { id: project.id, name: project.name, code: project.code, divisionId: project.divisionId }
      : { id: task.projectId, name: task.projectId, code: '', divisionId: task.divisionId },
    division: divisionRef(task.divisionId),
    assignee: employeeRef(task.assigneeEmployeeId),
    status: task.status,
    statusLabel: TASK_STATUS_LABEL[task.status],
    priority: task.priority,
    dueDate: task.dueDate,
    dueDateLabel: task.dueDate ? formatDate(task.dueDate) : null,
    isOverdue,
    estimated: toDurationView(task.estimatedMinutes),
    actual: toDurationView(actual),
    review: toReviewStateView(task),
    variancePercent:
      task.estimatedMinutes > 0
        ? Math.round(((actual - task.estimatedMinutes) / task.estimatedMinutes) * 100)
        : null,
    href: `/tasks/${task.id}`,
  };
}

export function toRemarkSummary(remark: GeneralRemark): RemarkSummaryView {
  const related =
    remark.relatedRecord.type === 'timesheet'
      ? {
          label: `Timesheet · ${formatDate(remark.relatedRecord.workDate)}`,
          href: `/timesheets/${remark.relatedRecord.workDate}`,
        }
      : remark.relatedRecord.type === 'task'
        ? {
            label: `Task · ${mockStore.findTask(remark.relatedRecord.taskId)?.title ?? 'Task'}`,
            href: `/tasks/${remark.relatedRecord.taskId}`,
          }
        : { label: null, href: null };

  return {
    id: remark.id,
    author: employeeRef(remark.authorEmployeeId),
    employee: employeeRef(remark.employeeId),
    message: remark.message,
    createdAtLabel: formatDate(remark.createdAt.slice(0, 10)),
    state: remark.state,
    stateLabel: REMARK_STATE_LABEL[remark.state],
    isCorrectionRequest: remark.isCorrectionRequest,
    relatedLabel: related.label,
    relatedHref: related.href,
    responseCount: remark.responses.length,
    href: `/remarks/${remark.id}`,
  };
}

export const mockTaskService = {
  async listForEmployee(employeeId: string): Promise<Result<readonly TaskSummaryView[]>> {
    await delay();
    const tasks = mockStore
      .tasks()
      .filter(
        (task) =>
          task.assigneeEmployeeId === employeeId ||
          task.supportingMemberIds.includes(employeeId),
      )
      .map(toTaskSummary);
    return success(tasks);
  },

  async getById(taskId: string) {
    await delay();
    const task = mockStore.findTask(taskId);
    if (!task) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'Task not found.' };
    }

    const entries = mockStore
      .entriesForTask(taskId)
      .filter((entry) => entry.state !== 'draft')
      .sort((a, b) => b.workDate.localeCompare(a.workDate));

    return success({
      summary: toTaskSummary(task),
      description: task.description,
      checklist: mockStore.checklistFor(taskId),
      supportingMembers: task.supportingMemberIds.map(employeeRef),
      entries: entries.map((entry) => ({
        id: entry.id,
        workDate: entry.workDate,
        workDateLabel: formatDate(entry.workDate),
        duration: toDurationView(entry.activeMinutes),
        completedWork: entry.completedWork,
        division: divisionRef(entry.divisionId),
      })),
    });
  },

  async setChecklistItem(itemId: string, isDone: boolean): Promise<Result<void>> {
    await delay(120);
    mockStore.setChecklistItem(itemId, isDone);
    return success(undefined);
  },

  async setStatus(taskId: string, status: Task['status']) {
    await delay();
    const task = mockStore.findTask(taskId);
    if (!task) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'Task not found.' };
    }
    mockStore.updateTask(taskId, {
      ...task,
      status,
      completedDate: status === 'completed' ? DEMO_TODAY : null,
    });
    return success(undefined);
  },
};

export const mockRemarkService = {
  async listForEmployee(employeeId: string): Promise<Result<readonly RemarkSummaryView[]>> {
    await delay();
    const remarks = mockStore
      .remarksFor(employeeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toRemarkSummary);
    return success(remarks);
  },

  async getById(remarkId: string) {
    await delay();
    const remark = mockStore.findRemark(remarkId);
    if (!remark) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'Remark not found.' };
    }
    return success({
      summary: toRemarkSummary(remark),
      requestedChanges: remark.requestedChanges,
      responses: remark.responses.map((response) => ({
        id: response.id,
        author: employeeRef(response.authorEmployeeId),
        message: response.message,
        createdAtLabel: formatDate(response.createdAt.slice(0, 10)),
      })),
    });
  },

  async respond(remarkId: string, message: string, employeeId: string) {
    await delay();
    const remark = mockStore.findRemark(remarkId);
    if (!remark) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'Remark not found.' };
    }

    // The clarification is added, never replacing the original remark
    // (`REQ-RMK-006`): the history stays intact.
    mockStore.updateRemark(remarkId, {
      ...remark,
      state: 'responded',
      responses: [
        ...remark.responses,
        {
          id: `rsp-${Date.now()}`,
          remarkId,
          authorEmployeeId: employeeId,
          message,
          createdAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    });
    return success(undefined);
  },
};

/* -------------------------------------------------------------------------- */
/* Employee dashboard                                                         */
/* -------------------------------------------------------------------------- */

function monthOf(date: string): { from: string; to: string } {
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${date.slice(0, 7)}-01`,
    to: `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

function summariesBetween(employeeId: string, from: string, to: string) {
  const span = daysBetween(from, to);
  const result = [];
  for (let offset = 0; offset <= span; offset += 1) {
    result.push(summaryFor(employeeId, addDays(from, offset)));
  }
  return result;
}

function totalsView(label: string, summaries: ReturnType<typeof summariesBetween>) {
  const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);
  return {
    label,
    active: toDurationView(totals.activeMinutes),
    break: toDurationView(totals.breakMinutes),
    total: toDurationView(totals.totalMinutes),
    overtime: toDurationView(totals.overtimeMinutes),
    requiredActive: toDurationView(totals.requiredActiveMinutes),
    completeDayCount: totals.completeDayCount,
    underTimeDayCount: totals.underTimeDayCount,
    overtimeDayCount: totals.overtimeDayCount,
    criticalDayCount: totals.criticalDayCount,
    missingDayCount: totals.missingDayCount,
  };
}

export const mockDashboardService = {
  async getEmployeeDashboard(
    userId: string,
    date: string = DEMO_TODAY,
  ): Promise<Result<EmployeeDashboardView>> {
    await delay();

    const account = findAccountByUserId(userId);
    const employeeId = account?.employeeId ?? 'emp-1001';

    const today = summaryFor(employeeId, date);
    const todayView = {
      date,
      dateLabel: formatDateWithWeekday(date),
      active: toDurationView(today.activeMinutes),
      break: toDurationView(today.breakMinutes),
      total: toDurationView(today.totalMinutes),
      requiredActive: toDurationView(today.requiredActiveMinutes),
      remainingActive: toDurationView(today.remainingActiveMinutes),
      scheduleProgressPercent:
        today.requiredTotalMinutes > 0
          ? Math.min(
              100,
              Math.round((today.totalMinutes / today.requiredTotalMinutes) * 100),
            )
          : 0,
      status: {
        status: today.status,
        label: '',
        accessibleLabel: '',
        tone: 'complete' as const,
      },
      attendance: today.attendance,
      isLocked: today.isLocked,
      overtimeReason: today.overtimeReason,
      criticalExplanation: today.criticalExplanation,
    };

    const weekFrom = weekStart(date);
    const week = summariesBetween(employeeId, weekFrom, addDays(weekFrom, 6));
    const month = monthOf(date);
    const monthSummaries = summariesBetween(employeeId, month.from, month.to);

    const tasks = mockStore
      .tasks()
      .filter((task) => task.assigneeEmployeeId === employeeId);

    const activeTasks = tasks
      .filter((task) => task.status !== 'completed')
      .map(toTaskSummary);

    const upcoming: DeadlineView[] = tasks
      .filter((task) => task.status !== 'completed' && task.dueDate)
      .map((task) => ({
        taskId: task.id,
        title: task.title,
        dueDate: task.dueDate as string,
        dueDateLabel: formatDate(task.dueDate as string),
        daysRemaining: daysBetween(date, task.dueDate as string),
        isOverdue: (task.dueDate as string) < date,
        href: `/tasks/${task.id}`,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);

    const timer = mockStore.getTimer();
    const elapsedMinutes = timer
      ? Math.max(0, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60000))
      : 0;

    const monthTotalActive = monthSummaries.reduce(
      (total, summary) => total + summary.activeMinutes,
      0,
    );
    const byDivision = new Map<string, number>();
    for (const summary of monthSummaries) {
      for (const contribution of summary.divisionContributions) {
        byDivision.set(
          contribution.divisionId,
          (byDivision.get(contribution.divisionId) ?? 0) + contribution.activeMinutes,
        );
      }
    }

    const wfhRequest = mockStore
      .wfhFor(employeeId)
      .filter((request) => request.wfhDate >= date)
      .sort((a, b) => a.wfhDate.localeCompare(b.wfhDate))[0];

    const view: EmployeeDashboardView = {
      today: todayView,
      runningTimer: timer
        ? {
            sessionId: timer.id,
            startedAt: timer.startedAt,
            elapsed: toDurationView(elapsedMinutes),
            division: divisionRef(timer.divisionId),
            project: timer.projectId
              ? (() => {
                  const project = projectById(timer.projectId);
                  return project
                    ? {
                        id: project.id,
                        name: project.name,
                        code: project.code,
                        divisionId: project.divisionId,
                      }
                    : null;
                })()
              : null,
            task: timer.taskId
              ? (() => {
                  const task = mockStore.findTask(timer.taskId);
                  return task
                    ? {
                        id: task.id,
                        title: task.title,
                        projectId: task.projectId,
                        status: task.status,
                      }
                    : null;
                })()
              : null,
            workLocation: timer.workLocation,
            wasRecovered: false,
          }
        : null,
      todaysDivisions: today.divisionContributions.map((contribution) => ({
        division: divisionRef(contribution.divisionId),
        active: toDurationView(contribution.activeMinutes),
        sharePercent:
          today.activeMinutes > 0
            ? Math.round((contribution.activeMinutes / today.activeMinutes) * 100)
            : 0,
      })),
      activeTasks,
      upcomingDeadlines: upcoming,
      weekly: totalsView('This week', week),
      monthly: totalsView('This month', monthSummaries),
      missingDates: monthSummaries
        .filter((summary) => summary.status === 'missing')
        .map((summary) => summary.workDate),
      recentRemarks: mockStore
        .remarksFor(employeeId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4)
        .map(toRemarkSummary),
      wfhStatus: wfhRequest
        ? {
            id: wfhRequest.id,
            kind: 'wfh',
            employee: employeeRef(employeeId),
            dateLabel: formatDate(wfhRequest.wfhDate),
            portionLabel: wfhRequest.portion === 'half_day' ? 'Half day' : 'Full day',
            reason: wfhRequest.reason,
            state: wfhRequest.state,
            stateLabel: wfhRequest.state,
            decidedByLabel: wfhRequest.decision?.decidedBy.displayName ?? null,
            wasOverridden: false,
            href: '/wfh',
          }
        : null,
      leaveBalances: LEAVE_TYPES.map((type) => ({
        typeLabel: type.label,
        entitledDays: type.annualEntitlementDays ?? 0,
        consumedDays: 0,
        remainingDays: type.annualEntitlementDays ?? 0,
      })),
      divisionContribution: [...byDivision.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([divisionId, minutes]) => ({
          division: divisionRef(divisionId),
          active: toDurationView(minutes),
          sharePercent:
            monthTotalActive > 0 ? Math.round((minutes / monthTotalActive) * 100) : 0,
        })),
      recentlyCompletedTasks: tasks
        .filter((task) => task.status === 'completed')
        .map(toTaskSummary)
        .slice(0, 3),
      quickActions: [
        { key: 'add_time', label: 'Add time', href: `/timesheets/${date}`, enabled: !today.isLocked },
        { key: 'start_timer', label: 'Start timer', href: `/timesheets/${date}`, enabled: !timer },
        { key: 'request_wfh', label: 'Request WFH', href: '/wfh', enabled: true },
        { key: 'apply_leave', label: 'Apply for leave', href: '/leave', enabled: true },
      ],
    };

    return success(view);
  },
};

export const mockDivisionsService = {
  async listForEmployee(employeeId: string) {
    await delay();
    const assignments = assignmentsFor(employeeId).map((assignment) => ({
      id: assignment.id,
      division: divisionRef(assignment.divisionId),
      isPrimary: assignment.isPrimary,
      teamLead: assignment.teamLeadEmployeeId
        ? employeeRef(assignment.teamLeadEmployeeId)
        : null,
      allocationPercent: assignment.allocationPercent,
      expectedWeekly: toDurationView(assignment.expectedWeeklyMinutes),
      startDateLabel: formatDate(assignment.startDate),
      endDateLabel: assignment.endDate ? formatDate(assignment.endDate) : null,
      isTemporary: assignment.isTemporary,
      isActive: assignment.isActive,
      isEffectiveToday:
        DEMO_TODAY >= assignment.startDate &&
        (!assignment.endDate || DEMO_TODAY <= assignment.endDate),
    }));

    const totalAllocation = assignments
      .filter((assignment) => assignment.isEffectiveToday && assignment.isActive)
      .reduce((total, assignment) => total + assignment.allocationPercent, 0);

    return success({ assignments, totalAllocation });
  },
};

export { DIVISIONS };
