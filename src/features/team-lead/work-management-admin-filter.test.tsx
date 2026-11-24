import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TeamTaskView } from '@/contracts/team-lead';
import { toDurationView } from '@/lib/status';

const listTasks = vi.hoisted(() => vi.fn());

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({
    user: {
      userId: 'usr-admin',
      employeeId: 'emp-admin',
      primaryRole: 'super_admin',
      departmentLeadScopes: [],
    },
  }),
}));

vi.mock('@/components/feedback/toast', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('@/services/runtime/team-lead', () => ({
  teamLeadService: { listTasks },
}));

vi.mock('./task-review-queue', () => ({
  TaskReviewQueue: () => null,
}));

vi.mock('@/features/tasks/task-workflow', () => ({
  TaskWorkflowBoard: ({ tasks, scopeFilter, scopeFilterActive, onClearScopeFilter }: {
    tasks: readonly { id: string; title: string }[];
    scopeFilter?: React.ReactNode;
    scopeFilterActive?: boolean;
    onClearScopeFilter?: () => void;
  }) => (
    <>
      {scopeFilter}
      {scopeFilterActive && <button type="button" onClick={onClearScopeFilter}>Clear filters</button>}
      <ul aria-label="Filtered tasks">
        {tasks.map((task) => <li key={task.id}>{task.title}</li>)}
      </ul>
    </>
  ),
  TaskDetailTransitions: () => null,
  TaskHistoryTimeline: () => null,
}));

import { TeamTaskBoard } from './work-management';

function task(id: string, title: string, employeeId: string, employeeName: string): TeamTaskView {
  return {
    id,
    version: 1,
    title,
    projectId: 'prj-1',
    projectLabel: 'PRJ-1 · Portal rollout',
    division: { id: 'div-1', name: 'PowerInAI', code: 'PIA', isRestricted: false },
    assignee: {
      id: employeeId,
      fullName: employeeName,
      employeeCode: employeeId,
      avatarUrl: null,
      designation: null,
    },
    supportingMembers: [],
    status: 'pending',
    priority: 'medium',
    startDateLabel: null,
    startDate: null,
    dueDate: null,
    dueDateLabel: null,
    estimated: toDurationView(60),
    actual: toDurationView(0),
    variance: { minutes: -60, label: '−1:00' },
    isOverdue: false,
    review: {
      state: 'not_required',
      label: 'No review required',
      detail: 'This task does not require review.',
      blocksTimeEntry: false,
      reviewerName: null,
      reviewedAtLabel: null,
      note: null,
    },
    description: null,
    checklist: [],
    workHistory: [],
  };
}

describe('Super Administrator task employee filter', () => {
  it('filters the task board by the selected employee name and can clear the filter', async () => {
    listTasks.mockResolvedValue({
      status: 'success',
      data: [
        task('tsk-1', 'Prepare proposal', 'emp-2', 'Tanvir Ahmed'),
        task('tsk-2', 'Review requirements', 'emp-1', 'Nadia Rahman'),
      ],
    });
    const user = userEvent.setup();

    render(<TeamTaskBoard />);

    const filter = await screen.findByRole('combobox', { name: 'Filter tasks by employee name' });
    expect(screen.getByText('Prepare proposal')).toBeInTheDocument();
    expect(screen.getByText('Review requirements')).toBeInTheDocument();

    await user.selectOptions(filter, 'emp-1');
    expect(screen.queryByText('Prepare proposal')).not.toBeInTheDocument();
    expect(screen.getByText('Review requirements')).toBeInTheDocument();
    expect(filter).toHaveValue('emp-1');
    expect(screen.getAllByText('Nadia Rahman')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(screen.getByText('Prepare proposal')).toBeInTheDocument();
      expect(screen.getByText('Review requirements')).toBeInTheDocument();
    });
  });
});
