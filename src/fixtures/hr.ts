/**
 * Phase 5 demo data: employees, documents, record history, evaluation periods,
 * evaluations, and payroll-period unlock/amendment records.
 *
 * Kept beside `index.ts` rather than inside it because the HR surface roughly
 * doubles the dataset; the split keeps each file readable. The same rule
 * applies: development only, and nothing above the service layer imports it.
 */

import type {
  Employee,
  EvaluationAreaKey,
  EvaluationPeriod,
  EvaluationState,
  EvaluationWeighting,
  SelfEvaluation,
} from '@/contracts/domain';
import { STANDARD_POLICY } from './index';

const SYSTEM = { userId: 'usr-system', displayName: 'System' };

const STAMP = {
  createdAt: '2026-01-01T09:00:00+06:00',
  createdBy: SYSTEM,
  updatedAt: '2026-01-01T09:00:00+06:00',
  updatedBy: SYSTEM,
};

/* -------------------------------------------------------------------------- */
/* Employees                                                                  */
/* -------------------------------------------------------------------------- */

interface EmployeeSpec {
  readonly id: string;
  readonly code: string;
  readonly fullName: string;
  readonly designation: string;
  readonly department: string | null;
  readonly employmentType: Employee['employmentType'];
  readonly joiningDate: string;
  readonly status: Employee['status'];
  readonly email: string;
  readonly phone: string | null;
  readonly officeLocation: string | null;
  readonly primaryDivisionId: string;
  readonly teamLeadEmployeeId: string | null;
  readonly skills: readonly string[];
  readonly workMode: Employee['normalWorkMode'];
}

/**
 * Two records are deliberately incomplete (`emp-1004`, `emp-1091`): a missing
 * phone and office location is what makes the HR incomplete-profile filter and
 * dashboard tile demonstrable rather than described.
 */
