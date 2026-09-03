/**
 * The deterministic demo dataset.
 *
 * Mirrors `docs/frontend/phase-0/demo-setup.md`. Every scenario named there —
 * the cross-division complete day, under-time, overtime, the twelve-hour
 * boundary, critical, missing, leave, half-day, WFH, correction, locked —
 * exists here so the acceptance cases are demonstrable rather than described.
 *
 * Development only. Nothing in `src/components` or a page may import this
 * file: screens consume data through `src/contracts/services.ts`.
 */

import type {
  ActorRef,
  EmployeeDivisionAssignment,
  GeneralRemark,
  Holiday,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  Project,
  Task,
  TaskChecklistItem,
  TimeEntry,
  TimesheetPeriod,
  WfhRequest,
  WorkLocation,
  WorkPolicy,
} from '@/contracts/domain';

export const DEMO_TODAY = '2026-09-02';

const SYSTEM: ActorRef = { userId: 'usr-system', displayName: 'System' };

function actor(userId: string, displayName: string): ActorRef {
  return { userId, displayName };
}

const STAMP = {
  createdAt: '2026-01-01T09:00:00+06:00',
  createdBy: SYSTEM,
  updatedAt: '2026-01-01T09:00:00+06:00',
  updatedBy: SYSTEM,
};

/* -------------------------------------------------------------------------- */
/* Work policy and calendar                                                   */
/* -------------------------------------------------------------------------- */

export const STANDARD_POLICY: WorkPolicy = {
  id: 'wp-standard',
  version: 3,
  name: 'Standard five-day week',
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  requiredActiveMinutes: 420,
  recognizedBreakMinutes: 60,
  requiredTotalMinutes: 480,
  overtimeThresholdMinutes: 480,
  criticalThresholdMinutes: 720,
  workingWeekdays: [1, 2, 3, 4, 5],
  businessTimezone: 'Asia/Dhaka',
  ...STAMP,
};

export const HOLIDAYS: readonly Holiday[] = [
  {
    id: 'hol-1',
    name: 'National Mourning Day',
    scope: 'company',
    divisionId: null,
    // A Monday, so the holiday is distinguishable from the weekend.
    date: '2026-08-17',
    weekday: null,
    isActive: true,
    ...STAMP,
  },
  {
    id: 'hol-2',
    name: 'Division founding day',
    scope: 'division',
    divisionId: 'cjg',
    date: '2026-09-14',
    weekday: null,
    isActive: true,
    ...STAMP,
  },
  // Weekly holidays carry a weekday and no date; the daily calculation reads
  // the policy's working weekdays, so these describe the same rule for the
  // holiday administration screen rather than duplicating it.
  {
    id: 'hol-w6',
    name: 'Weekly holiday — Saturday',
    scope: 'weekly',
    divisionId: null,
    date: null,
    weekday: 6,
    isActive: true,
    ...STAMP,
  },
  {
    id: 'hol-w7',
    name: 'Weekly holiday — Sunday',
    scope: 'weekly',
    divisionId: null,
    date: null,
    weekday: 7,
    isActive: true,
    ...STAMP,
  },
];

/* -------------------------------------------------------------------------- */
/* Assignments                                                                */
/* -------------------------------------------------------------------------- */

function assignment(
  id: string,
  employeeId: string,
  divisionId: string,
  options: {
    isPrimary?: boolean;
    allocationPercent: number;
    teamLeadEmployeeId: string | null;
    startDate: string;
    endDate?: string | null;
    isTemporary?: boolean;
    isActive?: boolean;
  },
): EmployeeDivisionAssignment {
  return {
    id,
    employeeId,
    divisionId,
    isPrimary: options.isPrimary ?? false,
    roleInDivision: null,
    teamLeadEmployeeId: options.teamLeadEmployeeId,
    allocationPercent: options.allocationPercent,
    expectedWeeklyMinutes: Math.round((2100 * options.allocationPercent) / 100),
    startDate: options.startDate,
    endDate: options.endDate ?? null,
    isTemporary: options.isTemporary ?? false,
    isActive: options.isActive ?? true,
    ...STAMP,
  };
}

