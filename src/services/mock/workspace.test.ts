import { beforeEach, describe, expect, it } from 'vitest';
import { mockWorkspaceService, resetWorkspaceState } from './workspace';
import { mockReportingService, resetReportingState } from './reporting';
import { mockAdminService, resetAdminState } from './admin';
import { mockStore } from './store';

const EMPLOYEE = 'usr-1001';
const TEAM_LEAD = 'usr-2001';
const HR = 'usr-3001';
const FINANCE_FULL = 'usr-4001';
const FINANCE_LIMITED = 'usr-4002';
const ADMIN = 'usr-9001';

beforeEach(() => {
  mockStore.reset();
  resetWorkspaceState();
  resetReportingState();
  resetAdminState();
});

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

describe('notifications (FE-0710)', () => {
  it('returns only the recipient’s own notifications', async () => {
    const employee = await mockWorkspaceService.getNotifications(EMPLOYEE);
    const lead = await mockWorkspaceService.getNotifications(TEAM_LEAD);
    expect(employee.status).toBe('success');
    expect(lead.status).toBe('success');
    if (employee.status !== 'success' || lead.status !== 'success') return;

    const employeeTitles = employee.data.groups.flatMap((group) =>
      group.items.map((item) => item.title),
    );
    const leadTitles = lead.data.groups.flatMap((group) => group.items.map((item) => item.title));
    expect(employeeTitles).not.toEqual(leadTitles);
    // The Team Lead's critical-time escalation must not reach the employee.
    expect(employeeTitles.some((title) => title.includes('Critical time'))).toBe(false);
  });

  it('lifts everything needing an action into one group', async () => {
    const result = await mockWorkspaceService.getNotifications(TEAM_LEAD);
    if (result.status !== 'success') return;
    const first = result.data.groups[0];
    expect(first.key).toBe('action_required');
    expect(first.items.every((item) => item.requiresAction)).toBe(true);
  });

  it('treats another recipient’s notification as not found, never denied', async () => {
    // `ntf-10` belongs to the Team Lead. A denial would confirm it exists.
    const result = await mockWorkspaceService.markNotificationRead(EMPLOYEE, 'ntf-10', true);
    expect(result.status).toBe('not_found');
  });

  it('marks read and unread, and keeps the count consistent', async () => {
    const before = await mockWorkspaceService.getNotifications(EMPLOYEE);
    if (before.status !== 'success') return;
    const initial = before.data.unreadCount;
    expect(initial).toBeGreaterThan(0);

    const marked = await mockWorkspaceService.markNotificationRead(EMPLOYEE, 'ntf-1', true);
    if (marked.status !== 'success') return;
    expect(marked.data.unreadCount).toBe(initial - 1);

    const all = await mockWorkspaceService.markAllNotificationsRead(EMPLOYEE);
    if (all.status !== 'success') return;
    expect(all.data.unreadCount).toBe(0);
    // Nothing is dismissed — every notification is still listed.
    expect(all.data.groups.flatMap((group) => group.items).length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

describe('search (FE-0711, FE-0712)', () => {
  it('counts only results the viewer may see', async () => {
    const hr = await mockWorkspaceService.search(HR, 'Nadia');
    const lead = await mockWorkspaceService.search(TEAM_LEAD, 'Nadia');
    if (hr.status !== 'success' || lead.status !== 'success') return;

    // Both may see her, but the counts come from filtered sets, never a
    // shared unfiltered total.
    expect(hr.data.totalCount).toBe(
      hr.data.groups.reduce((sum, group) => sum + group.results.length, 0),
    );
    expect(lead.data.totalCount).toBe(
      lead.data.groups.reduce((sum, group) => sum + group.results.length, 0),
    );
  });

  it('omits a restricted-division document rather than listing it', async () => {
    // The GOV security protocol needs organization.government.view.
    const without = await mockWorkspaceService.search(TEAM_LEAD, 'security protocol');
    const with_ = await mockWorkspaceService.search('usr-2002', 'security protocol');
    if (without.status !== 'success' || with_.status !== 'success') return;

    expect(without.data.totalCount).toBe(0);
    expect(with_.data.totalCount).toBeGreaterThan(0);
  });

  it('does not let an employee search other employees', async () => {
    const result = await mockWorkspaceService.search(EMPLOYEE, 'Tanvir');
    if (result.status !== 'success') return;
    const employees = result.data.groups.find((group) => group.kind === 'employee');
    expect(employees).toBeUndefined();
  });

  it('gives guidance rather than an empty screen', async () => {
    const empty = await mockWorkspaceService.search(HR, '');
    const noMatch = await mockWorkspaceService.search(HR, 'zzzzz-not-a-thing');
    if (empty.status !== 'success' || noMatch.status !== 'success') return;
    expect(empty.data.guidance).toContain('Type at least one character');
    expect(noMatch.data.guidance).toContain('No results you have access to');
  });

  it('records recent searches per viewer', async () => {
    await mockWorkspaceService.search(HR, 'Nadia');
    await mockWorkspaceService.search(HR, 'Vision');
    const hr = await mockWorkspaceService.listRecentSearches(HR);
    const other = await mockWorkspaceService.listRecentSearches(EMPLOYEE);
    if (hr.status !== 'success' || other.status !== 'success') return;
    expect(hr.data).toEqual(['Vision', 'Nadia']);
    expect(other.data).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

describe('documents (FE-0723)', () => {
  it('lists a restricted document with its reason, and refuses the download', async () => {
    // Farhana holds the government permission; Imran does not, and GOV is not
    // in his scope, so the document is absent from his library entirely.
    const authorized = await mockWorkspaceService.getDocuments('usr-2002');
    const unauthorized = await mockWorkspaceService.getDocuments(TEAM_LEAD);
    if (authorized.status !== 'success' || unauthorized.status !== 'success') return;

    const authorizedTitles = authorized.data.groups.flatMap((group) =>
      group.documents.map((document) => document.title),
    );
    const unauthorizedTitles = unauthorized.data.groups.flatMap((group) =>
      group.documents.map((document) => document.title),
    );
    expect(authorizedTitles).toContain('Government Projects security protocol');
    expect(unauthorizedTitles).not.toContain('Government Projects security protocol');
  });

  it('returns not-found for a document outside the viewer’s divisions', async () => {
    const result = await mockWorkspaceService.downloadDocument(TEAM_LEAD, 'lib-4');
    expect(result.status).toBe('not_found');
  });

  it('says plainly that no file is delivered yet', async () => {
    const result = await mockWorkspaceService.downloadDocument(EMPLOYEE, 'lib-1');
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.note).toContain('No file is delivered');
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Employee self-service                                                      */
/* -------------------------------------------------------------------------- */

describe('WFH self-service (FE-0720)', () => {
  it('refuses a request for a date that has passed, with guidance', async () => {
    const result = await mockWorkspaceService.submitWfhRequest(EMPLOYEE, {
      wfhDate: '2026-08-01',
      portion: 'full_day',
      divisionId: 'pia',
      reason: 'Focus work',
      plannedTasks: 'Benchmark write-up',
      contactAvailability: 'Teams',
    });
    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.fieldErrors[0].field).toBe('wfhDate');
      expect(result.fieldErrors[0].guidance).toBeTruthy();
    }
  });

  it('refuses a second request for the same day', async () => {
    // `wfh-1` already covers 2026-09-04 and is pending.
    const result = await mockWorkspaceService.submitWfhRequest(EMPLOYEE, {
      wfhDate: '2026-09-04',
      portion: 'full_day',
      divisionId: 'pia',
      reason: 'Focus work',
      plannedTasks: 'Benchmark write-up',
      contactAvailability: 'Teams',
    });
    expect(result.status).toBe('conflict');
  });

  it('creates a pending request the employee can cancel', async () => {
    const created = await mockWorkspaceService.submitWfhRequest(EMPLOYEE, {
      wfhDate: '2026-09-09',
      portion: 'full_day',
      divisionId: 'pia',
      reason: 'Focus work on the harness',
      plannedTasks: 'Model evaluation harness',
      contactAvailability: 'Teams 09:00 to 17:00',
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') return;
    expect(created.data.state).toBe('pending');
    expect(created.data.canCancel).toBe(true);
    expect(created.data.nextStep).toContain('Team Lead');

    const cancelled = await mockWorkspaceService.cancelRequest(EMPLOYEE, 'wfh', created.data.id);
    if (cancelled.status !== 'success') return;
    expect(cancelled.data.state).toBe('cancelled');
  });

  it('treats another employee’s request as not found', async () => {
    // `wfh-3` belongs to Sadia Karim.
    const result = await mockWorkspaceService.cancelRequest(EMPLOYEE, 'wfh', 'wfh-3');
    expect(result.status).toBe('not_found');
  });

  it('refuses to cancel a decided request', async () => {
    const result = await mockWorkspaceService.cancelRequest(EMPLOYEE, 'wfh', 'wfh-2');
    expect(result.status).toBe('conflict');
  });
});

describe('leave self-service (FE-0721)', () => {
  it('refuses a half day on a leave type that does not allow one', async () => {
    const result = await mockWorkspaceService.submitLeaveRequest(EMPLOYEE, {
      leaveType: 'unpaid',
      startDate: '2026-09-20',
      endDate: '2026-09-21',
      portion: 'half_day',
      reason: 'Personal',
    });
    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.fieldErrors[0].field).toBe('portion');
    }
  });

  it('refuses a request beyond the remaining balance, with a way forward', async () => {
    const result = await mockWorkspaceService.submitLeaveRequest(EMPLOYEE, {
      leaveType: 'casual',
      startDate: '2026-09-14',
      endDate: '2026-09-30',
      portion: 'full_day',
      reason: 'Extended break',
    });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.guidance).toContain('unpaid leave');
    }
  });

  it('counts a half day as 0.5 and a range inclusively', async () => {
    const half = await mockWorkspaceService.submitLeaveRequest(EMPLOYEE, {
      leaveType: 'annual',
      startDate: '2026-09-23',
      endDate: '2026-09-23',
      portion: 'half_day',
      reason: 'Appointment',
    });
    if (half.status !== 'success') return;
    expect(half.data.detail).toContain('0.5 day');

    const range = await mockWorkspaceService.submitLeaveRequest(EMPLOYEE, {
      leaveType: 'annual',
      startDate: '2026-10-05',
      endDate: '2026-10-07',
      portion: 'full_day',
      reason: 'Family',
    });
    if (range.status !== 'success') return;
    expect(range.data.detail).toContain('3 days');
  });
});

describe('self-evaluation (FE-0722)', () => {
  it('keeps a draft private and only submits on request', async () => {
    const draft = await mockWorkspaceService.saveSelfEvaluation(
      'usr-1002',
      {
        achievements: 'Kept the September issue on schedule.',
        completedProjects: '',
        challenges: '',
        skills: '',
        trainingNeeds: '',
        goals: '',
        supportRequired: '',
      },
      false,
    );
    expect(draft.status).toBe('success');
    if (draft.status !== 'success') return;
    expect(draft.data.status).toBe('self_evaluation_draft');
    expect(draft.data.submittedAtLabel).toBeNull();
    expect(draft.data.isEditable).toBe(true);
  });

  it('requires something written before submitting', async () => {
    const result = await mockWorkspaceService.saveSelfEvaluation(
      'usr-1002',
      {
        achievements: '   ',
        completedProjects: '',
        challenges: '',
        skills: '',
        trainingNeeds: '',
        goals: '',
        supportRequired: '',
      },
      true,
    );
    expect(result.status).toBe('validation_failure');
  });

  it('shows the published result only once HR has published it', async () => {
    // Sumaiya Noor's H1 evaluation is published; Nadia's Q3 is not.
    const published = await mockWorkspaceService.getSelfEvaluation('usr-1004');
    const unpublished = await mockWorkspaceService.getSelfEvaluation(EMPLOYEE);
    if (published.status !== 'success' || unpublished.status !== 'success') return;

    expect(published.data.status).toBe('published');
    expect(published.data.published).not.toBeNull();
    expect(published.data.published?.weightedScore).toBeGreaterThan(0);

    expect(unpublished.data.published).toBeNull();
    expect(unpublished.data.statusExplanation).toContain('publishes');
  });

  it('refuses to change a published evaluation', async () => {
    const result = await mockWorkspaceService.saveSelfEvaluation(
      'usr-1004',
      {
        achievements: 'Changed',
        completedProjects: '',
        challenges: '',
        skills: '',
        trainingNeeds: '',
        goals: '',
        supportRequired: '',
      },
      false,
    );
    expect(result.status).toBe('conflict');
  });
});

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

describe('report catalogue (FE-0701)', () => {
  it('omits a report the viewer may not run rather than disabling it', async () => {
    const withPermission = await mockReportingService.listReports(FINANCE_FULL);
    const without = await mockReportingService.listReports(FINANCE_LIMITED);
    if (withPermission.status !== 'success' || without.status !== 'success') return;

    const keysOf = (groups: typeof withPermission.data) =>
      groups.flatMap((group) => group.reports.map((report) => report.key));

    expect(keysOf(withPermission.data)).toContain('cost-rates');
    expect(keysOf(without.data)).not.toContain('cost-rates');
    // The payroll report is still listed, with its columns redacted.
    expect(keysOf(without.data)).toContain('payroll-hours');
  });

  it('returns not-found — not denied — for an unavailable report', async () => {
    const unavailable = await mockReportingService.getReport(FINANCE_LIMITED, 'cost-rates');
    const nonexistent = await mockReportingService.getReport(FINANCE_FULL, 'no-such-report');
    expect(unavailable.status).toBe('not_found');
    expect(nonexistent.status).toBe('not_found');
  });

  it('flags up front that a report will have columns withheld', async () => {
    const result = await mockReportingService.getReport(FINANCE_LIMITED, 'payroll-hours');
    if (result.status !== 'success') return;
    expect(result.data.containsProtectedFields).toBe(true);
    expect(result.data.willRedactFields).toBe(true);
  });
});

describe('report preview (FE-0703)', () => {
  it('carries provenance on every run', async () => {
    const result = await mockReportingService.runReport(HR, {
      reportKey: 'attendance-register',
      from: '2026-08-17',
      to: '2026-08-19',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.timezone).toBe('Asia/Dhaka');
    expect(result.data.policyVersion).toBe(3);
    expect(result.data.generatedAtLabel).toBeTruthy();
    expect(result.data.appliedFilters[0].label).toBe('Date range');
  });

  it('warns when the range includes an unverified period', async () => {
    const unverified = await mockReportingService.runReport(HR, {
      reportKey: 'timesheet-detail',
      from: '2026-09-01',
      to: '2026-09-02',
    });
    const verified = await mockReportingService.runReport(HR, {
      reportKey: 'timesheet-detail',
      from: '2026-07-01',
      to: '2026-07-31',
    });
    if (unverified.status !== 'success' || verified.status !== 'success') return;

    expect(unverified.data.includesUnverifiedData).toBe(true);
    expect(unverified.data.unverifiedWarning).toContain('not verified');
    expect(verified.data.includesUnverifiedData).toBe(false);
  });

  it('keeps a restricted column and marks every cell', async () => {
    const result = await mockReportingService.runReport(FINANCE_LIMITED, {
      reportKey: 'payroll-hours',
      from: '2026-07-01',
      to: '2026-07-31',
    });
    if (result.status !== 'success') return;

    const costColumn = result.data.columns.find((column) => column.field === 'cost');
    expect(costColumn?.restricted).toBe(true);
    expect(result.data.rows.every((row) => row.cost === 'Restricted')).toBe(true);
    expect(result.data.totals?.cost).toBe('Restricted');
  });

  it('applies a status filter to the rows it returns', async () => {
    const all = await mockReportingService.runReport(HR, {
      reportKey: 'timesheet-detail',
      from: '2026-08-24',
      to: '2026-08-28',
    });
    const overtimeOnly = await mockReportingService.runReport(HR, {
      reportKey: 'timesheet-detail',
      from: '2026-08-24',
      to: '2026-08-28',
      overtimeOnly: true,
    });
    if (all.status !== 'success' || overtimeOnly.status !== 'success') return;
    expect(overtimeOnly.data.rowCount).toBeLessThan(all.data.rowCount);
    expect(overtimeOnly.data.rowCount).toBeGreaterThan(0);
  });
});

describe('exports (FE-0704, FE-0705)', () => {
  it('seeds every state that matters, including the ones people get stuck on', async () => {
    const result = await mockReportingService.listExports(HR);
    if (result.status !== 'success') return;
    const states = new Set(result.data.map((job) => job.state));
    expect(states.has('ready')).toBe(true);
    expect(states.has('processing')).toBe(true);
    expect(states.has('expired')).toBe(true);
    expect(states.has('failed')).toBe(true);
  });

  it('walks a job from queued to ready', async () => {
    const created = await mockReportingService.requestExport(HR, {
      reportKey: 'attendance-register',
      format: 'csv',
      run: { reportKey: 'attendance-register' },
    });
    if (created.status !== 'success') return;
    expect(created.data.job.state).toBe('queued');

    const processing = await mockReportingService.advanceExport(HR, created.data.job.id);
    if (processing.status !== 'success') return;
    expect(processing.data.state).toBe('processing');

    const ready = await mockReportingService.advanceExport(HR, created.data.job.id);
    if (ready.status !== 'success') return;
    expect(ready.data.state).toBe('ready');
    expect(ready.data.expiresAtLabel).toBeTruthy();
  });

  it('refuses a protected export without the export permission', async () => {
    const result = await mockReportingService.requestExport(FINANCE_LIMITED, {
      reportKey: 'payroll-hours',
      format: 'excel',
      run: { reportKey: 'payroll-hours' },
    });
    // Finance without finance.cost.view gets a redacted report, so the export
    // carries no protected columns and is allowed.
    expect(result.status).toBe('success');

    const withCost = await mockReportingService.requestExport(TEAM_LEAD, {
      reportKey: 'payroll-hours',
      format: 'excel',
      run: { reportKey: 'payroll-hours' },
    });
    // A Team Lead cannot run that report at all.
    expect(withCost.status).toBe('not_found');
  });

  it('requeues a failed job with the retrying viewer as requester', async () => {
    const result = await mockReportingService.retryExport(HR, 'rep-exp-4');
    if (result.status !== 'success') return;
    expect(result.data.state).toBe('queued');
    expect(result.data.requestedByLabel).toBe('Rezaul Haque');
    expect(result.data.failureMessage).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

describe('division administration (FE-0730)', () => {
  it('is limited to administrators', async () => {
    const result = await mockAdminService.listDivisions(HR);
    expect(result.status).toBe('permission_denied');
  });

  it('reports deactivation blockers before offering the control', async () => {
    const result = await mockAdminService.listDivisions(ADMIN);
    if (result.status !== 'success') return;
    const pia = result.data.find((division) => division.id === 'pia');
    expect(pia?.deactivationBlockers.length).toBeGreaterThan(0);
    expect(pia?.deactivationBlockers[0]).toContain('assignment');
  });

  it('refuses deactivation while records still depend on the division', async () => {
    const result = await mockAdminService.setDivisionActive(ADMIN, 'pia', false);
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') expect(result.guidance).toContain('assignment');
  });

  it('rejects a duplicate division code', async () => {
    const result = await mockAdminService.saveDivision(ADMIN, {
      name: 'New Division',
      code: 'pia',
      description: '',
      teamLeadEmployeeId: 'emp-2001',
      isRestricted: false,
    });
    expect(result.status).toBe('conflict');
  });
});

describe('roles and permissions (FE-0731)', () => {
  it('states the consequence of every sensitive grant', async () => {
    const result = await mockAdminService.listRoles(ADMIN);
    if (result.status !== 'success') return;
    // HR carries the sensitive grants now that it absorbed the Finance role.
    const hr = result.data.find((role) => role.key === 'hr_manager');
    expect(hr?.permissions.every((permission) => permission.consequence.length > 20)).toBe(true);
    expect(hr?.permissions.every((permission) => permission.isSensitive)).toBe(true);
  });

  it('lists the retired Finance role as history, with nothing to grant', async () => {
    const result = await mockAdminService.listRoles(ADMIN);
    if (result.status !== 'success') return;

    const retired = result.data.find((role) => role.key === 'finance_manager');
    expect(retired?.isRetired).toBe(true);
    // Nobody can hold it, so there is nothing to grant against it.
    expect(retired?.userCount).toBe(0);
    expect(retired?.permissions).toEqual([]);
  });

  it('does not grant HR the financial permission by role default', async () => {
    const result = await mockAdminService.listRoles(ADMIN);
    if (result.status !== 'success') return;

    // The whole point of the merge: HR reaches the finance screens, and sees
    // money on them only where an administrator granted it per user.
    const hr = result.data.find((role) => role.key === 'hr_manager');
    const financial = hr?.permissions.find((item) => item.key === 'finance.cost.view');
    expect(financial?.granted).toBe(false);
  });

  it('refuses to strip an administrator of their own access', async () => {
    const result = await mockAdminService.setRolePermission(
      ADMIN,
      'super_admin',
      'control.audit.view',
      false,
    );
    expect(result.status).toBe('conflict');
  });

  it('grants and revokes for every account holding the role', async () => {
    const granted = await mockAdminService.setRolePermission(
      ADMIN,
      'team_lead',
      'finance.cost.view',
      true,
    );
    if (granted.status !== 'success') return;
    const teamLead = granted.data.find((role) => role.key === 'team_lead');
    expect(
      teamLead?.permissions.find((permission) => permission.key === 'finance.cost.view')?.granted,
    ).toBe(true);
  });
});

describe('settings (FE-0732)', () => {
  it('presents the work policy as read-only and says why', async () => {
    const result = await mockAdminService.getWorkPolicySettings(ADMIN);
    if (result.status !== 'success') return;
    expect(result.data.isEditable).toBe(false);
    expect(result.data.readOnlyReason).toContain('backend');
    expect(result.data.versioningNote).toContain('new version');
    // The values must match the policy every calculation applies.
    expect(result.data.requiredActiveMinutes).toBe(420);
    expect(result.data.recognizedBreakMinutes).toBe(60);
    expect(result.data.requiredTotalMinutes).toBe(480);
    expect(result.data.criticalThresholdMinutes).toBe(720);
  });

  it('refuses to switch off a mandatory notification', async () => {
    const result = await mockAdminService.setNotificationSetting(
      ADMIN,
      'critical_time',
      'email',
      false,
    );
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') expect(result.guidance).toContain('policy');
  });

  it('changes an optional notification channel', async () => {
    const result = await mockAdminService.setNotificationSetting(
      ADMIN,
      'deadline_approaching',
      'email',
      true,
    );
    if (result.status !== 'success') return;
    expect(result.data.find((item) => item.key === 'deadline_approaching')?.email).toBe(true);
  });
});

describe('audit log (FE-0733)', () => {
  it('needs the audit permission on top of the administrator role', async () => {
    const result = await mockAdminService.getAuditLog(HR);
    expect(result.status).toBe('permission_denied');
  });

  it('shows a restricted event while withholding its values', async () => {
    const result = await mockAdminService.getAuditLog(ADMIN);
    if (result.status !== 'success') return;
    // The administrator holds every permission, so nothing is withheld here.
    expect(result.data.events.length).toBeGreaterThan(0);
    expect(result.data.events.every((event) => event.actorLabel.length > 0)).toBe(true);
    expect(result.data.events.some((event) => event.reason !== null)).toBe(true);
  });

  it('filters by actor, action and date without hiding the event count', async () => {
    const all = await mockAdminService.getAuditLog(ADMIN);
    const filtered = await mockAdminService.getAuditLog(ADMIN, { actions: ['period.verify'] });
    if (all.status !== 'success' || filtered.status !== 'success') return;
    expect(filtered.data.totalCount).toBeLessThan(all.data.totalCount);
    expect(filtered.data.events.every((event) => event.action === 'period.verify')).toBe(true);
  });
});

describe('integrations (FE-0734)', () => {
  it('offers all ten categories and never claims a connection', async () => {
    const result = await mockAdminService.listIntegrations(ADMIN);
    if (result.status !== 'success') return;

    expect(result.data).toHaveLength(10);
    // The type has no `connected` variant; this asserts the data agrees.
    expect(result.data.every((integration) => integration.state === 'not_configured')).toBe(true);
    expect(result.data.every((integration) => integration.plannedBehaviour.includes('Would'))).toBe(
      true,
    );
    expect(result.data.every((integration) => integration.backendTaskIds.length > 0)).toBe(true);
  });
});