const EMPLOYEE_SPECS: readonly EmployeeSpec[] = [
  {
    id: 'emp-1001',
    code: 'EMP-1001',
    fullName: 'Nadia Rahman',
    designation: 'Senior ML Engineer',
    department: 'Engineering',
    employmentType: 'full_time',
    joiningDate: '2024-02-11',
    status: 'active',
    email: 'nadia.rahman@demo.local',
    phone: '+8801711000101',
    officeLocation: 'Dhaka HQ, Level 4',
    primaryDivisionId: 'pia',
    teamLeadEmployeeId: 'emp-2001',
    skills: ['Python', 'PyTorch', 'MLOps'],
    workMode: 'hybrid',
  },
  {
    id: 'emp-1002',
    code: 'EMP-1002',
    fullName: 'Tanvir Ahmed',
    designation: 'Systems Engineer',
    department: 'Production',
    employmentType: 'full_time',
    joiningDate: '2023-09-15',
    status: 'active',
    email: 'tanvir.ahmed@demo.local',
    phone: '+8801711000102',
    officeLocation: 'Dhaka HQ, Level 2',
    primaryDivisionId: 'cjg',
    teamLeadEmployeeId: 'emp-2001',
    skills: ['Linux', 'Print production'],
    workMode: 'office',
  },
  {
    id: 'emp-1003',
    code: 'EMP-1003',
    fullName: 'Sadia Karim',
    designation: 'Training Coordinator',
    department: 'Training',
    employmentType: 'full_time',
    joiningDate: '2025-02-01',
    status: 'active',
    email: 'sadia.karim@demo.local',
    phone: '+8801711000103',
    officeLocation: 'Dhaka HQ, Level 3',
    primaryDivisionId: 'pit',
    teamLeadEmployeeId: 'emp-2001',
    skills: ['Curriculum design', 'Facilitation'],
    workMode: 'hybrid',
  },
  {
    id: 'emp-1004',
    code: 'EMP-1004',
    fullName: 'Sumaiya Noor',
    designation: 'Client Services Associate',
    department: null,
    employmentType: 'contract',
    joiningDate: '2025-04-01',
    status: 'active',
    email: 'sumaiya.noor@demo.local',
    phone: null,
    officeLocation: null,
    primaryDivisionId: 'wcf',
    teamLeadEmployeeId: 'emp-2002',
    skills: ['Client onboarding'],
    workMode: 'client_location',
  },
  {
    id: 'emp-2001',
    code: 'EMP-2001',
    fullName: 'Imran Hossain',
    designation: 'Team Lead, Engineering',
    department: 'Engineering',
    employmentType: 'full_time',
    joiningDate: '2022-06-05',
    status: 'active',
    email: 'imran.hossain@demo.local',
    phone: '+8801711000201',
    officeLocation: 'Dhaka HQ, Level 4',
    primaryDivisionId: 'pia',
    teamLeadEmployeeId: null,
    skills: ['Delivery management', 'Python'],
    workMode: 'office',
  },
  {
    id: 'emp-2002',
    code: 'EMP-2002',
    fullName: 'Farhana Islam',
    designation: 'Team Lead, Government Projects',
    department: 'Delivery',
    employmentType: 'full_time',
    joiningDate: '2022-11-20',
    status: 'active',
    email: 'farhana.islam@demo.local',
    phone: '+8801711000202',
    officeLocation: 'Dhaka HQ, Level 5',
    primaryDivisionId: 'gov',
    teamLeadEmployeeId: null,
    skills: ['Public sector delivery'],
    workMode: 'office',
  },
  {
    id: 'emp-3001',
    code: 'EMP-3001',
    fullName: 'Rezaul Haque',
    designation: 'HR Manager',
    department: 'People',
    employmentType: 'full_time',
    joiningDate: '2021-03-14',
    status: 'active',
    email: 'rezaul.haque@demo.local',
    phone: '+8801711000301',
    officeLocation: 'Dhaka HQ, Level 1',
    primaryDivisionId: 'pia',
    teamLeadEmployeeId: null,
    skills: ['HR operations'],
    workMode: 'office',
  },
  {
    id: 'emp-4001',
    code: 'EMP-4001',
    fullName: 'Mahmuda Akter',
    designation: 'Finance Manager',
    department: 'Finance',
    employmentType: 'full_time',
    joiningDate: '2021-08-02',
    status: 'active',
    email: 'mahmuda.akter@demo.local',
    phone: '+8801711000401',
    officeLocation: 'Dhaka HQ, Level 1',
    primaryDivisionId: 'pia',
    teamLeadEmployeeId: null,
    skills: ['Payroll', 'Costing'],
    workMode: 'office',
  },
  {
    id: 'emp-4002',
    code: 'EMP-4002',
    fullName: 'Shakil Chowdhury',
    designation: 'Finance Analyst',
    department: 'Finance',
    employmentType: 'full_time',
    joiningDate: '2024-01-08',
    status: 'active',
    email: 'shakil.chowdhury@demo.local',
    phone: '+8801711000402',
    officeLocation: 'Dhaka HQ, Level 1',
    primaryDivisionId: 'pia',
    teamLeadEmployeeId: 'emp-4001',
    skills: ['Reporting'],
    workMode: 'office',
  },
  {
    id: 'emp-5001',
    code: 'EMP-5001',
    fullName: 'Ayesha Siddika',
    designation: 'Director',
    department: 'Executive',
    employmentType: 'full_time',
    joiningDate: '2020-01-06',
    status: 'active',
    email: 'ayesha.siddika@demo.local',
    phone: '+8801711000501',
    officeLocation: 'Dhaka HQ, Level 6',
    primaryDivisionId: 'pia',
    teamLeadEmployeeId: null,
    skills: [],
    workMode: 'office',
  },
  {
    id: 'emp-9001',
    code: 'EMP-9001',
    fullName: 'Arif Mahmud',
    designation: 'Super Administrator',
    department: 'IT',
    employmentType: 'full_time',
    joiningDate: '2020-05-18',
    status: 'active',
    email: 'arif.mahmud@demo.local',
    phone: '+8801711000901',
    officeLocation: 'Dhaka HQ, Level 2',
    primaryDivisionId: 'pia',
    teamLeadEmployeeId: null,
    skills: ['Platform administration'],
    workMode: 'office',
  },
  {
    id: 'emp-1090',
    code: 'EMP-1090',
    fullName: 'Rafiq Chowdhury',
    designation: 'Field Engineer',
    department: 'Production',
    employmentType: 'full_time',
    joiningDate: '2023-01-09',
    status: 'active',
    email: 'rafiq.chowdhury@demo.local',
    phone: '+8801711001090',
    officeLocation: 'Field',
    primaryDivisionId: 'cjg',
    teamLeadEmployeeId: 'emp-2001',
    skills: ['Field support'],
    workMode: 'field_work',
  },
  {
    id: 'emp-1091',
    code: 'EMP-1091',
    fullName: 'Nusrat Jahan',
    designation: 'Content Writer (former)',
    department: null,
    employmentType: 'part_time',
    joiningDate: '2024-07-01',
    status: 'inactive',
    email: 'nusrat.jahan@demo.local',
    phone: null,
    officeLocation: null,
    primaryDivisionId: 'cjg',
    teamLeadEmployeeId: 'emp-2001',
    skills: ['Copywriting'],
    workMode: 'wfh',
  },
];

