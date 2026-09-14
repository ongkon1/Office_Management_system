import { describe, expect, it } from 'vitest';
import {
  TASK_TRANSITION_RULES,
  canTransition,
  transitionRequiresNote,
} from './task-transition';

describe('approved task transition map', () => {
  it('stores the four approved transitions as data', () => {
    expect(TASK_TRANSITION_RULES.map(({ from, to }) => `${from}:${to}`)).toEqual([
      'pending:in_progress',
      'in_progress:completed',
      'completed:in_progress',
      'pending:completed',
    ]);
  });

  it('allows employees to start, complete and reopen through the normal path', () => {
    expect(canTransition('pending', 'in_progress', 'employee')).toBe(true);
    expect(canTransition('in_progress', 'completed', 'employee')).toBe(true);
    expect(canTransition('completed', 'in_progress', 'employee')).toBe(true);
  });

  it('reserves direct Pending to Completed for Team Leads', () => {
    expect(canTransition('pending', 'completed', 'team_lead')).toBe(true);
    expect(canTransition('pending', 'completed', 'employee')).toBe(false);
    expect(canTransition('pending', 'completed', 'super_admin')).toBe(false);
  });

  it('requires notes only for reopen and direct completion', () => {
    expect(transitionRequiresNote('pending', 'in_progress')).toBe(false);
    expect(transitionRequiresNote('in_progress', 'completed')).toBe(false);
    expect(transitionRequiresNote('completed', 'in_progress')).toBe(true);
    expect(transitionRequiresNote('pending', 'completed')).toBe(true);
  });

  it('rejects self-transitions and reverse paths that were not approved', () => {
    expect(canTransition('pending', 'pending', 'employee')).toBe(false);
    expect(canTransition('in_progress', 'pending', 'team_lead')).toBe(false);
    expect(canTransition('completed', 'pending', 'team_lead')).toBe(false);
  });
});
