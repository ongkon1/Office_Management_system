import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TeamMemberView, TeamTaskView } from '@/contracts/team-lead';
import { toDayStatusView, toDurationView } from '@/lib/status';

const listTasks = vi.hoisted(() => vi.fn());
const listMembers = vi.hoisted(() => vi.fn());

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({
    user: {
      userId: 'usr-lead', employeeId: 'emp-lead', displayName: 'Team Lead', primaryRole: 'team_lead',
      departmentLeadScopes: [],
    },
  }),
}));
vi.mock('@/components/feedback/toast', () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock('@/services/runtime/team-lead', () => ({ teamLeadService: { listTasks, listMembers } }));
vi.mock('./task-review-queue', () => ({ TaskReviewQueue: () => null }));
vi.mock('@/features/tasks/task-workflow', () => ({
  TaskWorkflowBoard: ({ tasks, scopeFilter }: { tasks: readonly { id: string; title: string }[]; scopeFilter?: React.ReactNode }) => (
    <>{scopeFilter}<ul aria-label="Visible tasks">{tasks.map((task) => <li key={task.id}>{task.title}</li>)}</ul></>
  ),
  TaskDetailTransitions: () => null,
  TaskHistoryTimeline: () => null,
}));

import { TeamTaskBoard } from './work-management';

function task(id: string, title: string, employeeId: string, employeeName: string): TeamTaskView {
  return {
    id, version: 1, title, projectId: 'prj-1', projectLabel: 'Project',
    division: { id: 'div-1', name: 'PowerInAI', code: 'PIA', isRestricted: false },
    assignee: { id: employeeId, fullName: employeeName, employeeCode: employeeId, avatarUrl: null, designation: null },
    supportingMembers: [], status: 'pending', priority: 'medium', startDateLabel: null, startDate: null,
    dueDate: null, dueDateLabel: null, estimated: toDurationView(60), actual: toDurationView(0),
    variance: { minutes: -60, label: '−1:00' }, isOverdue: false,
    review: { state: 'not_required', label: 'Assigned', detail: 'Assigned task.', blocksTimeEntry: false, reviewerName: null, reviewedAtLabel: null, note: null },
    description: null, checklist: [], workHistory: [],
  };
}

const teammate: TeamMemberView = {
  employee: { id: 'emp-member', fullName: 'Nadia Rahman', employeeCode: 'EMP-1001', avatarUrl: null, designation: null },
  divisions: [], departments: [], attendanceLabel: 'Office', active: toDurationView(0),
  status: toDayStatusView('missing'), openRemarkCount: 0,
};

describe('Team Lead task owner filter', () => {
  it('shows only the lead by default and supports selecting multiple team members', async () => {
    listTasks.mockResolvedValue({
      status: 'success',
      data: [
        task('task-own', 'Prepare my report', 'emp-lead', 'Team Lead'),
        task('task-member', 'Review customer notes', 'emp-member', 'Nadia Rahman'),
      ],
    });
    listMembers.mockResolvedValue({ status: 'success', data: [teammate] });
    const user = userEvent.setup();

    render(<TeamTaskBoard />);

    const selector = await screen.findByRole('button', { name: /Team member.*My tasks/i });
    expect(screen.getByText('Prepare my report')).toBeInTheDocument();
    expect(screen.queryByText('Review customer notes')).not.toBeInTheDocument();

    await user.click(selector);
    const mine = screen.getByRole('checkbox', { name: 'My tasks' });
    const teammateOption = screen.getByRole('checkbox', { name: 'Nadia Rahman' });
    expect(mine).toHaveAttribute('aria-checked', 'true');
    await user.click(teammateOption);
    expect(screen.getByText('Prepare my report')).toBeInTheDocument();
    expect(screen.getByText('Review customer notes')).toBeInTheDocument();

    await user.click(mine);
    expect(screen.queryByText('Prepare my report')).not.toBeInTheDocument();
    expect(screen.getByText('Review customer notes')).toBeInTheDocument();
  });
});