export const ASSIGNMENTS: readonly EmployeeDivisionAssignment[] = [
  assignment('asg-1', 'emp-1001', 'pia', {
    isPrimary: true,
    allocationPercent: 50,
    teamLeadEmployeeId: 'emp-2001',
    startDate: '2025-01-01',
  }),
  assignment('asg-2', 'emp-1001', 'gov', {
    allocationPercent: 30,
    teamLeadEmployeeId: 'emp-2002',
    startDate: '2025-03-01',
  }),
  assignment('asg-3', 'emp-1001', 'wcf', {
    allocationPercent: 20,
    teamLeadEmployeeId: 'emp-2002',
    startDate: '2025-06-01',
  }),
  assignment('asg-4', 'emp-1002', 'cjg', {
    isPrimary: true,
    allocationPercent: 100,
    teamLeadEmployeeId: 'emp-2001',
    startDate: '2024-09-15',
  }),
  assignment('asg-5', 'emp-1003', 'pit', {
    isPrimary: true,
    allocationPercent: 80,
    teamLeadEmployeeId: 'emp-2001',
    startDate: '2025-02-01',
  }),
  assignment('asg-6', 'emp-1003', 'pia', {
    allocationPercent: 20,
    teamLeadEmployeeId: 'emp-2001',
    startDate: '2025-02-01',
  }),
  assignment('asg-7', 'emp-1004', 'wcf', {
    isPrimary: true,
    allocationPercent: 100,
    teamLeadEmployeeId: 'emp-2002',
    startDate: '2025-04-01',
  }),
  // Expired temporary assignment: new time against GOV must be refused
  // after 2026-08-31 (`REQ-ORG-009`).
  assignment('asg-8', 'emp-1004', 'gov', {
    allocationPercent: 25,
    teamLeadEmployeeId: 'emp-2002',
    startDate: '2026-07-01',
    endDate: '2026-08-31',
    isTemporary: true,
    isActive: false,
  }),
];

/* -------------------------------------------------------------------------- */
/* Projects and tasks                                                         */
/* -------------------------------------------------------------------------- */

function project(
  id: string,
  name: string,
  code: string,
  divisionId: string,
  managerEmployeeId: string,
  estimatedHours: number,
  options: { active?: boolean; completion?: number; budget?: string } = {},
): Project {
  const active = options.active ?? true;
  return {
    id,
    name,
    code,
    divisionId,
    managerEmployeeId,
    clientOrStakeholder: null,
    startDate: '2026-01-05',
    endDate: null,
    priority: 'medium',
    description: null,
    estimatedMinutes: estimatedHours * 60,
    budget: options.budget
      ? { visible: true, value: { amount: options.budget, currency: 'BDT' } }
      : null,
    completionPercent: options.completion ?? 0,
    status: active ? 'active' : 'closed',
    isActive: active,
    acceptsTimeEntries: active,
    notes: null,
    ...STAMP,
  };
}

export const PROJECTS: readonly Project[] = [
  project('prj-vp2', 'Vision Platform v2', 'PIA-VP2', 'pia', 'emp-2001', 640, {
    completion: 42,
    budget: '3200000.00',
  }),
  project('prj-alb', 'AI Literacy Bootcamp', 'PIT-ALB', 'pit', 'emp-2001', 220, {
    completion: 68,
    budget: '900000.00',
  }),
  project('prj-nrd', 'National Records Digitisation', 'GOV-NRD', 'gov', 'emp-2002', 900, {
    completion: 31,
    budget: '7500000.00',
  }),
  project('prj-mip', 'Monthly Issue Production', 'CJG-MIP', 'cjg', 'emp-2001', 160, {
    completion: 80,
    budget: '450000.00',
  }),
  project('prj-wpr', 'Westbridge Portal Rollout', 'WCF-WPR', 'wcf', 'emp-2002', 380, {
    completion: 55,
    budget: '1800000.00',
  }),
  // Inactive, so `REQ-WORK-008` is demonstrable.
  project('prj-lsm', 'Legacy Site Maintenance', 'PIA-LSM', 'pia', 'emp-2001', 90, {
    active: false,
    completion: 100,
  }),
];

function task(
  id: string,
  title: string,
  projectId: string,
  divisionId: string,
  assigneeEmployeeId: string,
  status: Task['status'],
  estimatedHours: number,
  dueDate: string | null,
  options: { priority?: Task['priority']; supporting?: string[]; completed?: string } = {},
): Task {
  return {
    id,
    title,
    divisionId,
    projectId,
    assigneeEmployeeId,
    supportingMemberIds: options.supporting ?? [],
    creatorEmployeeId: 'emp-2001',
    priority: options.priority ?? 'medium',
    startDate: null,
    dueDate,
    completedDate: options.completed ?? null,
    estimatedMinutes: estimatedHours * 60,
    description:
      'Delivered against the project plan. See the linked time entries for the work history.',
    status,
    ...STAMP,
  };
}

