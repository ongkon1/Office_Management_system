import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportJobView } from '@/contracts/view-models';
import type { Result } from '@/contracts/results';
import { ToastProvider } from '@/components/feedback/toast';
import { resultResponse } from '@/server/time/http';
import { serverPost } from '@/services/server/http';
import { serverReportingService } from '@/services/server/reporting';
import { ExportHistory } from './export-history';

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: 'user-1' } }),
}));

function job(state: ExportJobView['state'], id = `job-${state}`): ExportJobView {
  return {
    id,
    reportTitle: 'Employee hours',
    format: 'csv',
    formatLabel: 'CSV',
    state,
    stateLabel: state.charAt(0).toUpperCase() + state.slice(1),
    requestedAtLabel: '4 Oct 2026, 3:00 PM',
    requestedByLabel: 'You',
    filterSummary: 'September 2026',
    expiresAtLabel: state === 'ready' ? '5 Oct 2026, 3:00 PM' : null,
    failureMessage: state === 'failed' ? 'The export could not be generated.' : null,
    downloadUrl: state === 'ready' ? `/api/reporting?view=download&id=${id}` : null,
    canDownload: state === 'ready',
    canRetry: state === 'failed',
  };
}

function renderHistory() {
  return render(
    <ToastProvider>
      <ExportHistory service={serverReportingService} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BE-0904 real backend Result states', () => {
  it('preserves permission, locked, dependency-error, and success values through the browser transport', async () => {
    const responses: Result<unknown>[] = [
      { status: 'permission_denied', code: 'FORBIDDEN', message: 'Not available.', guidance: 'Ask an administrator.' },
      { status: 'conflict', code: 'PERIOD_LOCKED', message: 'This period is locked.', guidance: 'Request an amendment.' },
      { status: 'error', code: 'DEPENDENCY_FAILED', message: 'Please retry.', retryable: true },
      { status: 'success', data: { id: 'record-1' } },
    ];
    vi.mocked(fetch).mockImplementation(async () => resultResponse(responses.shift()!));

    await expect(serverPost('/api/example', {})).resolves.toEqual(expect.objectContaining({ status: 'permission_denied' }));
    await expect(serverPost('/api/example', {})).resolves.toMatchObject({ status: 'conflict', code: 'PERIOD_LOCKED' });
    await expect(serverPost('/api/example', {})).resolves.toMatchObject({ status: 'error', retryable: true });
    await expect(serverPost('/api/example', {})).resolves.toEqual({ status: 'success', data: { id: 'record-1' } });
  });

  it('shows loading followed by the permission response from the server adapter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(resultResponse({
      status: 'permission_denied',
      code: 'FORBIDDEN',
      message: 'Export history requires report access.',
      guidance: 'Ask an administrator to grant report.read.',
    }));

    renderHistory();
    expect(screen.getByText('Loading export history')).toBeInTheDocument();
    expect(await screen.findByText('Not available to your role')).toBeInTheDocument();
    expect(screen.getByText(/grant report\.read/)).toBeInTheDocument();
  });

  it('shows a retryable dependency error returned by the server adapter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(resultResponse({
      status: 'error',
      code: 'DEPENDENCY_FAILED',
      message: 'The records could not be loaded.',
      retryable: true,
    }));

    renderHistory();
    expect(await screen.findByText('Export history unavailable')).toBeInTheDocument();
    expect(screen.getByText('Try again in a moment.')).toBeInTheDocument();
  });

  it('renders worker progress, refresh, retry, and protected-download success from API payloads', async () => {
    let jobs = [job('queued'), job('processing'), job('failed'), job('ready')];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; args: readonly unknown[] };
      if (body.method === 'listExports') return resultResponse({ status: 'success', data: jobs });
      if (body.method === 'advanceExport') {
        const refreshed = job('processing', String(body.args[0]));
        jobs = jobs.map((item) => item.id === refreshed.id ? refreshed : item);
        return resultResponse({ status: 'success', data: refreshed });
      }
      if (body.method === 'retryExport') {
        const requeued = job('queued', String(body.args[0]));
        jobs = jobs.map((item) => item.id === requeued.id ? requeued : item);
        return resultResponse({ status: 'success', data: requeued });
      }
      return resultResponse({ status: 'error', code: 'INTERNAL_ERROR', message: 'Unexpected operation.', retryable: false });
    });

    const user = userEvent.setup();
    renderHistory();

    expect(await screen.findByText('4 jobs')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Refresh status' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Request again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/reporting?view=download&id=job-ready',
    );

    await user.click(screen.getAllByRole('button', { name: 'Refresh status' })[0]);
    expect(await screen.findByText('Export is now processing')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Request again' }));
    expect(await screen.findByText('Export requeued')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Queued')).toBeInTheDocument());
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();

    const operations = vi.mocked(fetch).mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)).method,
    );
    expect(operations).toEqual(expect.arrayContaining(['listExports', 'advanceExport', 'retryExport']));
  });
});
