import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import {
  mockMeetingMinutesService,
  resetMeetingMinutesState,
  setMeetingMinutesWorkerOutcome,
  setMeetingMinutesWorkerTiming,
} from '@/services/mock/meeting-minutes';
import { MeetingMinuteDetail } from './meeting-minute-detail';
import { MeetingMinutesList } from './meeting-minutes-list';
import { setProcessingPollIntervalForTests } from './use-processing-watch';

/**
 * `FE-1126` — a background run finishing or failing, seen from the detail
 * page and from the list, without losing the reader's place.
 *
 * jsdom cannot scroll, so "keeps scroll context" is tested for what it rests
 * on: the page and the list rows are never unmounted by the refresh. A
 * skeleton swapped in and out is exactly what would throw a reader back to the
 * top, and a MutationObserver sees it if it happens.
 */

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: '',
  userId: 'usr-2001',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => '/meeting-minutes',
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: nav.userId } }),
}));

const TEAM_LEAD = 'usr-2001';

async function saveWithAi(title: string): Promise<string> {
  const result = await mockMeetingMinutesService.create(TEAM_LEAD, {
    title,
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    content: 'The team agreed to ship the redesign. The backlog is next.',
    processWithAi: true,
    idempotencyKey: `key-${title}`,
  });
  if (result.status !== 'success') throw new Error('expected success');
  return result.data.minute.id;
}

/** Records whether any node matching `selector` is ever removed. */
function watchRemovals(selector: string) {
  let removed = false;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (
          node instanceof Element &&
          (node.matches(selector) || node.querySelector(selector) !== null)
        ) {
          removed = true;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return {
    removed: () => removed,
    stop: () => observer.disconnect(),
  };
}

function announcer(): HTMLElement {
  const live = screen
    .getAllByRole('status')
    .find((region) => region.getAttribute('aria-atomic') === 'true');
  if (!live) throw new Error('no processing announcer');
  return live;
}

beforeEach(() => {
  resetMeetingMinutesState();
  nav.replace.mockReset();
  nav.search = '';
  nav.userId = TEAM_LEAD;
  /*
   * Well behind a first page load (~300 ms here, more under a parallel run),
   * so the page is certain to arrive while the run is still Pending. A page
   * that first loads after the run moved on sees that state as first sight
   * and rightly announces nothing, which is not what these cases test.
   */
  setMeetingMinutesWorkerTiming({ startAfterMs: 1500, finishAfterMs: 3000 });
  setProcessingPollIntervalForTests(60);
});

afterEach(() => {
  setProcessingPollIntervalForTests(null);
  setMeetingMinutesWorkerTiming(null);
  setMeetingMinutesWorkerOutcome(null);
  resetMeetingMinutesState();
});

describe('the detail page while a run is in flight (FE-1126)', () => {
  it('follows the run to Processed, announcing each move once, without unmounting the page', async () => {
    const id = await saveWithAi('Live retro');
    render(
      <ToastProvider>
        <MeetingMinuteDetail minuteId={id} />
      </ToastProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Live retro' });
    expect(announcer()).toHaveTextContent('');
    const removals = watchRemovals('h1');

    await waitFor(() => expect(announcer()).toHaveTextContent('Task generation has started.'), {
      timeout: 5000,
    });
    await waitFor(() => expect(announcer()).toHaveTextContent('Task generation has finished.'), {
      timeout: 5000,
    });

    // The visible notice, and the page now showing the finished run.
    expect(await screen.findByText('Task generation finished')).toBeInTheDocument();
    expect(await screen.findByText('The team agreed to ship the redesign.')).toBeInTheDocument();
    expect(screen.getByText(/Task generation finished and found no tasks to create/)).toBeInTheDocument();

    // The toast is visual only here: the announcer already spoke.
    const toast = screen.getByText('Task generation finished').closest('div[class*="shadow-lg"]');
    expect(toast).not.toHaveAttribute('role');

    removals.stop();
    expect(removals.removed()).toBe(false);
  });

  it('shows a failure with its retry as soon as the run fails', async () => {
    setMeetingMinutesWorkerOutcome('fail');
    const id = await saveWithAi('Live retro that fails');
    render(
      <ToastProvider>
        <MeetingMinuteDetail minuteId={id} />
      </ToastProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Live retro that fails' });

    const failure = await screen.findByRole('region', { name: 'Task generation failed' }, { timeout: 6000 });
    expect(within(failure).getByRole('button', { name: 'Retry task generation' })).toBeInTheDocument();
    expect(announcer()).toHaveTextContent('Task generation failed. Your meeting minute is saved.');
    // One visible notice for one failure: the watch reports a change once.
    expect(screen.getAllByText('Task generation failed', { selector: 'p' })).toHaveLength(1);
  });

  it('makes no requests for a minute whose run has settled', async () => {
    const snapshot = vi.spyOn(mockMeetingMinutesService, 'getProcessingSnapshot');
    render(
      <ToastProvider>
        <MeetingMinuteDetail minuteId="min-1001" />
      </ToastProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'Vision Platform v2 sprint review' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(snapshot).not.toHaveBeenCalled();
    snapshot.mockRestore();
  });
});

describe('the list while a run is in flight (FE-1126)', () => {
  it('updates the row, keeps the filters, keeps the rows mounted, and says the run finished', async () => {
    await saveWithAi('Live retro on the list');
    nav.search = 'client=cli-meghna';
    render(
      <ToastProvider>
        <MeetingMinutesList />
      </ToastProvider>,
    );

    const title = (await screen.findAllByText('Live retro on the list'))[0];
    const row = title.closest('tr, li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Pending')).toBeInTheDocument();
    const removals = watchRemovals('tr');

    // On the list, the notice is the one voice, so it announces.
    const notice = await screen.findByText('Task generation finished', undefined, { timeout: 6000 });
    expect(notice.closest('[role="status"]')).not.toBeNull();

    await waitFor(() =>
      expect(within(row as HTMLElement).getByText('Processed')).toBeInTheDocument(),
    );
    // The same row element, updated in place.
    expect(row?.isConnected).toBe(true);

    // The filters were never rewritten by the refresh.
    for (const [href] of nav.replace.mock.calls) {
      expect(String(href)).toContain('client=cli-meghna');
    }
    removals.stop();
    expect(removals.removed()).toBe(false);
  });

  it('polls nothing when no row on the page is in flight', async () => {
    const snapshot = vi.spyOn(mockMeetingMinutesService, 'getProcessingSnapshot');
    nav.search = 'processing=processed';
    render(
      <ToastProvider>
        <MeetingMinutesList />
      </ToastProvider>,
    );
    await screen.findAllByText('Vision Platform v2 sprint review');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(snapshot).not.toHaveBeenCalled();
    snapshot.mockRestore();
  });
});