export const TASKS: readonly Task[] = [
  task('tsk-1', 'Model evaluation harness', 'prj-vp2', 'pia', 'emp-1001', 'in_progress', 40, '2026-09-10', { priority: 'high' }),
  task('tsk-2', 'Inference latency profiling', 'prj-vp2', 'pia', 'emp-1002', 'in_progress', 24, '2026-09-04'),
  task('tsk-3', 'Records intake schema', 'prj-nrd', 'gov', 'emp-1001', 'in_progress', 60, '2026-09-18', { priority: 'high' }),
  task('tsk-4', 'Cohort 7 curriculum update', 'prj-alb', 'pit', 'emp-1003', 'pending', 18, '2026-09-12'),
  task('tsk-5', 'September layout pass', 'prj-mip', 'cjg', 'emp-1002', 'completed', 30, '2026-08-28', { completed: '2026-08-27' }),
  // Due before the demo date, so the overdue state is visible.
  task('tsk-6', 'Portal accessibility audit', 'prj-wpr', 'wcf', 'emp-1001', 'in_progress', 26, '2026-08-25', { priority: 'urgent' }),
  task('tsk-7', 'Onboarding checklist', 'prj-wpr', 'wcf', 'emp-1004', 'pending', 8, '2026-09-30'),
  task('tsk-8', 'Benchmark report write-up', 'prj-vp2', 'pia', 'emp-1001', 'completed', 12, '2026-08-28', { completed: '2026-08-28' }),
  task('tsk-9', 'Data retention review', 'prj-nrd', 'gov', 'emp-1001', 'pending', 16, '2026-09-25'),
];

export const CHECKLIST_ITEMS: readonly TaskChecklistItem[] = [
  { id: 'chk-1', taskId: 'tsk-1', label: 'Define the evaluation metrics', isDone: true, order: 1 },
  { id: 'chk-2', taskId: 'tsk-1', label: 'Build the fixture dataset', isDone: true, order: 2 },
  { id: 'chk-3', taskId: 'tsk-1', label: 'Run the first benchmark', isDone: true, order: 3 },
  { id: 'chk-4', taskId: 'tsk-1', label: 'Document the results', isDone: false, order: 4 },
  { id: 'chk-5', taskId: 'tsk-3', label: 'Agree the field list with the client', isDone: true, order: 1 },
  { id: 'chk-6', taskId: 'tsk-3', label: 'Draft the intake schema', isDone: false, order: 2 },
  { id: 'chk-7', taskId: 'tsk-6', label: 'Keyboard-only pass', isDone: true, order: 1 },
  { id: 'chk-8', taskId: 'tsk-6', label: 'Screen-reader pass', isDone: false, order: 2 },
  { id: 'chk-9', taskId: 'tsk-6', label: 'Contrast pass', isDone: false, order: 3 },
];

/* -------------------------------------------------------------------------- */
/* Time entries                                                               */
/* -------------------------------------------------------------------------- */

const EMPLOYEE_ACTORS: Record<string, ActorRef> = {
  'emp-1001': actor('usr-1001', 'Nadia Rahman'),
  'emp-1002': actor('usr-1002', 'Tanvir Ahmed'),
  'emp-1003': actor('usr-1003', 'Sadia Karim'),
  'emp-1004': actor('usr-1004', 'Sumaiya Noor'),
  'emp-2001': actor('usr-2001', 'Imran Hossain'),
};

let entryCounter = 0;

interface EntrySpec {
  readonly employeeId: string;
  readonly workDate: string;
  readonly divisionId: string;
  readonly projectId?: string | null;
  readonly taskId?: string | null;
  /** `HH:mm`; omit for a duration-only entry. */
  readonly start?: string;
  readonly end?: string;
  readonly minutes?: number;
  readonly location?: WorkLocation;
  readonly description: string;
  readonly completedWork: string;
  readonly locked?: boolean;
}

function toInstant(workDate: string, clock: string): string {
  return `${workDate}T${clock}:00+06:00`;
}

