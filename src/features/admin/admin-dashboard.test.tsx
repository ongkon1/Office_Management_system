import { render, screen, within } from '@testing-library/react';
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
    },
  }),
}));

vi.mock('@/services/runtime/team-lead', () => ({
  teamLeadService: { listTasks },
}));

import { AdminDashboard } from './admin-dashboard';

function task(
  id: string,
  title: string,
  status: TeamTaskView['status'],
  dueDate: string | null,
  dueDateLabel: string | null,
  isOverdue = false,
): TeamTaskView {
  return {
    id,
    version: 1,
    title,
    projectId: 'prj-1',
    projectLabel: 'PRJ-1 · Portal rollout',
    division: { id: 'div-1', name: 'PowerInAI', code: 'PIA', isRestricted: false },
    assignee: {
      id: 'emp-1',
      fullName: 'Nadia Rahman',
      employeeCode: 'EMP-1001',
      avatarUrl: null,
      designation: 'Engineer',
    },
    supportingMembers: [],
    status,
    priority: isOverdue ? 'urgent' : 'medium',
    startDateLabel: null,
    startDate: null,
    dueDate,
    dueDateLabel,
    estimated: toDurationView(480),
    actual: toDurationView(120),
    variance: { minutes: -360, label: '−6:00' },
    isOverdue,
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

describe('Super Administrator dashboard', () => {
  it('replaces the phase placeholder with task totals and ordered deadline details', async () => {
    listTasks.mockResolvedValue({
      status: 'success',
      data: [
        task('tsk-1', 'Later pending task', 'pending', '2026-11-28', '28 Nov 2026'),
        task('tsk-2', 'Overdue task', 'in_progress', '2026-11-10', '10 Nov 2026', true),
        task('tsk-3', 'Nearest pending task', 'pending', '2026-11-20', '20 Nov 2026'),
        task('tsk-4', 'Completed task', 'completed', '2026-11-19', '19 Nov 2026'),
      ],
    });

    render(<AdminDashboard />);

    expect(await screen.findByRole('heading', { name: 'Administration dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/dashboard arrives in phase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();

    const pendingMetric = screen.getByText('Pending tasks').closest('a');
    expect(pendingMetric).not.toBeNull();
    expect(pendingMetric).toHaveTextContent('2');

    const deadlines = screen.getByRole('list', { name: 'Approaching task deadlines' });
    const rows = within(deadlines).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Overdue task');
    expect(rows[1]).toHaveTextContent('Nearest pending task');
    expect(rows[2]).toHaveTextContent('Later pending task');
    expect(within(rows[0]!).getByRole('link', { name: 'Overdue task' })).toHaveAttribute(
      'href',
      '/tasks/tsk-2',
    );
  });
});