export const EMPLOYEES: readonly Employee[] = EMPLOYEE_SPECS.map((spec) => ({
  id: spec.id,
  employeeCode: spec.code,
  fullName: spec.fullName,
  photoUrl: null,
  designation: spec.designation,
  department: spec.department,
  employmentType: spec.employmentType,
  joiningDate: spec.joiningDate,
  status: spec.status,
  email: spec.email,
  phone: spec.phone,
  officeLocation: spec.officeLocation,
  primaryDivisionId: spec.primaryDivisionId,
  teamLeadEmployeeId: spec.teamLeadEmployeeId,
  skills: spec.skills,
  normalWorkMode: spec.workMode,
  standardDailyActiveMinutes: STANDARD_POLICY.requiredActiveMinutes,
  standardWeeklyActiveMinutes: STANDARD_POLICY.requiredActiveMinutes * 5,
  workPolicyId: STANDARD_POLICY.id,
  ...STAMP,
}));

/* -------------------------------------------------------------------------- */
/* Documents and record history                                               */
/* -------------------------------------------------------------------------- */

export interface EmployeeDocumentFixture {
  readonly id: string;
  readonly employeeId: string;
  readonly title: string;
  readonly category: string;
  readonly uploadedAt: string;
  readonly isRestricted: boolean;
}

export const EMPLOYEE_DOCUMENTS: readonly EmployeeDocumentFixture[] = [
  { id: 'doc-1', employeeId: 'emp-1001', title: 'Signed offer letter', category: 'Employment', uploadedAt: '2024-02-11T10:00:00+06:00', isRestricted: false },
  { id: 'doc-2', employeeId: 'emp-1001', title: 'Salary revision letter', category: 'Compensation', uploadedAt: '2026-01-12T11:30:00+06:00', isRestricted: true },
  { id: 'doc-3', employeeId: 'emp-1003', title: 'Training certification', category: 'Development', uploadedAt: '2025-11-04T09:15:00+06:00', isRestricted: false },
  { id: 'doc-4', employeeId: 'emp-1004', title: 'Contract extension', category: 'Employment', uploadedAt: '2026-04-01T14:00:00+06:00', isRestricted: false },
];

export interface EmployeeAuditFixture {
  readonly id: string;
  readonly employeeId: string;
  readonly occurredAt: string;
  readonly actor: string;
  readonly action: string;
  readonly detail: string;
  readonly reason: string | null;
}

export const EMPLOYEE_AUDIT: readonly EmployeeAuditFixture[] = [
  { id: 'aud-1', employeeId: 'emp-1001', occurredAt: '2025-06-01T09:20:00+06:00', actor: 'Rezaul Haque', action: 'Assignment added', detail: 'WesternCF, 20% allocation', reason: null },
  { id: 'aud-2', employeeId: 'emp-1001', occurredAt: '2026-01-12T11:31:00+06:00', actor: 'Rezaul Haque', action: 'Document uploaded', detail: 'Salary revision letter (restricted)', reason: null },
  { id: 'aud-3', employeeId: 'emp-1004', occurredAt: '2026-08-31T17:05:00+06:00', actor: 'System', action: 'Assignment expired', detail: 'Government Projects temporary assignment ended', reason: 'End date reached' },
  { id: 'aud-4', employeeId: 'emp-1004', occurredAt: '2026-07-01T09:00:00+06:00', actor: 'Rezaul Haque', action: 'Temporary assignment created', detail: 'Government Projects, 25% to 31 Aug 2026', reason: 'Records digitisation surge' },
  { id: 'aud-5', employeeId: 'emp-1003', occurredAt: '2026-08-18T08:40:00+06:00', actor: 'Imran Hossain', action: 'Leave approved', detail: 'Sick leave, half day', reason: null },
];