function buildEntry(spec: EntrySpec): TimeEntry {
  entryCounter += 1;
  const hasClock = Boolean(spec.start && spec.end);
  const minutes =
    spec.minutes ??
    (hasClock
      ? (() => {
          const [sh, sm] = spec.start!.split(':').map(Number);
          const [eh, em] = spec.end!.split(':').map(Number);
          return eh * 60 + em - (sh * 60 + sm);
        })()
      : 0);

  const stamp = toInstant(spec.workDate, spec.start ?? '18:00');
  const who = EMPLOYEE_ACTORS[spec.employeeId] ?? SYSTEM;

  return {
    id: `te-${String(entryCounter).padStart(4, '0')}`,
    employeeId: spec.employeeId,
    workDate: spec.workDate,
    divisionId: spec.divisionId,
    projectId: spec.projectId ?? null,
    taskId: spec.taskId ?? null,
    entryMethod: hasClock ? 'manual_clock' : 'manual_duration',
    workLocation: spec.location ?? 'office',
    startTime: hasClock ? toInstant(spec.workDate, spec.start!) : null,
    endTime: hasClock ? toInstant(spec.workDate, spec.end!) : null,
    activeMinutes: minutes,
    workDescription: spec.description,
    completedWork: spec.completedWork,
    supportingLink: null,
    attachmentIds: [],
    state: spec.locked ? 'locked' : 'saved',
    crossMidnightGroupId: null,
    policyVersion: STANDARD_POLICY.version,
    createdAt: stamp,
    createdBy: who,
    updatedAt: stamp,
    updatedBy: who,
  };
}

/** A routine complete day: 3:00 + 4:00 with the recognized break. */
function completeDay(
  employeeId: string,
  workDate: string,
  divisionId: string,
  projectId: string,
  taskId: string | null,
  location: WorkLocation = 'office',
): EntrySpec[] {
  return [
    {
      employeeId,
      workDate,
      divisionId,
      projectId,
      taskId,
      start: '09:00',
      end: '12:00',
      location,
      description: 'Focused delivery work on the current milestone.',
      completedWork: 'Completed the planned items for the morning block.',
    },
    {
      employeeId,
      workDate,
      divisionId,
      projectId,
      taskId,
      start: '13:00',
      end: '17:00',
      location,
      description: 'Continued implementation and review.',
      completedWork: 'Closed out the afternoon items and updated the task notes.',
    },
  ];
}

/**
 * Locked complete days for the verified July 2026 period.
 *
 * Written as a table rather than by hand because the point is coverage: every
 * employee, each division they are assigned to, and both billable and
 * non-billable project work, so the Finance analysis has something real to
 * divide up.
 */
const JULY_VERIFIED_PLAN: readonly {
  readonly employeeId: string;
  readonly divisionId: string;
  readonly projectId: string;
  readonly taskId: string | null;
  readonly dates: readonly string[];
}[] = [
  {
    employeeId: 'emp-1001',
    divisionId: 'pia',
    projectId: 'prj-vp2',
    taskId: 'tsk-1',
    dates: ['2026-07-01', '2026-07-02', '2026-07-07', '2026-07-16', '2026-07-21'],
  },
  {
    employeeId: 'emp-1001',
    divisionId: 'gov',
    projectId: 'prj-nrd',
    taskId: 'tsk-3',
    dates: ['2026-07-03', '2026-07-08', '2026-07-09', '2026-07-22', '2026-07-23'],
  },
  {
    employeeId: 'emp-1001',
    divisionId: 'wcf',
    projectId: 'prj-wpr',
    taskId: 'tsk-6',
    dates: ['2026-07-06', '2026-07-10', '2026-07-13'],
  },
  {
    employeeId: 'emp-1002',
    divisionId: 'cjg',
    projectId: 'prj-mip',
    taskId: 'tsk-5',
    dates: [
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07',
      '2026-07-08', '2026-07-09', '2026-07-13', '2026-07-14', '2026-07-15',
      '2026-07-16', '2026-07-20',
    ],
  },
  {
    employeeId: 'emp-1003',
    divisionId: 'pit',
    projectId: 'prj-alb',
    taskId: 'tsk-4',
    dates: [
      '2026-07-01', '2026-07-02', '2026-07-06', '2026-07-07', '2026-07-08',
      '2026-07-13', '2026-07-14', '2026-07-20', '2026-07-21',
    ],
  },
  {
    employeeId: 'emp-1003',
    divisionId: 'pia',
    projectId: 'prj-vp2',
    taskId: null,
    dates: ['2026-07-09', '2026-07-16'],
  },
  {
    employeeId: 'emp-1004',
    divisionId: 'wcf',
    projectId: 'prj-wpr',
    taskId: 'tsk-7',
    dates: [
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07',
      '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-14', '2026-07-15',
    ],
  },
];

const JULY_VERIFIED_SPECS: readonly EntrySpec[] = JULY_VERIFIED_PLAN.flatMap((plan) =>
  plan.dates.flatMap((date) =>
    completeDay(plan.employeeId, date, plan.divisionId, plan.projectId, plan.taskId).map(
      (spec) => ({ ...spec, locked: true }),
    ),
  ),
);

