import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import type { GeneratedTaskView, MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import {
  mockMeetingMinutesService,
  resetMeetingMinutesState,
} from '@/services/mock/meeting-minutes';
import { GeneratedTasks } from './generated-tasks';
import { ProcessingFailure } from './processing-failure';
import { TaskSourceMinute } from './task-source-minute';

/**
 * `FE-1123` generated tasks, `FE-1124` traceability, `FE-1125` failure and
 * retry — each section as a component, driven by real service answers.
 */

const nav = vi.hoisted(() => ({ userId: 'usr-2001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/meeting-minutes/min-1001',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: nav.userId } }),
}));

const TEAM_LEAD = 'usr-2001';
const EMPLOYEE = 'usr-1001';
const TANVIR = 'usr-1002';
const HR = 'usr-3001';
const ADMIN = 'usr-9001';

async function detailOf(userId: string, minuteId: string): Promise<MeetingMinuteDetailView> {
  const result = await mockMeetingMinutesService.get(userId, minuteId);
  if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
  return result.data;
}

/** No word here may read as AI granting or deciding access (`FE-1124`). */
const AUTHORITY_WORDS = /approved by ai|authori[sz]ed by ai|ai (granted|decided|approved)|permission/i;

beforeEach(() => {
  resetMeetingMinutesState();
  nav.userId = TEAM_LEAD;
});

