import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Result } from '@/contracts/results';
import { EmptyState } from '@/components/feedback/alert';
import { Duration, NotRecorded, RestrictedValue } from '@/components/ui/misc';
import { MetricCard } from '@/components/feedback/card';
import { MoneyValue, FinanceFallback } from '@/features/finance/shared';
import { HrResultFallback } from '@/features/hr/shared';
import { ReportsFallback } from '@/features/reports/report-catalogue';
import { toDurationView } from '@/lib/status';

/**
 * FE-0822 — every non-success state a feature module can be in must render as
 * something distinct and actionable.
 *
 * The service tests prove each `Result` kind is *produced*. This proves each
 * one is *presented*, and presented differently: a denial, a not-found and a
 * failure that look alike leave the user unable to tell whether to ask for
 * access, check the URL, or try again.
 */

type Failure = Exclude<Result<unknown>, { status: 'success' }>;

const DENIED: Failure = {
  status: 'permission_denied',
  code: 'FORBIDDEN',
  message: 'Cost values need the financial-detail permission.',
  guidance: 'Ask an administrator to grant finance.cost.view.',
};

const NOT_FOUND: Failure = {
  status: 'not_found',
  code: 'NOT_FOUND',
  message: 'Report not found.',
};

const ERROR: Failure = {
  status: 'error',
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong.',
  retryable: true,
};

const FALLBACKS = [
  { name: 'Finance', render: (f: Failure) => <FinanceFallback result={f} subject="Payroll" /> },
  { name: 'HR', render: (f: Failure) => <HrResultFallback result={f} subject="Employee" /> },
  { name: 'Reports', render: (f: Failure) => <ReportsFallback result={f} subject="Report" /> },
];

describe('non-success states are distinct across every module', () => {
  for (const fallback of FALLBACKS) {
    it(`${fallback.name} distinguishes denied, not-found and error`, () => {
      const denied = render(fallback.render(DENIED));
      const deniedText = denied.container.textContent ?? '';
      expect(deniedText).toContain('Not available to your role');
      // A denial must say what would unblock it.
      expect(deniedText).toContain('Ask an administrator');
      denied.unmount();

      const missing = render(fallback.render(NOT_FOUND));
      const missingText = missing.container.textContent ?? '';
      expect(missingText).toMatch(/not found/i);
      expect(missingText).not.toContain('Not available to your role');
      missing.unmount();

      const failed = render(fallback.render(ERROR));
      const failedText = failed.container.textContent ?? '';
      expect(failedText).toMatch(/unavailable/i);
      // A transient failure suggests retrying; a denial never should.
      expect(failedText).toMatch(/try again/i);
      failed.unmount();
    });
  }
});

describe('EmptyState variants read differently', () => {
  it('separates nothing-here from nothing-matched', () => {
    const empty = render(
      <EmptyState title="No employees yet" description="Add the first record." />,
    );
    expect(empty.container.textContent).toContain('No employees yet');
    empty.unmount();

    render(
      <EmptyState
        variant="no-results"
        title="No employees match these filters"
        description="Clear a filter."
      />,
    );
    expect(screen.getByText('No employees match these filters')).toBeInTheDocument();
  });

  it('offers a way forward on a locked or denied state', () => {
    render(
      <EmptyState
        variant="locked"
        title="This period is locked"
        description="Changes need an HR amendment."
      />,
    );
    expect(screen.getByText('Changes need an HR amendment.')).toBeInTheDocument();
  });
});

describe('absent, restricted and zero are three different things', () => {
  it('marks an absent value rather than leaving it blank', () => {
    render(<NotRecorded />);
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });

  it('marks a restricted value and says why, without showing it', () => {
    render(<RestrictedValue reason="This needs the financial-detail permission." />);
    expect(screen.getByText('Restricted')).toBeInTheDocument();
    expect(
      screen.getByText('This needs the financial-detail permission.'),
    ).toBeInTheDocument();
  });

  it('renders a real zero as a zero', () => {
    render(<Duration value={toDurationView(0)} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('falls back to the absent marker when a duration is genuinely missing', () => {
    render(<Duration value={null} />);
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });
});

describe('permission-aware presentation', () => {
  it('shows a money value when the viewer is authorized', () => {
    render(
      <MoneyValue
        value={{
          visible: true,
          value: { amount: '8755.25', currency: 'BDT' },
          display: 'BDT 8,755.25',
          compact: 'BDT 8.76K',
        }}
      />,
    );
    expect(screen.getByText('BDT 8,755.25')).toBeInTheDocument();
  });

  it('withholds it without inventing a zero or a blank', () => {
    const { container } = render(
      <MoneyValue value={{ visible: false, reason: 'permission_required' }} />,
    );
    expect(screen.getByText('Restricted')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/BDT|0\.00/);
  });

  it('keeps the exact figure for assistive technology when abbreviating', () => {
    render(
      <MoneyValue
        compact
        value={{
          visible: true,
          value: { amount: '12345678.90', currency: 'BDT' },
          display: 'BDT 12,345,678.90',
          compact: 'BDT 12.35M',
        }}
      />,
    );
    expect(screen.getByText('BDT 12.35M')).toBeInTheDocument();
    expect(screen.getByText('BDT 12,345,678.90')).toBeInTheDocument();
  });

  it('keeps a restricted metric tile labelled, never zeroed', () => {
    render(
      <MetricCard
        tile={{
          key: 'cost',
          label: 'Project labour cost',
          value: 'Restricted',
          restricted: true,
        }}
      />,
    );
    expect(screen.getByText('Project labour cost')).toBeInTheDocument();
    expect(screen.getByText('Restricted')).toBeInTheDocument();
  });

  it('renders a loading tile rather than an empty one', () => {
    const { container } = render(
      <MetricCard loading tile={{ key: 'x', label: 'Active hours', value: '0:00' }} />,
    );
    expect(container.querySelector('[aria-busy]')).not.toBeNull();
  });
});
