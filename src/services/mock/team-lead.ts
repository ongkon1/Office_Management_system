import type {
  EvaluationAreaKey,
  GeneralRemark,
  Project,
  Task,
  TaskStatus,
} from '@/contracts/domain';
import { SENSITIVE_PERMISSIONS } from '@/contracts/domain';
import type {
  TeamEvaluationView,
  TeamLeadService,
  TeamProjectView,
  TeamRequestView,
  TeamTaskView,
  WorkloadMemberView,
} from '@/contracts/team-lead';
import { success } from '@/contracts/results';
import type { TeamTimesheetRowView } from '@/contracts/view-models';
import {
  formatDate,
  formatDateWithWeekday,
  formatMoney,
} from '@/lib/format';
import {
  ATTENDANCE_LABEL,
  toDayStatusView,
  toDurationView,
  WORK_LOCATION_LABEL,
} from '@/lib/status';
import { DEMO_TODAY, PROJECTS } from '@/fixtures';
import {
  DEMO_ACCOUNTS,
  DIVISIONS,
  findAccountByUserId,
} from './accounts';
import { actualProjectMinutes, actualTaskMinutes } from './organization';
import { buildDayView, summaryFor } from './timesheet';
import { mockStore } from './store';

const WAIT_MS = 120;
const delay = () => new Promise((resolve) => setTimeout(resolve, WAIT_MS));
const notFound = (message: string) => ({
  status: 'not_found' as const,
  code: 'NOT_FOUND' as const,
  message,
});
const denied = () => ({
  status: 'permission_denied' as const,
  code: 'FORBIDDEN' as const,
  message: 'This record is outside your assigned Team Lead scope.',
  guidance: 'Choose an employee, division, or project assigned to you.',
});

function account(userId: string) {
  return findAccountByUserId(userId);
}

function employeeAccount(employeeId: string) {
  return DEMO_ACCOUNTS.find((item) => item.employeeId === employeeId);
}

function employeeRef(employeeId: string) {
  const item = employeeAccount(employeeId);
  return {
    id: employeeId,
    fullName: item?.fullName ?? employeeId,
    employeeCode: item?.employeeCode ?? employeeId,
    avatarUrl: null,
    designation: item?.designation ?? null,
  };
}

function divisionRef(divisionId: string) {
  const item = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return item
    ? { ...item }
    : { id: divisionId, name: divisionId, code: divisionId.toUpperCase(), isRestricted: false };
}

function inEmployeeScope(userId: string, employeeId: string) {
  return account(userId)?.scopedEmployeeIds.includes(employeeId) ?? false;
}

function inDivisionScope(userId: string, divisionId: string) {
  const viewer = account(userId);
  if (!viewer?.scopedDivisionIds.includes(divisionId)) return false;
  if (divisionId !== 'gov') return true;
  return viewer.permissions.includes(SENSITIVE_PERMISSIONS.governmentProjects);
}

function actorFor(userId: string) {
  return { userId, displayName: account(userId)?.fullName ?? 'Team Lead' };
}

function teamDates(): readonly string[] {
  return [DEMO_TODAY, '2026-09-01', '2026-08-27', '2026-08-26', '2026-08-24'];
}

function rowFor(employeeId: string, date: string): TeamTimesheetRowView {
  const summary = summaryFor(employeeId, date);
  const entries = mockStore.entriesFor(employeeId, date).filter((entry) => entry.state !== 'draft');
  const total = summary.activeMinutes || 1;
  return {
    employee: employeeRef(employeeId),
    date,
    dateLabel: formatDate(date),
    active: toDurationView(summary.activeMinutes),
    break: toDurationView(summary.breakMinutes),
    total: toDurationView(summary.totalMinutes),
    divisionContributions: summary.divisionContributions.map((contribution) => ({
      division: divisionRef(contribution.divisionId),
      active: toDurationView(contribution.activeMinutes),
      sharePercent: Math.round((contribution.activeMinutes / total) * 100),
    })),
    workLocations: [...new Set(entries.map((entry) => WORK_LOCATION_LABEL[entry.workLocation]))],
    status: toDayStatusView(summary.status),
    hasOpenRemark: mockStore.remarksFor(employeeId).some(
      (remark) =>
        remark.state !== 'resolved' &&
        remark.relatedRecord.type === 'timesheet' &&
        remark.relatedRecord.workDate === date,
    ),
    href: `/team/timesheets/${employeeId}/${date}`,
  };
}