/* -------------------------------------------------------------------------- */
/* Evaluation periods and evaluations                                         */
/* -------------------------------------------------------------------------- */

export const EVALUATION_PERIODS: readonly EvaluationPeriod[] = [
  {
    id: 'evp-q3-2026',
    name: 'Q3 2026 quarterly review',
    type: 'quarterly',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
    dueDate: '2026-09-30',
    weightingVersion: 1,
    isOpen: true,
    ...STAMP,
  },
  {
    id: 'evp-h1-2026',
    name: 'H1 2026 half-yearly review',
    type: 'half_yearly',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    dueDate: '2026-07-15',
    weightingVersion: 1,
    isOpen: false,
    ...STAMP,
  },
];

/** Default weighting 30/25/15/10/10/10 (`REQ-EVAL-006`). */
export const EVALUATION_WEIGHTING: EvaluationWeighting = {
  version: 1,
  effectiveFrom: '2025-01-01',
  weights: {
    task_completion: 30,
    work_quality: 25,
    timeliness: 15,
    teamwork_communication: 10,
    responsibility: 10,
    learning_initiative: 10,
  },
};

export interface EvaluationFixture {
  readonly id: string;
  readonly periodId: string;
  readonly employeeId: string;
  readonly reviewerEmployeeId: string;
  readonly state: EvaluationState;
  readonly scores: Readonly<Record<EvaluationAreaKey, number>>;
  readonly comments: Readonly<Record<EvaluationAreaKey, string>>;
  readonly reviewerSummary: string;
  readonly selfEvaluation: SelfEvaluation | null;
  readonly publishedAt: string | null;
  readonly publishedBy: string | null;
  readonly reminderSentAt: string | null;
}

function scoreSet(value: number): Record<EvaluationAreaKey, number> {
  return {
    task_completion: value,
    work_quality: value,
    timeliness: value,
    teamwork_communication: value,
    responsibility: value,
    learning_initiative: value,
  };
}

function emptyComments(): Record<EvaluationAreaKey, string> {
  return {
    task_completion: '',
    work_quality: '',
    timeliness: '',
    teamwork_communication: '',
    responsibility: '',
    learning_initiative: '',
  };
}

