import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import { resetMeetingMinutesState } from '@/services/mock/meeting-minutes';
import { MeetingMinuteDetail } from './meeting-minute-detail';
import { MeetingMinutesList } from './meeting-minutes-list';

/**
 * `FE-1131` — what each role is *offered* on screen. The service refuses the
 * same writes (`meeting-minutes-access.test.ts`); this checks the controls are
 * not there to begin with, and that the ones a creator needs are.
 *
 * `FE-1130` — the unassigned and duplicate cases as a reader sees them.
 */

const nav = vi.hoisted(() => ({ userId: 'usr-1001', search: '' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/meeting-minutes',
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: nav.userId } }),
}));

const EMPLOYEE = 'usr-1001';
const TEAM_LEAD = 'usr-2001';
const HR = 'usr-3001';
const MANAGEMENT = 'usr-5001';

/** Any control that would change a minute or start AI. */
const WRITE_CONTROL =
  /^(Edit|Add meeting minute|Archive this minute|Retry task generation|Start task generation|Save changes)$/;

function renderDetail(minuteId: string) {
  return render(
    <ToastProvider>
      <MeetingMinuteDetail minuteId={minuteId} />
    </ToastProvider>,
  );
}

function writeControls(): readonly HTMLElement[] {
  return [...screen.queryAllByRole('link'), ...screen.queryAllByRole('button')].filter((element) =>
    WRITE_CONTROL.test((element.textContent ?? '').trim()),
  );
}

beforeEach(() => {
  resetMeetingMinutesState();
  nav.search = '';
});

describe('read-only roles are offered no write controls (FE-1131)', () => {
  it.each([
    ['an Employee', EMPLOYEE, 'min-1004'], // failed: would otherwise offer Retry
    ['Management/View-Only', MANAGEMENT, 'min-1004'],
    ['Management/View-Only', MANAGEMENT, 'min-1002'], // not processed: would offer Start
    ['an Employee', EMPLOYEE, 'min-1001'], // processed, with tasks
  ])('%s on %s', async (_label, userId, minuteId) => {
    nav.userId = userId;
    renderDetail(minuteId);
    await screen.findByRole('heading', { level: 1, name: /./ });
    await waitFor(() => expect(screen.queryByText('Loading the meeting minute.')).toBeNull());
    expect(writeControls()).toEqual([]);
  });

  it.each([
    ['an Employee', EMPLOYEE],
    ['Management/View-Only', MANAGEMENT],
  ])('%s gets no Add or Edit on the list', async (_label, userId) => {
    nav.userId = userId;
    render(
      <ToastProvider>
        <MeetingMinutesList />
      </ToastProvider>,
    );
    await screen.findAllByText('Vision Platform v2 sprint review');
    expect(screen.queryByRole('link', { name: 'Add meeting minute' })).toBeNull();
    expect(screen.queryAllByRole('link', { name: /^Edit/ })).toEqual([]);
  });
});

describe('a creator is offered what they need (FE-1131, FE-1132)', () => {
  it('starts task generation for their own Not Processed minute', async () => {
    nav.userId = HR; // Rezaul created min-1002
    renderDetail('min-1002');
    const start = await screen.findByRole('button', { name: 'Start task generation' });

    await userEvent.dblClick(start);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .find((region) => region.getAttribute('aria-atomic') === 'true'),
      ).toHaveTextContent('Task generation is queued.'),
    );
    expect(await screen.findByText('Task generation queued')).toBeInTheDocument();
    // Pending now, so the control is gone rather than offered twice.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Start task generation' })).toBeNull());
  });

  it('is not offered Start on someone else’s minute', async () => {
    nav.userId = TEAM_LEAD; // min-1002 is Rezaul's
    renderDetail('min-1002');
    await screen.findByRole('heading', { level: 1, name: 'Bootcamp curriculum sign-off' });
    expect(screen.queryByRole('button', { name: 'Start task generation' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
  });
});

describe('the unassigned and duplicate cases on the page (FE-1130)', () => {
  it('shows two unassigned tasks, says why, and says a duplicate was dropped', async () => {
    nav.userId = TEAM_LEAD;
    renderDetail('min-1008');
    const section = await screen.findByRole('region', { name: 'Tasks created from this meeting' });
    const rows = within(within(section).getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent('Unassigned');
    expect(rows[0]).toHaveTextContent('No eligible team member, so left unassigned');
    expect(rows[1]).toHaveTextContent('Unassigned');
    expect(rows[1]).toHaveTextContent('Named person not eligible, so left unassigned');
    expect(rows[2]).toHaveTextContent('Sadia Karim');
    expect(
      within(section).getByText('One more proposed task repeated one already created, so it was not added again.'),
    ).toBeInTheDocument();
    // The ineligible person is not named, even though the minute names him.
    expect(section.textContent).not.toContain('Jamal');
  });

  it('says a finished run found nothing to create', async () => {
    nav.userId = HR;
    renderDetail('min-1007');
    const section = await screen.findByRole('region', { name: 'Tasks created from this meeting' });
    expect(within(section).getByText('Task generation finished and found no tasks to create.')).toBeInTheDocument();
  });
});
