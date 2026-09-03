import { describe, expect, it } from 'vitest';
import type { EvaluationAreaKey } from '@/contracts/domain';
import { mockTeamLeadService } from './team-lead';

const IMRAN = 'usr-2001';

describe('mockTeamLeadService scope and calculations', () => {
  it('returns only employees assigned to the Team Lead', async () => {
    const result = await mockTeamLeadService.listMembers(IMRAN);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.map((item) => item.employee.id)).toEqual([
      'emp-1001',
      'emp-1002',
      'emp-1004',
    ]);
  });

  it('removes restricted government projects before aggregation', async () => {
    const result = await mockTeamLeadService.listProjects(IMRAN);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.some((item) => item.division.id === 'gov')).toBe(false);
    expect(result.data.find((item) => item.id === 'prj-vp2')?.budgetRestricted).toBe(true);
  });

  it('denies a timesheet outside assigned employee scope', async () => {
    const result = await mockTeamLeadService.getTimesheet(IMRAN, 'emp-1003', '2026-09-02');
    expect(result.status).toBe('permission_denied');
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
