import { describe, expect, it } from 'vitest';
import type { EvaluationAreaKey } from '@/contracts/domain';
import { mockTeamLeadService } from './team-lead';
import { mockTimesheetService } from './timesheet';
import { mockStore } from './store';
import { departmentLeadEmployeeIds } from './organization-hierarchy';
import { allMockNotifications, resetMockNotifications } from './notification-store';

const IMRAN = 'usr-2001';

describe('mockTeamLeadService scope and calculations', () => {
  it('keeps only the four daily calculation exception categories', async () => {
    const result = await mockTeamLeadService.getDashboard(IMRAN);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(Object.keys(result.data.exceptions)).toEqual(['missing', 'underTime', 'overtime', 'critical']);
  });

  it('returns only employees assigned to the Team Lead', async () => {
    const result = await mockTeamLeadService.listMembers(IMRAN);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.map((item) => item.employee.id)).toEqual(
      departmentLeadEmployeeIds('emp-2001'),
    );
  });

  it('removes restricted government projects before aggregation', async () => {
    const result = await mockTeamLeadService.listProjects(IMRAN);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.some((item) => item.division.id === 'gov')).toBe(false);
    expect(result.data.find((item) => item.id === 'prj-vp2')?.budgetRestricted).toBe(true);
  });

  it('creates a Team Lead self-task with no supporting members or self-notification', async () => {
    resetMockNotifications();
    const result = await mockTeamLeadService.saveTask(IMRAN, {
      title: 'Prepare department plan',
      projectId: 'prj-vp2',
      assigneeEmployeeId: 'emp-2001',
      supportingMemberIds: ['emp-1002'],
      startDate: '2026-09-02',
      dueDate: null,
      priority: 'medium',
      estimatedMinutes: 90,
      description: '',
      checklist: [],
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.assignee.id).toBe('emp-2001');
    expect(result.data.supportingMembers).toEqual([]);
    expect(result.data.review.state).toBe('not_required');
    expect(allMockNotifications().some((item) => item.recipientUserId === IMRAN && item.href === `/tasks/${result.data.id}`)).toBe(false);
  });

  it('denies a timesheet outside assigned employee scope', async () => {
    const result = await mockTeamLeadService.getTimesheet(IMRAN, 'emp-2002', '2026-09-02');
    expect(result.status).toBe('permission_denied');
  });

  it('links a correction request to one duration work log and rejects clock entries', async () => {
    const created = await mockTimesheetService.createWorkLog({
      employeeId: 'emp-1001',
      workDate: '2026-09-02',
      divisionId: 'pia',
      projectId: 'prj-vp2',
      taskId: 'tsk-1',
      durationMinutes: 30,
      workLocation: 'office',
      workDescription: 'Reviewed benchmark output.',
      completedWork: 'Recorded the confirmed findings.',
      supportingLink: null,
      attachmentIds: [],
      overtimeReason: null,
      criticalExplanation: null,
      source: 'manual',
      idempotencyKey: `team-correction-${Math.random()}`,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') return;

    const result = await mockTeamLeadService.addRemark({
      userId: IMRAN,
      employeeId: 'emp-1001',
      date: '2026-09-02',
      message: 'Please correct this duration.',
      requestedChanges: 'Confirm and update the actual minutes.',
      workLogId: created.data.id,
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(mockStore.findRemark(result.data.id)?.relatedRecord).toEqual({
        type: 'timesheet',
        workDate: '2026-09-02',
        workLogId: created.data.id,
      });
    }

    const historicalId = mockStore.entriesFor('emp-1001', '2026-07-27')[0]?.id;
    expect(historicalId).toBeTruthy();
    const rejected = await mockTeamLeadService.addRemark({
      userId: IMRAN,
      employeeId: 'emp-1001',
      date: '2026-07-27',
      message: 'Please correct this record.',
      requestedChanges: 'Change the time.',
      workLogId: historicalId,
    });
    expect(rejected.status).toBe('not_found');
  });

  it('calculates the weighted evaluation score in the service', async () => {
    const areas: readonly EvaluationAreaKey[] = [
      'task_completion',
      'work_quality',
      'timeliness',
      'teamwork_communication',
      'responsibility',
      'learning_initiative',
    ];
    const scores = Object.fromEntries(areas.map((area) => [area, 5])) as Record<EvaluationAreaKey, number>;
    const comments = Object.fromEntries(areas.map((area) => [area, 'Evidence reviewed.'])) as Record<EvaluationAreaKey, string>;
    const result = await mockTeamLeadService.saveEvaluation({
      userId: IMRAN,
      id: 'eval-emp-1001',
      scores,
      comments,
      summary: 'Ready for HR review.',
      submit: false,
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') expect(result.data.weightedScore).toBe(5);
  });
});
