import type {
  EvaluationAreaKey,
  EvaluationState,
  IsoDate,
  Priority,
  ProjectStatus,
  RemarkState,
  RequestWorkflowState,
  TaskStatus,
} from './domain';
import type { Result } from './results';
import type {
  DivisionRef,
  DurationView,
  EmployeeRef,
  TeamLeadDashboardView,
  TeamTimesheetRowView,
  TimesheetDayView,
} from './view-models';

export interface TeamMemberView {
  readonly employee: EmployeeRef;
  readonly divisions: readonly DivisionRef[];
  readonly attendanceLabel: string;
  readonly active: DurationView;
  readonly status: TeamTimesheetRowView['status'];
  readonly openRemarkCount: number;
}

export interface TeamProjectView {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly division: DivisionRef;
  readonly manager: EmployeeRef;
  readonly memberCount: number;
  readonly client: string | null;
  readonly startDateLabel: string;
  readonly endDateLabel: string | null;
  readonly priority: Priority;
  readonly status: ProjectStatus;
  readonly completionPercent: number;
  readonly estimated: DurationView;
  readonly actual: DurationView;
  readonly budgetLabel: string | null;
  readonly budgetRestricted: boolean;
  readonly notes: string | null;
}

export interface TeamTaskView {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly projectLabel: string;
  readonly division: DivisionRef;
  readonly assignee: EmployeeRef;
  readonly supportingMembers: readonly EmployeeRef[];
  readonly status: TaskStatus;
  readonly priority: Priority;
  readonly startDateLabel: string | null;
  readonly dueDateLabel: string | null;
  readonly estimated: DurationView;
  readonly actual: DurationView;
  readonly isOverdue: boolean;
  readonly description: string | null;
  readonly checklist: readonly { readonly id: string; readonly label: string; readonly isDone: boolean }[];
  readonly workHistory: readonly {
    readonly id: string;
    readonly dateLabel: string;
    readonly duration: DurationView;
    readonly completedWork: string;
  }[];
}

export interface TeamRequestView {
  readonly id: string;
  readonly kind: 'wfh' | 'leave';
  readonly employee: EmployeeRef;
  readonly division: DivisionRef;
  readonly dateLabel: string;
  readonly portionLabel: string;
  readonly reason: string;
  readonly details: string;
  readonly state: RequestWorkflowState;
  readonly decisionLabel: string | null;
  readonly overrideReason: string | null;
}

export interface WorkloadMemberView {
  readonly employee: EmployeeRef;
  readonly capacity: DurationView;
  readonly assigned: DurationView;
  readonly actual: DurationView;
  readonly remaining: DurationView;
  readonly utilizationPercent: number;
  readonly warning: 'overallocated' | 'underallocated' | null;
  readonly upcomingDeadlines: readonly string[];
  readonly days: readonly {
    readonly label: string;
    readonly capacity: DurationView;
    readonly allocations: readonly {
      readonly divisionCode: string;
      readonly projectCode: string;
      readonly duration: DurationView;
    }[];
    readonly leaveAdjusted: boolean;
  }[];
}

export interface TeamEvaluationView {
  readonly id: string;
  readonly employee: EmployeeRef;
  readonly periodLabel: string;
  readonly dueDateLabel: string;
  readonly state: EvaluationState;
  readonly weightedScore: number | null;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly scores: Readonly<Record<EvaluationAreaKey, number>>;
  readonly comments: Readonly<Record<EvaluationAreaKey, string>>;
  readonly summary: string;
}

export interface ProjectFormInput {
  readonly name: string;
  readonly code: string;
  readonly divisionId: string;
  readonly managerEmployeeId: string;
  readonly memberIds: readonly string[];
  readonly client: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly priority: Priority;
  readonly estimatedMinutes: number;
  readonly budgetAmount: string;
  readonly completionPercent: number;
  readonly notes: string;
}

export interface TaskFormInput {
  readonly title: string;
  readonly projectId: string;
  readonly assigneeEmployeeId: string;
  readonly supportingMemberIds: readonly string[];
  readonly startDate: IsoDate | null;
  readonly dueDate: IsoDate | null;
  readonly priority: Priority;
  readonly estimatedMinutes: number;
  readonly description: string;
  readonly checklist: readonly string[];
}

export interface TeamLeadService {
  getDashboard(userId: string): Promise<Result<TeamLeadDashboardView>>;
  listMembers(userId: string): Promise<Result<readonly TeamMemberView[]>>;
  listTimesheets(userId: string): Promise<Result<readonly TeamTimesheetRowView[]>>;
  getTimesheet(userId: string, employeeId: string, date: IsoDate): Promise<Result<TimesheetDayView>>;
  addRemark(input: { userId: string; employeeId: string; date: IsoDate; message: string; requestedChanges: string | null }): Promise<Result<{ id: string; state: RemarkState }>>;
  resolveRemark(input: { userId: string; remarkId: string }): Promise<Result<{ state: RemarkState }>>;
  listProjects(userId: string): Promise<Result<readonly TeamProjectView[]>>;
  getProject(userId: string, id: string): Promise<Result<TeamProjectView>>;
  saveProject(userId: string, input: ProjectFormInput, id?: string): Promise<Result<TeamProjectView>>;
  listTasks(userId: string): Promise<Result<readonly TeamTaskView[]>>;
  getTask(userId: string, id: string): Promise<Result<TeamTaskView>>;
  saveTask(userId: string, input: TaskFormInput, id?: string): Promise<Result<TeamTaskView>>;
  setTaskStatus(userId: string, id: string, status: TaskStatus): Promise<Result<TeamTaskView>>;
  listRequests(userId: string): Promise<Result<readonly TeamRequestView[]>>;
  decideRequest(input: { userId: string; kind: TeamRequestView['kind']; id: string; outcome: 'approved' | 'rejected' | 'information_requested'; remark: string }): Promise<Result<TeamRequestView>>;
  listWorkload(userId: string): Promise<Result<readonly WorkloadMemberView[]>>;
  listEvaluations(userId: string): Promise<Result<readonly TeamEvaluationView[]>>;
  getEvaluation(userId: string, id: string): Promise<Result<TeamEvaluationView>>;
  saveEvaluation(input: { userId: string; id: string; scores: TeamEvaluationView['scores']; comments: TeamEvaluationView['comments']; summary: string; submit: boolean }): Promise<Result<TeamEvaluationView>>;
}