let projects: Project[] = [...PROJECTS];
const projectMembers = new Map<string, readonly string[]>(
  PROJECTS.map((project) => [
    project.id,
    [...new Set(mockStore.tasks().filter((task) => task.projectId === project.id).map((task) => task.assigneeEmployeeId))],
  ]),
);

function projectView(project: Project, userId: string): TeamProjectView {
  const viewer = account(userId);
  const actual = actualProjectMinutes(project.id);
  const memberIds = projectMembers.get(project.id) ?? [];
  const canSeeBudget = Boolean(
    viewer?.permissions.includes(SENSITIVE_PERMISSIONS.financialDetail),
  );
  return {
    id: project.id,
    name: project.name,
    code: project.code,
    division: divisionRef(project.divisionId),
    manager: employeeRef(project.managerEmployeeId),
    memberCount: memberIds.length,
    client: project.client,
    startDateLabel: formatDate(project.startDate),
    endDateLabel: project.endDate ? formatDate(project.endDate) : null,
    priority: project.priority,
    status: project.status,
    completionPercent: project.completionPercent,
    estimated: toDurationView(project.estimatedMinutes),
    actual: toDurationView(actual),
    budgetLabel:
      project.budget?.visible && project.budget.value && canSeeBudget
        ? formatMoney(project.budget.value)
        : null,
    budgetRestricted: Boolean(project.budget && !canSeeBudget),
    notes: project.notes,
  };
}

function taskView(task: Task): TeamTaskView {
  const project = projects.find((item) => item.id === task.projectId);
  const history = mockStore.entriesForTask(task.id).filter((entry) => entry.state !== 'draft');
  return {
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    projectLabel: project ? `${project.code} · ${project.name}` : task.projectId,
    division: divisionRef(task.divisionId),
    assignee: employeeRef(task.assigneeEmployeeId),
    supportingMembers: task.supportingMemberIds.map(employeeRef),
    status: task.status,
    priority: task.priority,
    startDateLabel: task.startDate ? formatDate(task.startDate) : null,
    dueDateLabel: task.dueDate ? formatDate(task.dueDate) : null,
    estimated: toDurationView(task.estimatedMinutes),
    actual: toDurationView(actualTaskMinutes(task.id)),
    isOverdue: Boolean(task.status !== 'completed' && task.dueDate && task.dueDate < DEMO_TODAY),
    description: task.description,
    checklist: mockStore.checklistFor(task.id),
    workHistory: history.map((entry) => ({
      id: entry.id,
      dateLabel: formatDate(entry.workDate),
      duration: toDurationView(entry.activeMinutes),
      completedWork: entry.completedWork,
    })),
  };
}

function requestView(request: ReturnType<typeof mockStore.allWfhRequests>[number] | ReturnType<typeof mockStore.allLeaveRequests>[number], kind: 'wfh' | 'leave'): TeamRequestView {
  const person = employeeAccount(request.employeeId);
  const divisionId = kind === 'wfh'
    ? 'divisionId' in request ? request.divisionId : person?.primaryDivisionId ?? 'pia'
    : person?.primaryDivisionId ?? 'pia';
  const dateLabel = kind === 'wfh' && 'wfhDate' in request
    ? formatDateWithWeekday(request.wfhDate)
    : 'startDate' in request
      ? request.startDate === request.endDate
        ? formatDateWithWeekday(request.startDate)
        : `${formatDate(request.startDate)} – ${formatDate(request.endDate)}`
      : '';
  return {
    id: request.id,
    kind,
    employee: employeeRef(request.employeeId),
    division: divisionRef(divisionId),
    dateLabel,
    portionLabel: request.portion === 'half_day' ? 'Half day' : 'Full day',
    reason: request.reason,
    details: kind === 'wfh' && 'plannedTasks' in request
      ? `${request.plannedTasks} ${request.contactAvailability}`
      : 'leaveType' in request
        ? `${request.leaveType.replace('_', ' ')} leave · ${request.totalDays} day${request.totalDays === 1 ? '' : 's'}`
        : '',
    state: request.state,
    decisionLabel: request.decision
      ? `${request.decision.outcome.replace('_', ' ')} by ${request.decision.decidedBy.displayName}`
      : null,
    overrideReason: request.decision?.override?.reason ?? null,
  };
}