const ENTRY_SPECS: readonly EntrySpec[] = [
  /* --- Nadia Rahman: the cross-division complete day (AC-CALC-001) ------- */
  {
    employeeId: 'emp-1001',
    workDate: '2026-09-01',
    divisionId: 'pia',
    projectId: 'prj-vp2',
    taskId: 'tsk-1',
    start: '09:00',
    end: '12:00',
    description: 'Evaluation harness: metric definitions and fixture wiring.',
    completedWork: 'Metrics agreed and the fixture dataset loaded end to end.',
  },
  {
    employeeId: 'emp-1001',
    workDate: '2026-09-01',
    divisionId: 'gov',
    projectId: 'prj-nrd',
    taskId: 'tsk-3',
    start: '13:00',
    end: '15:00',
    description: 'Records intake schema review with the client team.',
    completedWork: 'Field list confirmed for the first intake batch.',
  },
  {
    employeeId: 'emp-1001',
    workDate: '2026-09-01',
    divisionId: 'wcf',
    projectId: 'prj-wpr',
    taskId: 'tsk-6',
    start: '15:00',
    end: '17:00',
    description: 'Portal accessibility audit: keyboard pass.',
    completedWork: 'Keyboard-only pass finished; three issues raised.',
  },

  /* --- Nadia: today, partially recorded, timer still running ------------- */
  {
    employeeId: 'emp-1001',
    workDate: DEMO_TODAY,
    divisionId: 'pia',
    projectId: 'prj-vp2',
    taskId: 'tsk-1',
    start: '09:00',
    end: '11:00',
    description: 'Benchmark run and result triage.',
    completedWork: 'First full benchmark completed; results triaged.',
  },

  /* --- Nadia: WFH complete day ------------------------------------------ */
  ...completeDay('emp-1001', '2026-08-28', 'pia', 'prj-vp2', 'tsk-8', 'wfh'),

  /* --- Nadia: routine complete days ------------------------------------- */
  ...completeDay('emp-1001', '2026-08-31', 'pia', 'prj-vp2', 'tsk-1'),
  ...completeDay('emp-1001', '2026-08-27', 'gov', 'prj-nrd', 'tsk-3'),
  ...completeDay('emp-1001', '2026-08-26', 'pia', 'prj-vp2', 'tsk-1'),

  /* --- Nadia: verified July period, so the locked state is reachable ----- */
  ...completeDay('emp-1001', '2026-07-14', 'pia', 'prj-vp2', 'tsk-1').map((spec) => ({
    ...spec,
    locked: true,
  })),
  ...completeDay('emp-1001', '2026-07-15', 'pia', 'prj-vp2', 'tsk-1').map((spec) => ({
    ...spec,
    locked: true,
  })),

  /*
   * The rest of the verified July period.
   *
   * Finance reads verified periods only, so a July holding two days would make
   * every cost, billable split and payroll figure trivially small and hide the
   * division and project mix the analysis screens exist to show. These days are
   * locked, spread across each employee's own divisions, and use the same
   * 3:00 + 4:00 complete-day shape as the rest of the dataset.
   */
  ...JULY_VERIFIED_SPECS,

  /* --- Tanvir Ahmed: overtime (8:30 active + 1:00 break = 9:30) ---------- */
  {
    employeeId: 'emp-1002',
    workDate: '2026-08-26',
    divisionId: 'cjg',
    projectId: 'prj-mip',
    taskId: 'tsk-5',
    start: '09:00',
    end: '17:30',
    description: 'Layout pass for the September issue, extended for the print deadline.',
    completedWork: 'All 48 pages laid out and sent for proofing.',
  },

  /* --- Tanvir: exactly 12:00 total, which is Overtime, not Critical ------ */
  {
    employeeId: 'emp-1002',
    workDate: '2026-08-25',
    divisionId: 'cjg',
    projectId: 'prj-mip',
    taskId: 'tsk-5',
    start: '08:00',
    end: '19:00',
    description: 'Pre-deadline production run.',
    completedWork: 'Colour correction and imposition completed for the full issue.',
  },

  /* --- Tanvir: critical, 12:30 total ------------------------------------ */
  {
    employeeId: 'emp-1002',
    workDate: '2026-08-24',
    divisionId: 'cjg',
    projectId: 'prj-mip',
    taskId: 'tsk-5',
    start: '07:30',
    end: '19:00',
    description: 'Press incident recovery.',
    completedWork: 'Re-plated the failed signatures and restarted the run.',
  },

  ...completeDay('emp-1002', '2026-08-31', 'cjg', 'prj-mip', 'tsk-5'),
  ...completeDay('emp-1002', '2026-09-01', 'pia', 'prj-vp2', 'tsk-2'),

  /* --- Sadia Karim: under-time, 6:59 active ----------------------------- */
  {
    employeeId: 'emp-1003',
    workDate: '2026-08-27',
    divisionId: 'pit',
    projectId: 'prj-alb',
    taskId: 'tsk-4',
    start: '09:00',
    end: '12:00',
    description: 'Cohort 7 curriculum review.',
    completedWork: 'Modules 1 to 3 reviewed.',
  },
  {
    employeeId: 'emp-1003',
    workDate: '2026-08-27',
    divisionId: 'pit',
    projectId: 'prj-alb',
    taskId: 'tsk-4',
    minutes: 239,
    description: 'Continued curriculum review after the break.',
    completedWork: 'Modules 4 and 5 reviewed; module 6 outstanding.',
  },

  /* --- Sadia: half-day sick leave plus 3:30 active ---------------------- */
  {
    employeeId: 'emp-1003',
    workDate: '2026-08-18',
    divisionId: 'pit',
    projectId: 'prj-alb',
    taskId: 'tsk-4',
    start: '09:00',
    end: '12:30',
    description: 'Morning session before leaving on approved half-day leave.',
    completedWork: 'Cohort 7 slides updated for the first two sessions.',
  },

  /* --- Sadia: WFH complete day ------------------------------------------ */
  ...completeDay('emp-1003', '2026-08-28', 'pit', 'prj-alb', 'tsk-4', 'wfh'),
  ...completeDay('emp-1003', '2026-09-01', 'pit', 'prj-alb', 'tsk-4'),

  /* --- Sumaiya Noor ------------------------------------------------------ */
  ...completeDay('emp-1004', '2026-09-01', 'wcf', 'prj-wpr', 'tsk-7'),
  ...completeDay('emp-1004', '2026-08-31', 'wcf', 'prj-wpr', 'tsk-7'),
];

