import { describe, expect, it } from 'vitest';
import type { TimeEntry, WorkPolicy } from '@/contracts/domain';
import type { WorkLog } from '@/contracts/work-log';
import { calculateDay } from './engine';

const actor = { userId: 'usr-1', displayName: 'Nadia Rahman' };
const stamp = '2026-09-02T09:00:00+06:00';
const policy: WorkPolicy = {
  id: 'policy', version: 3, name: 'Standard', effectiveFrom: '2026-01-01', effectiveTo: null,
  requiredActiveMinutes: 420, recognizedBreakMinutes: 60, requiredTotalMinutes: 480,
  overtimeThresholdMinutes: 480, criticalThresholdMinutes: 720, workingWeekdays: [1, 2, 3, 4, 5],
  businessTimezone: 'Asia/Dhaka', createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor,
};

function log(id: string, divisionId: string, durationMinutes: number): WorkLog {
  return {
    id, employeeId: 'employee', workDate: '2026-09-02', divisionId,
    projectId: `project-${divisionId}`, taskId: `task-${divisionId}`, durationMinutes,
    workLocation: 'office', workDescription: 'Work', completedWork: 'Done', supportingLink: null,
    attachmentIds: [], overtimeReason: null, criticalExplanation: null, source: 'manual',
    idempotencyKey: `key-${id}`, state: 'saved', policyVersion: 3,
    createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor,
  };
}

function day(workLogs: readonly WorkLog[], extra: Record<string, unknown> = {}) {
  return calculateDay({ employeeId: 'employee', workDate: '2026-09-02', policy, workLogs, ...extra });
}

describe('work logs preserve the calculation acceptance boundaries', () => {
  it('AC-CALC-001 aggregates 7:00 across three divisions plus one break', () => {
    const result = day([log('1', 'pia', 180), log('2', 'gov', 120), log('3', 'wcf', 120)]);
    expect(result.activeMinutes).toBe(420);
    expect(result.breakMinutes).toBe(60);
    expect(result.totalMinutes).toBe(480);
    expect(result.status).toBe('complete');
    expect(result.divisionContributions).toHaveLength(3);
  });

  it.each([
    [419, 'under_time'],
    [420, 'complete'],
    [421, 'overtime'],
    [660, 'overtime'],
    [661, 'critical'],
  ] as const)('classifies %i active minutes as %s', (minutes, status) => {
    expect(day([log('one', 'pia', minutes)]).status).toBe(status);
  });

  it('AC-CALC-006 keeps leave and holidays out of Missing', () => {
    expect(day([], { leave: { portion: 'full_day', leaveType: 'annual' } }).status).not.toBe('missing');
    expect(day([], { holidayName: 'National Day' }).status).not.toBe('missing');
  });

  it('AC-CALC-007 proportionally adjusts half-day requirements', () => {
    const result = day([log('half', 'pia', 210)], { leave: { portion: 'half_day', leaveType: 'sick' } });
    expect(result.requiredActiveMinutes).toBe(210);
    expect(result.requiredTotalMinutes).toBe(240);
    expect(result.totalMinutes).toBe(240);
    expect(result.status).toBe('complete');
  });

  it('combines work logs with preserved historical rows without changing their minutes', () => {
    const historical: TimeEntry = {
      id: 'history', employeeId: 'employee', workDate: '2026-09-02', divisionId: 'pia',
      projectId: 'project-pia', taskId: 'task-pia', entryMethod: 'manual_clock', workLocation: 'office',
      startTime: '2026-09-02T09:00:00+06:00', endTime: '2026-09-02T11:00:00+06:00',
      activeMinutes: 120, workDescription: 'Historical', completedWork: 'Done', supportingLink: null,
      attachmentIds: [], state: 'saved', crossMidnightGroupId: null, policyVersion: 2,
      createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor,
    };
    const result = calculateDay({ employeeId: 'employee', workDate: '2026-09-02', policy, historicalEntries: [historical], workLogs: [log('new', 'wcf', 300)] });
    expect(result.activeMinutes).toBe(420);
    expect(result.status).toBe('complete');
    expect(result.entryIds).toEqual(['history', 'new']);
  });
});