const AREAS: readonly EvaluationAreaKey[] = [
  'task_completion',
  'work_quality',
  'timeliness',
  'teamwork_communication',
  'responsibility',
  'learning_initiative',
];
const EVALUATION_WEIGHTS: Readonly<Record<EvaluationAreaKey, number>> = {
  task_completion: 30,
  work_quality: 25,
  timeliness: 15,
  teamwork_communication: 10,
  responsibility: 10,
  learning_initiative: 10,
};

function initialEvaluation(employeeId: string, index: number): TeamEvaluationView {
  const scores = Object.fromEntries(AREAS.map((area) => [area, index === 0 ? 4 : 0])) as Record<EvaluationAreaKey, number>;
  const comments = Object.fromEntries(AREAS.map((area) => [area, ''])) as Record<EvaluationAreaKey, string>;
  return {
    id: `eval-${employeeId}`,
    employee: employeeRef(employeeId),
    periodLabel: 'Q3 2026',
    dueDateLabel: '30 Sep 2026',
    state: index === 0 ? 'reviewer_scoring' : index === 1 ? 'not_started' : 'published',
    weightedScore: index === 0 ? 4 : index === 2 ? 4.3 : null,
    facts: [
      { label: 'Active work', value: index === 1 ? '121:35' : '139:20' },
      { label: 'Missing days', value: index === 1 ? '2' : '0' },
      { label: 'Tasks completed', value: index === 2 ? '9' : '6' },
      { label: 'Estimate variance', value: index === 1 ? '+18%' : '+4%' },
      { label: 'WFH days', value: index === 0 ? '2' : '1' },
      { label: 'General remarks', value: index === 0 ? '2' : '1' },
    ],
    scores,
    comments,
    summary: index === 0 ? 'Strong delivery with clear communication on blockers.' : '',
  };
}

let evaluations: TeamEvaluationView[] = [
  initialEvaluation('emp-1001', 0),
  initialEvaluation('emp-1002', 1),
  initialEvaluation('emp-1004', 2),
];