export const TIME_ENTRIES: readonly TimeEntry[] = ENTRY_SPECS.map(buildEntry);

/** Reasons attached to days that need them (`REQ-TIME-018`, `-019`). */
export const DAY_REASONS: Readonly<
  Record<string, { overtimeReason?: string; criticalExplanation?: string }>
> = {
  'emp-1002|2026-08-26': { overtimeReason: 'Print deadline for the September issue.' },
  'emp-1002|2026-08-25': { overtimeReason: 'Pre-deadline production run.' },
  'emp-1002|2026-08-24': {
    overtimeReason: 'Press incident.',
    criticalExplanation:
      'A plate failure stopped the run. I stayed to re-plate and restart so the issue would ship. Team Lead and HR were notified.',
  },
};

/* -------------------------------------------------------------------------- */
/* Leave and WFH                                                              */
/* -------------------------------------------------------------------------- */

export const LEAVE_TYPES: readonly LeaveType[] = [
  { key: 'annual', label: 'Annual leave', isPaid: true, allowsHalfDay: true, annualEntitlementDays: 20 },
  { key: 'sick', label: 'Sick leave', isPaid: true, allowsHalfDay: true, annualEntitlementDays: 14 },
  { key: 'casual', label: 'Casual leave', isPaid: true, allowsHalfDay: true, annualEntitlementDays: 10 },
  { key: 'unpaid', label: 'Unpaid leave', isPaid: false, allowsHalfDay: true, annualEntitlementDays: null },
];

function balance(
  employeeId: string,
  leaveType: LeaveBalance['leaveType'],
  entitled: number,
  consumed: number,
  reserved = 0,
): LeaveBalance {
  return {
    employeeId,
    leaveType,
    year: 2026,
    entitledDays: entitled,
    consumedDays: consumed,
    reservedDays: reserved,
    remainingDays: entitled - consumed - reserved,
  };
}

export const LEAVE_BALANCES: readonly LeaveBalance[] = [
  balance('emp-1001', 'annual', 20, 6),
  balance('emp-1001', 'sick', 14, 2),
  balance('emp-1001', 'casual', 10, 3),
  balance('emp-1002', 'annual', 20, 9),
  balance('emp-1002', 'sick', 14, 1),
  balance('emp-1002', 'casual', 10, 2),
  balance('emp-1003', 'annual', 20, 8, 0),
  balance('emp-1003', 'sick', 14, 3.5),
  balance('emp-1003', 'casual', 10, 1),
  balance('emp-1004', 'annual', 20, 4, 3),
  balance('emp-1004', 'sick', 14, 0),
  balance('emp-1004', 'casual', 10, 1),
];

