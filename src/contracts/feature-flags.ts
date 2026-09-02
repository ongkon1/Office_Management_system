/**
 * FE-0019 - Frontend feature-flag map.
 *
 * A flag gates a module delivered after the MVP. When a flag is off, its
 * navigation entries, dashboard tiles, quick actions, and routes disappear
 * entirely — the route returns the not-found presentation rather than a teaser,
 * so a disabled module can never be mistaken for a broken one, and no MVP flow
 * ever depends on a flagged module (`FE-0006`).
 */

export type DeliveryPhase = 'mvp' | 'phase_2' | 'phase_3' | 'phase_4';

export interface FeatureFlagDefinition {
  readonly key: FeatureFlagKey;
  readonly label: string;
  readonly phase: DeliveryPhase;
  readonly description: string;
  /** Default in the frontend milestone demo build. */
  readonly defaultEnabled: boolean;
  /** Routes hidden and blocked when the flag is off. */
  readonly routes: readonly string[];
}

export type FeatureFlagKey =
  | 'wfhRequests'
  | 'leaveManagement'
  | 'attendance'
  | 'evaluations'
  | 'workloadPlanning'
  | 'notifications'
  | 'financeReports'
  | 'projectCosting'
  | 'documents'
  | 'messages'
  | 'globalSearch'
  | 'integrations'
  | 'aiInsights';

export const FEATURE_FLAGS: Readonly<Record<FeatureFlagKey, FeatureFlagDefinition>> = {
  wfhRequests: {
    key: 'wfhRequests',
    label: 'WFH requests',
    phase: 'phase_2',
    description:
      'WFH request submission, Team Lead decision, and HR override. WFH as a work location on a time entry is MVP and is never gated by this flag.',
    defaultEnabled: true,
    routes: ['/wfh', '/requests'],
  },
  leaveManagement: {
    key: 'leaveManagement',
    label: 'Leave management',
    phase: 'phase_2',
    description: 'Leave types, balances, requests, decisions, and half-day requirement adjustment.',
    defaultEnabled: true,
    routes: ['/leave'],
  },
  attendance: {
    key: 'attendance',
    label: 'Attendance',
    phase: 'phase_2',
    description: 'Derived attendance calendar and exception views across all attendance states.',
    defaultEnabled: true,
    routes: ['/attendance'],
  },
  evaluations: {
    key: 'evaluations',
    label: 'Evaluations',
    phase: 'phase_2',
    description: 'Evaluation periods, self-evaluation, reviewer scoring, weighting, and publication.',
    defaultEnabled: true,
    routes: ['/evaluations'],
  },
  workloadPlanning: {
    key: 'workloadPlanning',
    label: 'Workload planning',
    phase: 'phase_2',
    description: 'Weekly capacity, planned versus actual allocation, and workload warnings.',
    defaultEnabled: true,
    routes: ['/workload'],
  },
  notifications: {
    key: 'notifications',
    label: 'Notifications',
    phase: 'phase_2',
    description: 'In-app notification centre and role-specific triggers.',
    defaultEnabled: true,
    routes: ['/notifications'],
  },
  financeReports: {
    key: 'financeReports',
    label: 'Finance reports',
    phase: 'phase_2',
    description:
      'Payroll summaries and financial report builder. Verified hours and overtime views are MVP and are not gated.',
    defaultEnabled: true,
    routes: ['/finance/payroll', '/finance/reports'],
  },
  projectCosting: {
    key: 'projectCosting',
    label: 'Project costing',
    phase: 'phase_2',
    description: 'Cost rates, labour cost, and budget variance. Additionally requires the financial permission.',
    defaultEnabled: true,
    routes: ['/finance/project-costs', '/finance/division-costs'],
  },
  documents: {
    key: 'documents',
    label: 'Documents',
    phase: 'phase_3',
    description: 'Document library with company, division, and project scope.',
    defaultEnabled: false,
    routes: ['/documents'],
  },
  messages: {
    key: 'messages',
    label: 'Messages',
    phase: 'phase_3',
    description: 'Division, project, and direct messages plus task comments. Prototype only.',
    defaultEnabled: false,
    routes: ['/messages'],
  },
  globalSearch: {
    key: 'globalSearch',
    label: 'Global search',
    phase: 'phase_3',
    description: 'Cross-module authorized search and the command palette.',
    defaultEnabled: false,
    routes: ['/search'],
  },
  integrations: {
    key: 'integrations',
    label: 'Integrations',
    phase: 'phase_3',
    description:
      'Calendar, email, storage, conferencing, biometric, payroll, accounting, SSO, API, and webhook settings. Placeholders only — never presented as a connected service.',
    defaultEnabled: false,
    routes: ['/admin/integrations'],
  },
  aiInsights: {
    key: 'aiInsights',
    label: 'AI insights',
    phase: 'phase_4',
    description: 'Summaries, forecasting, anomaly detection, and natural-language reporting. Not built in this milestone.',
    defaultEnabled: false,
    routes: [],
  },
};

export type FeatureFlagState = Readonly<Record<FeatureFlagKey, boolean>>;

/** The flag state used by the stakeholder demo build. */
export const DEMO_FEATURE_FLAGS: FeatureFlagState = Object.freeze(
  Object.fromEntries(
    Object.values(FEATURE_FLAGS).map((flag) => [flag.key, flag.defaultEnabled]),
  ) as Record<FeatureFlagKey, boolean>,
);

/** The minimum flag state proving the MVP stands alone (`FE-0006`). */
export const MVP_ONLY_FEATURE_FLAGS: FeatureFlagState = Object.freeze(
  Object.fromEntries(
    Object.values(FEATURE_FLAGS).map((flag) => [flag.key, false]),
  ) as Record<FeatureFlagKey, boolean>,
);

export function isFeatureEnabled(state: FeatureFlagState, key: FeatureFlagKey): boolean {
  return state[key] === true;
}

/** Returns the flag gating a route, or `null` when the route is ungated. */
export function findFlagForRoute(route: string): FeatureFlagDefinition | null {
  for (const flag of Object.values(FEATURE_FLAGS)) {
    if (flag.routes.some((flagRoute) => route === flagRoute || route.startsWith(`${flagRoute}/`))) {
      return flag;
    }
  }
  return null;
}

export function isRouteEnabled(state: FeatureFlagState, route: string): boolean {
  const flag = findFlagForRoute(route);
  return flag === null || isFeatureEnabled(state, flag.key);
}
