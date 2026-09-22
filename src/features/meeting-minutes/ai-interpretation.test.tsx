import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import type { MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import {
  mockMeetingMinutesService,
  resetMeetingMinutesState,
} from '@/services/mock/meeting-minutes';
import { AiInterpretation } from './ai-interpretation';
import { MeetingMinuteDetail } from './meeting-minute-detail';

/**
 * `FE-1122` — the AI's reading of a minute, apart from the minute.
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
const ADMIN = 'usr-9001';
const HR = 'usr-3001';

async function detailOf(userId: string, minuteId: string): Promise<MeetingMinuteDetailView> {
  const result = await mockMeetingMinutesService.get(userId, minuteId);
  if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
  return result.data;
}

beforeEach(() => {
  resetMeetingMinutesState();
  nav.userId = TEAM_LEAD;
});

describe('AI interpretation (FE-1122)', () => {
  it('is its own labelled section, marked as AI-generated in words', async () => {
    render(<AiInterpretation minute={await detailOf(TEAM_LEAD, 'min-1001')} />);

    const section = screen.getByRole('region', { name: 'AI summary and decisions' });
    expect(within(section).getByText('AI-generated')).toBeInTheDocument();
    expect(within(section).getByText(/It is not part of the minute/)).toBeInTheDocument();
  });

  it('shows the summary and the decisions in order', async () => {
    render(<AiInterpretation minute={await detailOf(TEAM_LEAD, 'min-1001')} />);

    expect(screen.getByText(/accepted the search redesign delivered in sprint 14/)).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Accept the search redesign as delivered in sprint 14.',
      'Add export to PDF to the October release scope.',
    ]);
  });

  it('renders model output as text, never as markup', async () => {
    const minute = await detailOf(TEAM_LEAD, 'min-1001');
    const hostile: MeetingMinuteDetailView = {
      ...minute,
      interpretation: {
        summary: '<img src=x onerror="alert(1)">Summary',
        decisions: [{ id: 'd', position: 1, text: '<script>steal()</script>Decide' }],
        basedOnEarlierContent: false,
      },
    };
    const { container } = render(<AiInterpretation minute={hostile} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    // Escaped, and so visible as the literal characters it was sent as.
    expect(screen.getByText('<img src=x onerror="alert(1)">Summary')).toBeInTheDocument();
  });

  it.each([
    ['not processed', 'min-1002', HR, 'AI was not asked to read this minute'],
    ['pending', 'min-1003', ADMIN, 'will appear here once task generation finishes'],
    ['processing', 'min-1005', ADMIN, 'will appear here once task generation finishes'],
    ['failed', 'min-1004', HR, 'Task generation did not finish'],
  ])('says why there is none while %s', async (_label, minuteId, userId, expected) => {
    render(<AiInterpretation minute={await detailOf(userId, minuteId)} />);
    expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('warns, above the summary, when the minute was edited since the run', async () => {
    const minute = await detailOf(TEAM_LEAD, 'min-1001');
    render(
      <AiInterpretation
        minute={{
          ...minute,
          interpretation: minute.interpretation && {
            ...minute.interpretation,
            basedOnEarlierContent: true,
          },
        }}
      />,
    );

    const warning = screen.getByText(/has been edited since this was generated/);
    const summary = screen.getByText(/accepted the search redesign/);
    // Read first: the warning precedes the summary in document order.
    expect(warning.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says so when a finished run identified no decisions', async () => {
    const minute = await detailOf(TEAM_LEAD, 'min-1001');
    render(
      <AiInterpretation
        minute={{
          ...minute,
          interpretation: minute.interpretation && { ...minute.interpretation, decisions: [] },
        }}
      />,
    );
    expect(screen.getByText('No decisions were identified.')).toBeInTheDocument();
  });

  it('keeps the section apart from the human minute on the page', async () => {
    render(
      <ToastProvider>
        <MeetingMinuteDetail minuteId="min-1001" />
      </ToastProvider>,
    );
    const section = await screen.findByRole('region', { name: 'AI summary and decisions' });

    // The minute's own text is not inside the AI section, and the AI's text is
    // not inside the minute.
    expect(within(section).queryByText(/Reviewed sprint 14 with Meghna Group/)).toBeNull();
    const minuteText = screen.getByText(/Reviewed sprint 14 with Meghna Group/);
    expect(section.contains(minuteText)).toBe(false);

    // And the minute comes first, with the reading after it.
    expect(
      minuteText.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