export const mockTeamLeadService: TeamLeadService = {
  async listTimesheets(userId) {
    await delay();
    const viewer = account(userId);
    if (!viewer || viewer.primaryRole !== 'team_lead') return denied();
    const rows = viewer.scopedEmployeeIds.flatMap((employeeId) =>
      teamDates().map((date) => rowFor(employeeId, date)),
    );
    return success(rows.sort((a, b) => b.date.localeCompare(a.date)));
  },

  async listMembers(userId) {
    await delay();
    const viewer = account(userId);
    if (!viewer || viewer.primaryRole !== 'team_lead') return denied();
    return success(viewer.scopedEmployeeIds.map((employeeId) => {
      const row = rowFor(employeeId, DEMO_TODAY);
      const divisions = mockStore.assignments().filter((item) => item.employeeId === employeeId && item.isActive)
        .filter((item) => inDivisionScope(userId, item.divisionId))
        .map((item) => divisionRef(item.divisionId));
      return {
        employee: row.employee,
        divisions,
        attendanceLabel: ATTENDANCE_LABEL[summaryFor(employeeId, DEMO_TODAY).attendance],
        active: row.active,
        status: row.status,
        openRemarkCount: mockStore.remarksFor(employeeId).filter((item) => item.state !== 'resolved').length,
      };
    }));
  },

  async getDashboard(userId) {
    const membersResult = await this.listMembers(userId);
    if (membersResult.status !== 'success') return membersResult;
    const timesheetsResult = await this.listTimesheets(userId);
    if (timesheetsResult.status !== 'success') return timesheetsResult;
    const projectsResult = await this.listProjects(userId);
    if (projectsResult.status !== 'success') return projectsResult;
    const requestsResult = await this.listRequests(userId);
    if (requestsResult.status !== 'success') return requestsResult;
    const workloadResult = await this.listWorkload(userId);
    if (workloadResult.status !== 'success') return workloadResult;
    const todayRows = timesheetsResult.data.filter((row) => row.date === DEMO_TODAY);
    const counts = (status: TeamTimesheetRowView['status']['status']) =>
      timesheetsResult.data.filter((row) => row.status.status === status).length;
    const metric = (key: string, label: string, value: number, tone: 'negative' | 'caution' = 'caution') => ({
      key, label, value: String(value), tone, href: `/team/timesheets?status=${key}`,
    } as const);
    const tasks = mockStore.tasks().filter((task) => inDivisionScope(userId, task.divisionId));
    const assigned = membersResult.data.length || 1;
    return success({
      assignedHeadcount: membersResult.data.length,
      workingToday: todayRows.filter((row) => row.active.minutes > 0).length,
      attendanceBreakdown: ['Office', 'WFH', 'Field Duty', 'Official Travel', 'Approved leave'].map((label) => ({
        state: label === 'WFH' ? 'wfh' : label === 'Field Duty' ? 'field_duty' : label === 'Official Travel' ? 'official_travel' : label === 'Approved leave' ? 'approved_leave' : 'office',
        label,
        count: membersResult.data.filter((member) => member.attendanceLabel === label).length,
        href: '/team',
      })),
      exceptions: {
        missing: metric('missing', 'Missing', counts('missing'), 'negative'),
        underTime: metric('under_time', 'Under-time', counts('under_time')),
        overtime: metric('overtime', 'Overtime', counts('overtime')),
        critical: metric('critical', 'Critical', counts('critical'), 'negative'),
      },
      divisionHours: membersResult.data.flatMap((member) => member.divisions).filter((division, index, all) => all.findIndex((item) => item.id === division.id) === index).map((division) => ({
        division,
        active: toDurationView(timesheetsResult.data.reduce((total, row) => total + (row.divisionContributions.find((item) => item.division.id === division.id)?.active.minutes ?? 0), 0)),
        sharePercent: Math.round(100 / Math.max(1, membersResult.data.flatMap((member) => member.divisions).length)),
      })),
      projectProgress: projectsResult.data.slice(0, 4).map((project) => ({
        project: { id: project.id, name: project.name, code: project.code, divisionId: project.division.id },
        completionPercent: project.completionPercent,
        estimated: project.estimated,
        actual: project.actual,
        variancePercent: project.estimated.minutes ? Math.round(((project.actual.minutes - project.estimated.minutes) / project.estimated.minutes) * 100) : null,
        status: project.status,
        budget: project.budgetRestricted ? { visible: false, reason: 'permission_required' } : null,
        href: `/projects/${project.id}`,
      })),
      pendingTasks: tasks.filter((task) => task.status === 'pending').length,
      overdueTasks: tasks.filter((task) => task.status !== 'completed' && task.dueDate && task.dueDate < DEMO_TODAY).length,
      pendingRequests: requestsResult.data.filter((request) => request.state === 'pending' || request.state === 'information_requested').map((request) => ({
        id: request.id,
        kind: request.kind,
        employee: request.employee,
        dateLabel: request.dateLabel,
        portionLabel: request.portionLabel,
        reason: request.reason,
        state: request.state,
        stateLabel: request.state.replace('_', ' '),
        decidedByLabel: request.decisionLabel,
        wasOverridden: Boolean(request.overrideReason),
        href: `/requests/${request.kind}/${request.id}`,
      })),
      workloadWarnings: workloadResult.data.filter((item) => item.warning).map((item) => ({
        employee: item.employee,
        weekLabel: '31 Aug – 6 Sep 2026',
        capacity: item.capacity,
        planned: item.assigned,
        actual: item.actual,
        utilizationPercent: item.utilizationPercent,
        warning: item.warning as 'overallocated' | 'underallocated',
        warningLabel: item.warning === 'overallocated' ? 'Overallocated' : 'Underallocated',
      })),
      recentEntries: timesheetsResult.data.filter((row) => row.active.minutes > 0).slice(0, 5),
      evaluationStatus: {
        periodLabel: 'Q3 2026', dueDateLabel: '30 Sep 2026', total: assigned,
        notStarted: evaluations.filter((item) => inEmployeeScope(userId, item.employee.id) && item.state === 'not_started').length,
        inProgress: evaluations.filter((item) => inEmployeeScope(userId, item.employee.id) && item.state === 'reviewer_scoring').length,
        submitted: evaluations.filter((item) => inEmployeeScope(userId, item.employee.id) && item.state === 'hr_review').length,
        published: evaluations.filter((item) => inEmployeeScope(userId, item.employee.id) && item.state === 'published').length,
        href: '/evaluations',
      },
    });
  },

  async getTimesheet(userId, employeeId, date) {
    await delay();
    if (!inEmployeeScope(userId, employeeId)) return denied();
    const day = buildDayView(employeeId, date);
    return success({
      ...day,
      employee: employeeRef(employeeId),
      teamReview:
        employeeId === 'emp-1002' && date === '2026-08-26'
          ? {
              clarification:
                'I took the standard break and split the completed work between layout and proofing.',
              correctedValues: [
                { label: 'Task attribution', before: 'Single layout block', after: 'Layout 6:30 · Proofing 2:00' },
                { label: 'Break', before: 'Not confirmed', after: '1:00 confirmed' },
              ],
            }
          : undefined,
    });
  },

  async addRemark({ userId, employeeId, date, message, requestedChanges }) {
    await delay();
    if (!inEmployeeScope(userId, employeeId)) return denied();
    const now = new Date().toISOString();
    const id = `rmk-${Date.now()}`;
    const remark: GeneralRemark = {
      id, employeeId, authorEmployeeId: account(userId)?.employeeId ?? userId, message,
      relatedRecord: { type: 'timesheet', workDate: date },
      isCorrectionRequest: Boolean(requestedChanges), requestedChanges,
      state: 'open', responses: [], createdAt: now, updatedAt: now,
      createdBy: actorFor(userId), updatedBy: actorFor(userId),
    };
    mockStore.addRemark(remark);
    return success({ id, state: remark.state });
  },

  async resolveRemark({ userId, remarkId }) {
    await delay();
    const remark = mockStore.findRemark(remarkId);
    if (!remark) return notFound('General remark not found.');
    if (!inEmployeeScope(userId, remark.employeeId)) return denied();
    mockStore.updateRemark(remarkId, { ...remark, state: 'resolved', updatedAt: new Date().toISOString(), updatedBy: actorFor(userId) });
    return success({ state: 'resolved' });
  },

  async listProjects(userId) {
    await delay();
    return success(projects.filter((project) => inDivisionScope(userId, project.divisionId)).map((project) => projectView(project, userId)));
  },

  async getProject(userId, id) {
    await delay();
    const project = projects.find((item) => item.id === id);
    if (!project || !inDivisionScope(userId, project.divisionId)) return notFound('Project not found.');
    return success(projectView(project, userId));
  },

  async saveProject(userId, input, id) {
    await delay();
    if (!inDivisionScope(userId, input.divisionId)) return denied();
    if (!input.name.trim() || !input.code.trim()) return {
      status: 'validation_failure', code: 'VALIDATION_FAILED', message: 'Complete the required project fields.', focusField: !input.name.trim() ? 'name' : 'code',
      fieldErrors: [{ field: !input.name.trim() ? 'name' : 'code', code: 'REQUIRED', message: 'This field is required.', guidance: 'Enter a value before saving.' }],
    };
    const existing = id ? projects.find((item) => item.id === id) : undefined;
    const now = new Date().toISOString();
    const project: Project = {
      id: existing?.id ?? `prj-${Date.now()}`, name: input.name.trim(), code: input.code.trim().toUpperCase(),
      divisionId: input.divisionId, managerEmployeeId: input.managerEmployeeId,
      client: input.client || null, startDate: input.startDate, endDate: input.endDate,
      priority: input.priority, description: existing?.description ?? null, estimatedMinutes: input.estimatedMinutes,
      budget: input.budgetAmount
        ? { visible: true, value: { amount: input.budgetAmount, currency: 'BDT' } }
        : existing?.budget ?? null,
      completionPercent: input.completionPercent, status: existing?.status ?? 'planned', isActive: existing?.isActive ?? true,
      acceptsTimeEntries: existing?.acceptsTimeEntries ?? true, notes: input.notes || null,
      createdAt: existing?.createdAt ?? now, createdBy: existing?.createdBy ?? actorFor(userId), updatedAt: now, updatedBy: actorFor(userId),
    };
    projects = existing ? projects.map((item) => item.id === id ? project : item) : [...projects, project];
    projectMembers.set(project.id, input.memberIds);
    return success(projectView(project, userId));
  },

  async listTasks(userId) {
    await delay();
    return success(mockStore.tasks().filter((task) => inDivisionScope(userId, task.divisionId)).map(taskView));
  },

  async getTask(userId, id) {
    await delay();
    const task = mockStore.findTask(id);
    if (!task || !inDivisionScope(userId, task.divisionId)) return notFound('Task not found.');
    return success(taskView(task));
  },

  async saveTask(userId, input, id) {
    await delay();
    const project = projects.find((item) => item.id === input.projectId);
    if (!project || !inDivisionScope(userId, project.divisionId)) return denied();
    if (!input.title.trim()) return {
      status: 'validation_failure', code: 'VALIDATION_FAILED', message: 'Enter a task title.', focusField: 'title',
      fieldErrors: [{ field: 'title', code: 'REQUIRED', message: 'Task title is required.', guidance: 'Enter a short, specific title.' }],
    };
    const existing = id ? mockStore.findTask(id) : undefined;
    const now = new Date().toISOString();
    const task: Task = {
      id: existing?.id ?? `tsk-${Date.now()}`, title: input.title.trim(), projectId: input.projectId,
      divisionId: project.divisionId, assigneeEmployeeId: input.assigneeEmployeeId,
      supportingMemberIds: input.supportingMemberIds, creatorEmployeeId: account(userId)?.employeeId ?? userId,
      priority: input.priority, startDate: input.startDate, dueDate: input.dueDate,
      completedDate: existing?.completedDate ?? null, estimatedMinutes: input.estimatedMinutes,
      description: input.description || null, status: existing?.status ?? 'pending',
      createdAt: existing?.createdAt ?? now, createdBy: existing?.createdBy ?? actorFor(userId), updatedAt: now, updatedBy: actorFor(userId),
    };
    if (existing) mockStore.updateTask(task.id, task as ReturnType<typeof mockStore.tasks>[number]);
    else mockStore.addTask(task as ReturnType<typeof mockStore.tasks>[number]);
    mockStore.replaceChecklist(task.id, input.checklist);
    return success(taskView(task));
  },

  async setTaskStatus(userId, id, status: TaskStatus) {
    await delay();
    const task = mockStore.findTask(id);
    if (!task || !inDivisionScope(userId, task.divisionId)) return notFound('Task not found.');
    const next = { ...task, status, completedDate: status === 'completed' ? DEMO_TODAY : null, updatedAt: new Date().toISOString(), updatedBy: actorFor(userId) };
    mockStore.updateTask(id, next);
    return success(taskView(next));
  },

  async listRequests(userId) {
    await delay();
    const items = [
      ...mockStore.allWfhRequests().map((item) => requestView(item, 'wfh')),
      ...mockStore.allLeaveRequests().map((item) => requestView(item, 'leave')),
    ].filter((item) => inEmployeeScope(userId, item.employee.id) && inDivisionScope(userId, item.division.id));
    return success(items);
  },

  async decideRequest({ userId, kind, id, outcome, remark }) {
    await delay();
    const source = kind === 'wfh' ? mockStore.allWfhRequests() : mockStore.allLeaveRequests();
    const request = source.find((item) => item.id === id);
    if (!request) return notFound('Request not found.');
    if (!inEmployeeScope(userId, request.employeeId)) return denied();
    const next = {
      ...request, state: outcome, decision: { decidedAt: new Date().toISOString(), decidedBy: actorFor(userId), outcome, comment: remark || null, override: null },
      updatedAt: new Date().toISOString(), updatedBy: actorFor(userId),
    };
    if (kind === 'wfh') mockStore.updateWfhRequest(id, next as ReturnType<typeof mockStore.allWfhRequests>[number]);
    else mockStore.updateLeaveRequest(id, next as ReturnType<typeof mockStore.allLeaveRequests>[number]);
    return success(requestView(next, kind));
  },

  async listWorkload(userId) {
    await delay();
    const viewer = account(userId);
    if (!viewer || viewer.primaryRole !== 'team_lead') return denied();
    const result: WorkloadMemberView[] = viewer.scopedEmployeeIds.map((employeeId, index) => {
      const capacity = index === 1 ? 1680 : 2100;
      const assigned = index === 0 ? 2400 : index === 1 ? 1080 : 1980;
      const actual = teamDates().slice(0, 5).reduce((total, date) => total + summaryFor(employeeId, date).activeMinutes, 0);
      const tasks = mockStore.tasks().filter((task) => task.assigneeEmployeeId === employeeId && task.status !== 'completed');
      return {
        employee: employeeRef(employeeId), capacity: toDurationView(capacity), assigned: toDurationView(assigned), actual: toDurationView(actual),
        remaining: toDurationView(capacity - assigned), utilizationPercent: Math.round((assigned / capacity) * 100),
        warning: assigned > capacity ? 'overallocated' : assigned < capacity * 0.7 ? 'underallocated' : null,
        upcomingDeadlines: tasks.filter((task) => task.dueDate).map((task) => `${task.title} · ${formatDate(task.dueDate as string)}`).slice(0, 3),
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label, dayIndex) => ({
          label, capacity: toDurationView(index === 1 && dayIndex === 2 ? 210 : 420), leaveAdjusted: index === 1 && dayIndex === 2,
          allocations: tasks.slice(dayIndex % Math.max(1, tasks.length), dayIndex % Math.max(1, tasks.length) + 1).map((task) => ({
            divisionCode: divisionRef(task.divisionId).code,
            projectCode: projects.find((project) => project.id === task.projectId)?.code ?? 'Project',
            duration: toDurationView(Math.min(420, Math.round(assigned / 5))),
          })),
        })),
      };
    });
    return success(result);
  },

  async listEvaluations(userId) {
    await delay();
    return success(evaluations.filter((item) => inEmployeeScope(userId, item.employee.id)));
  },

  async getEvaluation(userId, id) {
    await delay();
    const item = evaluations.find((evaluation) => evaluation.id === id);
    if (!item || !inEmployeeScope(userId, item.employee.id)) return notFound('Evaluation not found.');
    return success(item);
  },

  async saveEvaluation({ userId, id, scores, comments, summary, submit }) {
    await delay();
    const item = evaluations.find((evaluation) => evaluation.id === id);
    if (!item || !inEmployeeScope(userId, item.employee.id)) return notFound('Evaluation not found.');
    if (item.state === 'published' || item.state === 'hr_review') return {
      status: 'conflict', code: 'CONFLICT', message: 'This evaluation is read-only.', guidance: 'Submitted evaluations must be returned by HR before editing.',
    };
    const weightedScore = AREAS.reduce((total, area) => total + (scores[area] || 0) * EVALUATION_WEIGHTS[area], 0) / 100;
    const next = { ...item, scores, comments, summary, weightedScore, state: submit ? 'hr_review' as const : 'reviewer_scoring' as const };
    evaluations = evaluations.map((evaluation) => evaluation.id === id ? next : evaluation);
    return success(next);
  },
};