describe('Tasks created from this meeting (FE-1123)', () => {
  it('lists each task with its assignee, priority, due date, status, match and an Open task link', async () => {
    render(<GeneratedTasks minute={await detailOf(TEAM_LEAD, 'min-1001')} />);

    const section = screen.getByRole('region', { name: 'Tasks created from this meeting' });
    const table = within(section).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(first).toHaveTextContent('Add export to PDF to the search results');
    expect(first).toHaveTextContent('Nadia Rahman');
    expect(first).toHaveTextContent('High');
    expect(first).toHaveTextContent('Pending');
    expect(first).toHaveTextContent('Named in the minute');
    // `\s?`: jsdom's name algorithm drops the space inside the hidden span that
    // a browser keeps ("Open task Add export…"); the browser probe checks the
    // real name.
    expect(within(first).getByRole('link', { name: /^Open task\s?Add export to PDF/ })).toHaveAttribute(
      'href',
      '/tasks/tsk-15',
    );
    expect(rows[1]).toHaveTextContent('Matched on project membership and workload');
  });

  it('writes Unassigned, never a blank, and notes a later reassignment', async () => {
    const minute = await detailOf(TEAM_LEAD, 'min-1001');
    const [first, second] = minute.generatedTasks as Extract<GeneratedTaskView, { access: 'visible' }>[];
    render(
      <GeneratedTasks
        minute={{
          ...minute,
          generatedTasks: [
            { ...first, assigneeName: null, matchOutcome: { kind: 'unassigned', label: 'No eligible team member, so left unassigned' } },
            { ...second, reassignedSinceGeneration: true },
          ],
        }}
      />,
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Unassigned');
    expect(rows[0]).toHaveTextContent('No eligible team member, so left unassigned');
    expect(rows[1]).toHaveTextContent('Reassigned since it was created');
  });

  it('counts, but does not name, tasks the viewer cannot open', async () => {
    render(<GeneratedTasks minute={await detailOf(EMPLOYEE, 'min-1001')} />);
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(1);
    expect(
      screen.getByText('One task created from this meeting is not shown, because you do not have access to it.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Confirm the October release date|Tanvir/);
  });

  it('shows no table at all when every task is out of reach', async () => {
    render(<GeneratedTasks minute={await detailOf(ADMIN, 'min-1001')} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/2 tasks created from this meeting are not shown/)).toBeInTheDocument();
  });

  it.each([
    ['min-1002', HR, 'AI was not asked to read this minute'],
    ['min-1005', ADMIN, 'Tasks will appear here once task generation finishes'],
    ['min-1004', HR, 'Task generation did not finish'],
  ])('%s says why there are none', async (minuteId, userId, expected) => {
    render(<GeneratedTasks minute={await detailOf(userId, minuteId)} />);
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
  });

  it('describes origin and matching without implying AI decided access (FE-1124)', async () => {
    render(<GeneratedTasks minute={await detailOf(TEAM_LEAD, 'min-1001')} />);
    const section = screen.getByRole('region', { name: 'Tasks created from this meeting' });
    expect(section).toHaveTextContent('Proposed by task generation and assigned by matching');
    expect(section).toHaveTextContent('follows its project and assignment, like any other task');
    expect(section.textContent).not.toMatch(AUTHORITY_WORDS);
  });
});

describe('Source minute on a task page (FE-1124)', () => {
  it('links the minute for a viewer who can read it', async () => {
    render(<TaskSourceMinute taskId="tsk-15" />);
    const link = await screen.findByRole('link', { name: 'Vision Platform v2 sprint review' });
    expect(link).toHaveAttribute('href', '/meeting-minutes/min-1001');
    expect(screen.getByText('AI-generated')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(AUTHORITY_WORDS);
  });

  it('names nothing about a minute the viewer cannot read', async () => {
    nav.userId = TANVIR;
    render(<TaskSourceMinute taskId="tsk-16" />);
    expect(
      await screen.findByText(/Created by task generation from a meeting minute you do not have access to/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Vision Platform|Meghna|sprint/);
  });

  it('renders nothing at all for an ordinary task', async () => {
    nav.userId = EMPLOYEE;
    const get = vi.spyOn(mockMeetingMinutesService, 'getTaskSourceMinute');
    const { container } = render(<TaskSourceMinute taskId="tsk-1" />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(container).toBeEmptyDOMElement();
    get.mockRestore();
  });
});

describe('A failed run and its retry (FE-1125)', () => {
  function renderFailure(minute: MeetingMinuteDetailView, onChanged = vi.fn()) {
    render(
      <ToastProvider>
        <ProcessingFailure minute={minute} userId={nav.userId} onChanged={onChanged} />
      </ToastProvider>,
    );
    return onChanged;
  }

  afterEach(() => vi.restoreAllMocks());

  it('says what went wrong safely, and that the minute is saved', async () => {
    nav.userId = HR;
    renderFailure(await detailOf(HR, 'min-1004'));
    const section = screen.getByRole('region', { name: 'Task generation failed' });
    expect(section).toHaveTextContent('The AI service took too long to respond. Your meeting minute was saved.');
    expect(section).toHaveTextContent('The minute below is saved and unchanged.');
    expect(section.textContent).not.toMatch(/provider_timeout|stack|model/i);
  });

  it('retries, shows it is working, and reloads the minute', async () => {
    nav.userId = HR;
    const onChanged = renderFailure(await detailOf(HR, 'min-1004'));
    await userEvent.click(screen.getByRole('button', { name: 'Retry task generation' }));

    expect(await screen.findByRole('button', { name: /Retrying task generation/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Task generation queued again')).toBeInTheDocument();
    expect((await detailOf(HR, 'min-1004')).processing.status).toBe('pending');
  });

  it('sends one request for a double click', async () => {
    nav.userId = HR;
    const retry = vi.spyOn(mockMeetingMinutesService, 'retryProcessing');
    renderFailure(await detailOf(HR, 'min-1004'));
    const button = screen.getByRole('button', { name: 'Retry task generation' });
    await userEvent.dblClick(button);
    await waitFor(() => expect(retry).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps one idempotency key across a retry of the retry', async () => {
    nav.userId = HR;
    const retry = vi
      .spyOn(mockMeetingMinutesService, 'retryProcessing')
      .mockResolvedValueOnce({
        status: 'error',
        code: 'DEPENDENCY_FAILED',
        message: 'The request did not complete.',
        reference: 'MM-TEST',
        retryable: true,
      });
    renderFailure(await detailOf(HR, 'min-1004'));
    await userEvent.click(screen.getByRole('button', { name: 'Retry task generation' }));
    await screen.findByText('The request did not complete.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry task generation' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    // Let the second, real request finish inside this test: left in flight, it
    // would land after the next test's reset and change that test's minute.
    await screen.findByText('Task generation queued again');

    const keys = retry.mock.calls.map(([, input]) => input.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it('explains a conflict and offers a reload', async () => {
    nav.userId = HR;
    const stale = await detailOf(HR, 'min-1004');
    // Someone else retries first.
    await mockMeetingMinutesService.retryProcessing(HR, {
      minuteId: 'min-1004',
      failedAttemptId: 'att-1004-1',
      idempotencyKey: 'key-elsewhere',
    });
    const onChanged = renderFailure(stale);
    await userEvent.click(screen.getByRole('button', { name: 'Retry task generation' }));

    expect(await screen.findByText(/not in a failed state/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload the minute' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it.each([
    ['a viewer who may not retry', ADMIN, false, false, "Only the minute's creator or a Super Administrator"],
    ['a failure a retry cannot fix', HR, true, false, 'Retrying would not fix this failure'],
    ['an archived minute', HR, false, true, 'This minute is archived'],
  ])('explains why %s gets no retry', async (_label, userId, unretryable, archived, expected) => {
    nav.userId = HR;
    const minute = await detailOf(HR, 'min-1004');
    renderFailure({
      ...minute,
      actions: { ...minute.actions, canRetry: false },
      processing: {
        ...minute.processing,
        error: minute.processing.error && { ...minute.processing.error, retryable: !unretryable },
      },
      archived: archived ? { archivedAtLabel: '2 Sep 2026', archivedByName: 'Rezaul Haque' } : null,
    });
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    void userId;
  });

  it('renders nothing unless the run failed', async () => {
    const { container } = render(
      <ToastProvider>
        <ProcessingFailure minute={await detailOf(TEAM_LEAD, 'min-1001')} userId={TEAM_LEAD} onChanged={vi.fn()} />
      </ToastProvider>,
    );
    expect(container.querySelector('section')).toBeNull();
  });
});