function leaveRequest(
  id: string,
  employeeId: string,
  leaveType: LeaveRequest['leaveType'],
  startDate: string,
  endDate: string,
  portion: LeaveRequest['portion'],
  state: LeaveRequest['state'],
  reason: string,
  decidedBy?: ActorRef,
): LeaveRequest {
  return {
    id,
    employeeId,
    leaveType,
    startDate,
    endDate,
    portion,
    totalDays: portion === 'half_day' ? 0.5 : 1,
    reason,
    attachmentIds: [],
    state,
    decision: decidedBy
      ? {
          decidedAt: `${startDate}T09:00:00+06:00`,
          decidedBy,
          outcome: state === 'approved' ? 'approved' : 'rejected',
          comment: null,
          override: null,
        }
      : null,
    ...STAMP,
  };
}

const IMRAN = actor('usr-2001', 'Imran Hossain');

export const LEAVE_REQUESTS: readonly LeaveRequest[] = [
  leaveRequest('lv-1', 'emp-1003', 'annual', '2026-08-19', '2026-08-19', 'full_day', 'approved', 'Family commitment.', IMRAN),
  leaveRequest('lv-2', 'emp-1003', 'sick', '2026-08-18', '2026-08-18', 'half_day', 'approved', 'Medical appointment.', IMRAN),
  leaveRequest('lv-3', 'emp-1004', 'annual', '2026-09-15', '2026-09-17', 'full_day', 'pending', 'Short break.'),
  leaveRequest('lv-4', 'emp-1001', 'casual', '2026-09-21', '2026-09-21', 'full_day', 'pending', 'Personal errand.'),
  // Overlaps the approved `lv-1`, so the conflict state HR must resolve
  // (`REQ-LV-007`) is demonstrable rather than described.
  leaveRequest('lv-5', 'emp-1003', 'casual', '2026-08-19', '2026-08-20', 'full_day', 'pending', 'Extending the family commitment by a day.'),
];

export const WFH_REQUESTS: readonly WfhRequest[] = [
  {
    id: 'wfh-1',
    employeeId: 'emp-1001',
    requestDate: '2026-09-01',
    wfhDate: '2026-09-04',
    portion: 'full_day',
    reason: 'Focused work on the client portal audit; no on-site meetings scheduled.',
    plannedTasks: 'Portal accessibility audit — screen-reader pass.',
    divisionId: 'wcf',
    contactAvailability: 'Available on Teams 09:00 to 17:00.',
    attachmentIds: [],
    state: 'pending',
    decision: null,
    ...STAMP,
  },
  {
    id: 'wfh-2',
    employeeId: 'emp-1001',
    requestDate: '2026-08-26',
    wfhDate: '2026-08-28',
    portion: 'full_day',
    reason: 'Writing up the benchmark report.',
    plannedTasks: 'Benchmark report write-up.',
    divisionId: 'pia',
    contactAvailability: 'Available on Teams all day.',
    attachmentIds: [],
    state: 'approved',
    decision: {
      decidedAt: '2026-08-27T10:12:00+06:00',
      decidedBy: IMRAN,
      outcome: 'approved',
      comment: 'Fine — keep the standup.',
      override: null,
    },
    ...STAMP,
  },
  {
    id: 'wfh-3',
    employeeId: 'emp-1003',
    requestDate: '2026-08-26',
    wfhDate: '2026-08-28',
    portion: 'full_day',
    reason: 'Curriculum writing.',
    plannedTasks: 'Cohort 7 curriculum update.',
    divisionId: 'pit',
    contactAvailability: 'On Teams.',
    attachmentIds: [],
    state: 'approved',
    decision: {
      decidedAt: '2026-08-27T09:40:00+06:00',
      decidedBy: IMRAN,
      outcome: 'approved',
      comment: null,
      override: null,
    },
    ...STAMP,
  },
  {
    id: 'wfh-4',
    employeeId: 'emp-1002',
    requestDate: '2026-08-31',
    wfhDate: '2026-09-01',
    portion: 'half_day',
    reason: 'Delivery at home in the morning.',
    plannedTasks: 'Latency profiling.',
    divisionId: 'cjg',
    contactAvailability: 'Phone only until 12:00.',
    attachmentIds: [],
    state: 'information_requested',
    decision: {
      decidedAt: '2026-08-31T15:00:00+06:00',
      decidedBy: IMRAN,
      outcome: 'information_requested',
      comment: 'Which tasks will you cover in the afternoon?',
      override: null,
    },
    ...STAMP,
  },
];