export const EVALUATIONS: readonly EvaluationFixture[] = [
  {
    id: 'eval-emp-1001',
    periodId: 'evp-q3-2026',
    employeeId: 'emp-1001',
    reviewerEmployeeId: 'emp-2001',
    state: 'reviewer_scoring',
    scores: scoreSet(4),
    comments: emptyComments(),
    reviewerSummary: 'Strong delivery with clear communication on blockers.',
    selfEvaluation: {
      achievements: 'Shipped the evaluation harness and drafted the records intake schema.',
      completedProjects: 'Vision Platform v2 benchmark milestone.',
      challenges: 'Client access for the portal audit blocked the screen-reader pass.',
      skills: 'Deepened MLOps and accessibility testing.',
      trainingNeeds: 'Formal WCAG 2.2 training.',
      goals: 'Close the accessibility audit and hand over the intake schema.',
      supportRequired: 'Earlier access to the staging environment.',
      submittedAt: '2026-09-01T16:40:00+06:00',
    },
    publishedAt: null,
    publishedBy: null,
    reminderSentAt: null,
  },
  {
    id: 'eval-emp-1002',
    periodId: 'evp-q3-2026',
    employeeId: 'emp-1002',
    reviewerEmployeeId: 'emp-2001',
    state: 'not_started',
    scores: scoreSet(0),
    comments: emptyComments(),
    reviewerSummary: '',
    selfEvaluation: null,
    publishedAt: null,
    publishedBy: null,
    reminderSentAt: null,
  },
  {
    id: 'eval-emp-1003',
    periodId: 'evp-q3-2026',
    employeeId: 'emp-1003',
    reviewerEmployeeId: 'emp-2001',
    state: 'hr_review',
    scores: {
      task_completion: 4,
      work_quality: 5,
      timeliness: 3,
      teamwork_communication: 5,
      responsibility: 4,
      learning_initiative: 4,
    },
    comments: {
      task_completion: 'Cohort 7 curriculum delivered on plan.',
      work_quality: 'Materials needed no rework.',
      timeliness: 'Two under-time days in August after the approved leave.',
      teamwork_communication: 'Coordinates well across PIT and PIA.',
      responsibility: 'Owns the cohort schedule end to end.',
      learning_initiative: 'Completed the facilitation course.',
    },
    reviewerSummary: 'Reliable delivery and strong collaboration across two divisions.',
    selfEvaluation: {
      achievements: 'Delivered cohort 7 and rebuilt the assessment bank.',
      completedProjects: 'AI Literacy Bootcamp cohort 7.',
      challenges: 'Balancing PIT delivery with the PIA support allocation.',
      skills: 'Facilitation and assessment design.',
      trainingNeeds: 'Advanced instructional design.',
      goals: 'Automate the assessment marking.',
      supportRequired: 'A second facilitator for cohort 8.',
      submittedAt: '2026-08-30T12:10:00+06:00',
    },
    publishedAt: null,
    publishedBy: null,
    reminderSentAt: '2026-09-01T09:00:00+06:00',
  },
  {
    id: 'eval-emp-1004',
    periodId: 'evp-h1-2026',
    employeeId: 'emp-1004',
    reviewerEmployeeId: 'emp-2002',
    state: 'published',
    scores: {
      task_completion: 4,
      work_quality: 4,
      timeliness: 5,
      teamwork_communication: 4,
      responsibility: 4,
      learning_initiative: 5,
    },
    comments: emptyComments(),
    reviewerSummary: 'Consistent client service with excellent responsiveness.',
    selfEvaluation: {
      achievements: 'Onboarded eleven Westbridge users without escalation.',
      completedProjects: 'Westbridge portal rollout, onboarding workstream.',
      challenges: 'The temporary Government Projects allocation split my week.',
      skills: 'Client onboarding and escalation handling.',
      trainingNeeds: 'Portal administration.',
      goals: 'Take ownership of the onboarding checklist.',
      supportRequired: 'A stable single-division allocation.',
      submittedAt: '2026-07-02T10:00:00+06:00',
    },
    publishedAt: '2026-07-15T15:30:00+06:00',
    publishedBy: 'Rezaul Haque',
    reminderSentAt: null,
  },
];

/* -------------------------------------------------------------------------- */
/* Payroll-period unlock requests and amendments                              */
/* -------------------------------------------------------------------------- */

export interface UnlockRequestFixture {
  readonly periodId: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly reason: string;
  readonly state: 'pending' | 'granted' | 'declined';
}

export const UNLOCK_REQUESTS: readonly UnlockRequestFixture[] = [
  {
    periodId: 'per-2026-07',
    requestedBy: 'Imran Hossain',
    requestedAt: '2026-08-12T10:45:00+06:00',
    reason:
      'A July entry for Tanvir Ahmed was recorded against the wrong division and needs an amendment.',
    state: 'pending',
  },
];

export interface PeriodAmendmentFixture {
  readonly id: string;
  readonly periodId: string;
  readonly employeeId: string;
  readonly recordLabel: string;
  readonly reason: string;
  readonly amendedAt: string;
  readonly amendedBy: string;
  readonly before: string;
  readonly after: string;
}

export const PERIOD_AMENDMENTS: readonly PeriodAmendmentFixture[] = [
  {
    id: 'amd-1',
    periodId: 'per-2026-07',
    employeeId: 'emp-1001',
    recordLabel: 'Time entry, 23 Jul 2026',
    reason: 'Division corrected after the client confirmed the work was Government Projects.',
    amendedAt: '2026-08-06T11:10:00+06:00',
    amendedBy: 'Rezaul Haque',
    before: 'PowerInAI, 3:00',
    after: 'Government Projects, 3:00',
  },
];
