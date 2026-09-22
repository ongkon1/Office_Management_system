import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetMeetingMinutesState,
  setMeetingMinutesListFault,
} from '@/services/mock/meeting-minutes';
import { ToastProvider } from '@/components/feedback/toast';
import { MeetingMinutesList } from './meeting-minutes-list';

/**
 * `FE-1112` — every state of the Meeting Minutes list, rendered.
 *
 * Failures are forced through the mock adapter's fault switch; nothing else in
 * the seed data fails.
 */

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: '',
  userId: 'usr-3001',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/meeting-minutes',
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: nav.userId } }),
}));

const HR = 'usr-3001';
const NO_MINUTES = 'usr-1002'; // one division, no project linked to a client

/** Words that would mean a failure state leaked list data. */
const LEAKS = /Meghna|Westbridge|Bengal|Ministry|sprint review|\d+ meeting minutes?\b/i;

beforeEach(() => {
  resetMeetingMinutesState();
  nav.replace.mockReset();
  nav.search = '';
  nav.userId = HR;
});

describe('Meeting Minutes list states (FE-1112)', () => {
  it('announces loading, then shows the populated list with a result count', async () => {
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading meeting minutes');

    expect((await screen.findAllByText('Westbridge portal go-live readiness')).length).toBeGreaterThan(0);
    expect(screen.getByText('6 meeting minutes')).toBeInTheDocument();
  });

  it('shows the empty state, with no options, when nothing is readable', async () => {
    nav.userId = NO_MINUTES;
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    expect(await screen.findByText('No meeting minutes yet')).toBeInTheDocument();
    expect(screen.queryByText('No meeting minutes match')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Client:/ }));
    expect(within(screen.getByRole('dialog', { name: 'Client filter' })).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('distinguishes no results from empty, and clears from there', async () => {
    nav.search = 'q=zzzz';
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    expect(await screen.findByText('No meeting minutes match')).toBeInTheDocument();
    expect(screen.queryByText('No meeting minutes yet')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/meeting-minutes', { scroll: false });
  });

  it('shows denied without any count, option, name or control', async () => {
    setMeetingMinutesListFault('denied');
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You don’t have access to meeting minutes');
    expect(document.body.textContent).not.toMatch(LEAKS);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Client:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add meeting minute' })).not.toBeInTheDocument();
  });

  it('shows signed-out with a sign-in link that returns to the same filtered list', async () => {
    setMeetingMinutesListFault('signed-out');
    nav.search = 'client=cli-bit&q=boot';
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    expect(await screen.findByText('Sign in to see meeting minutes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/login?returnTo=${encodeURIComponent('/meeting-minutes?client=cli-bit&q=boot')}`,
    );
    expect(document.body.textContent).not.toMatch(LEAKS);
  });

  it('recovers from a temporary error with Try again, showing only the safe reference', async () => {
    setMeetingMinutesListFault('error-once');
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Meeting minutes couldn’t be loaded');
    expect(alert).toHaveTextContent('Reference: MM-DEMO-503');
    expect(alert).not.toHaveTextContent('temporarily unavailable'); // the service's own text stays out
    expect(document.body.textContent).not.toMatch(LEAKS);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await screen.findAllByText('Westbridge portal go-live readiness')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers no retry for an error a retry cannot fix', async () => {
    setMeetingMinutesListFault('fatal');
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Reference: MM-DEMO-500');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('resets rejected list settings', async () => {
    setMeetingMinutesListFault('invalid');
    render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    expect(await screen.findByText('This list link isn’t valid')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset the list' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/meeting-minutes', { scroll: false });
  });

  it('keeps the viewer’s own filters usable when a later request fails', async () => {
    const { rerender } = render(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    expect(await screen.findByText('6 meeting minutes')).toBeInTheDocument();

    setMeetingMinutesListFault('error');
    nav.search = 'processing=failed';
    await act(async () => {
      rerender(<ToastProvider><MeetingMinutesList /></ToastProvider>);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Meeting minutes couldn’t be loaded');
    expect(screen.getByRole('searchbox', { name: 'Search meeting minutes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Client:/ })).toBeInTheDocument();
    // No stale rows and no stale count while the current request has failed.
    expect(screen.queryByText('4 meeting minutes')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Westbridge portal go-live readiness')).toHaveLength(0);
  });
});