/* -------------------------------------------------------------------------- */
/* Remarks                                                                    */
/* -------------------------------------------------------------------------- */

export const REMARKS: readonly GeneralRemark[] = [
  {
    id: 'rmk-1',
    employeeId: 'emp-1002',
    authorEmployeeId: 'emp-2001',
    message:
      'This day came to 9:30. The reason mentions the print deadline, but the entry covers a single block with no break recorded. Please confirm whether you took a break, and split the entry if the work spanned two tasks.',
    relatedRecord: { type: 'timesheet', workDate: '2026-08-26' },
    isCorrectionRequest: true,
    requestedChanges:
      'Confirm the break, and split the entry by task if the work covered more than the layout pass.',
    state: 'open',
    responses: [],
    createdAt: '2026-08-27T09:20:00+06:00',
    createdBy: IMRAN,
    updatedAt: '2026-08-27T09:20:00+06:00',
    updatedBy: IMRAN,
  },
  {
    id: 'rmk-2',
    employeeId: 'emp-1003',
    authorEmployeeId: 'emp-2001',
    message:
      'No timesheet for 20 August, and there is no approved leave on that date. Please add the entry or apply for leave so the month closes cleanly.',
    relatedRecord: { type: 'timesheet', workDate: '2026-08-20' },
    isCorrectionRequest: true,
    requestedChanges: 'Add the missing entry for 20 August, or apply for leave.',
    state: 'open',
    responses: [],
    createdAt: '2026-08-24T10:05:00+06:00',
    createdBy: IMRAN,
    updatedAt: '2026-08-24T10:05:00+06:00',
    updatedBy: IMRAN,
  },
  {
    id: 'rmk-3',
    employeeId: 'emp-1001',
    authorEmployeeId: 'emp-2001',
    message:
      'The accessibility audit is past its due date. Is it blocked on the client, or do you need more time allocated?',
    relatedRecord: { type: 'task', taskId: 'tsk-6' },
    isCorrectionRequest: false,
    requestedChanges: null,
    state: 'responded',
    responses: [
      {
        id: 'rsp-1',
        remarkId: 'rmk-3',
        authorEmployeeId: 'emp-1001',
        message:
          'Blocked on the client returning the staging credentials. Keyboard pass is done; the screen-reader pass needs the environment.',
        createdAt: '2026-08-31T11:02:00+06:00',
      },
    ],
    createdAt: '2026-08-31T09:15:00+06:00',
    createdBy: IMRAN,
    updatedAt: '2026-08-31T11:02:00+06:00',
    updatedBy: actor('usr-1001', 'Nadia Rahman'),
  },
  {
    id: 'rmk-4',
    employeeId: 'emp-1001',
    authorEmployeeId: 'emp-2001',
    message: 'Thanks for splitting the July entries by division — much easier to reconcile.',
    relatedRecord: { type: 'none' },
    isCorrectionRequest: false,
    requestedChanges: null,
    state: 'resolved',
    responses: [],
    createdAt: '2026-08-03T14:30:00+06:00',
    createdBy: IMRAN,
    updatedAt: '2026-08-04T09:00:00+06:00',
    updatedBy: IMRAN,
  },
];

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

const REZAUL = actor('usr-3001', 'Rezaul Haque');

export const PERIODS: readonly TimesheetPeriod[] = [
  {
    id: 'per-2026-07',
    label: 'July 2026',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    status: 'verified',
    verifiedAt: '2026-08-04T16:20:00+06:00',
    verifiedBy: REZAUL,
    policyVersion: 3,
    includedEmployeeCount: 11,
    openExceptionCount: 0,
    ...STAMP,
  },
  {
    id: 'per-2026-08',
    label: 'August 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: 'pending_verification',
    verifiedAt: null,
    verifiedBy: null,
    policyVersion: 3,
    includedEmployeeCount: 11,
    openExceptionCount: 4,
    ...STAMP,
  },
  {
    id: 'per-2026-09',
    label: 'September 2026',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    status: 'open',
    verifiedAt: null,
    verifiedBy: null,
    policyVersion: 3,
    includedEmployeeCount: 11,
    openExceptionCount: 0,
    ...STAMP,
  },
];

/** True when the date falls inside a verified period (`REQ-TIME-027`). */
export function isDateLocked(date: string): boolean {
  return PERIODS.some(
    (period) =>
      period.status === 'verified' &&
      date >= period.startDate &&
      date <= period.endDate,
  );
}
