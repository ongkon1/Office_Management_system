'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, CornerDownLeft, Search as SearchIcon } from 'lucide-react';
import type { SearchEntityKind, SearchResultView } from '@/contracts/workspace';
import { mockWorkspaceService } from '@/services/mock/workspace';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { MultiSelectFilter, FilterBar } from '@/components/data/filters';
import { SearchInput } from '@/components/forms/inputs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

const KIND_OPTIONS: readonly { value: SearchEntityKind; label: string }[] = [
  { value: 'employee', label: 'Employees' },
  { value: 'division', label: 'Divisions' },
  { value: 'project', label: 'Projects' },
  { value: 'task', label: 'Tasks' },
  { value: 'timesheet', label: 'Timesheets' },
  { value: 'remark', label: 'Remarks' },
  { value: 'document', label: 'Documents' },
];

/* -------------------------------------------------------------------------- */
/* FE-0711 — command palette                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The command palette.
 *
 * Keyboard navigation is the point: ↑/↓ move a virtual cursor, Enter opens the
 * highlighted result, Escape closes. The listbox is `aria-activedescendant`
 * driven so focus never leaves the input — moving DOM focus between options
 * would stop the user typing to refine, which is what a palette is for.
 */
export function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useSession();
  const router = useRouter();
  const [term, setTerm] = React.useState('');
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { state } = useAsync(
    () =>
      open && term.trim()
        ? mockWorkspaceService.search(user?.userId ?? '', term)
        : Promise.resolve({
            status: 'success' as const,
            data: { term: '', totalCount: 0, groups: [], guidance: null },
          }),
    [user?.userId, term, open],
  );
  const { state: recentState } = useAsync(
    () => mockWorkspaceService.listRecentSearches(user?.userId ?? ''),
    [user?.userId, open],
  );

  const results: readonly SearchResultView[] =
    state.status === 'success' ? state.data.groups.flatMap((group) => group.results) : [];

  // Reset the cursor when the result set changes rather than in an effect.
  const [lastKey, setLastKey] = React.useState('');
  const key = `${term}|${results.length}`;
  if (key !== lastKey) {
    setLastKey(key);
    setCursor(0);
  }

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function choose(result: SearchResultView) {
    onClose();
    setTerm('');
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => (results.length ? (value + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => (results.length ? (value - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (results[cursor]) choose(results[cursor]);
      else if (term.trim()) {
        onClose();
        router.push(`/search?q=${encodeURIComponent(term.trim())}`);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
      role="presentation"
      data-print="hide"
    >
      <div
        className="absolute inset-0 bg-surface-inverse/40 animate-[fade-in_150ms_ease-out]"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <SearchIcon aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded
            aria-controls="search-palette-listbox"
            aria-activedescendant={results[cursor] ? `palette-option-${cursor}` : undefined}
            aria-label="Search employees, divisions, projects, tasks, timesheets, remarks and documents"
            placeholder="Search…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            className="h-12 w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-subtle"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-caption text-ink-muted sm:block">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {!term.trim() && (
            <div>
              <p className="px-2 py-1 text-caption text-ink-muted">Recent searches</p>
              {recentState.status === 'success' && recentState.data.length > 0 ? (
                <ul>
                  {recentState.data.map((recent) => (
                    <li key={recent}>
                      <button
                        type="button"
                        onClick={() => setTerm(recent)}
                        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-body-sm text-ink hover:bg-surface-sunken"
                      >
                        <Clock aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
                        {recent}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-3 text-body-sm text-ink-muted">
                  Search employees, divisions, projects, tasks, timesheets, remarks and documents.
                  Only records you may see are returned.
                </p>
              )}
            </div>
          )}

          {term.trim() && (
            <ul id="search-palette-listbox" role="listbox" aria-label="Search results">
              {results.map((result, index) => (
                <li
                  key={`${result.kind}-${result.id}`}
                  id={`palette-option-${index}`}
                  role="option"
                  aria-selected={index === cursor}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => choose(result)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left',
                      index === cursor ? 'bg-accent-subtle' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <Badge tone="neutral">{result.kindLabel}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm text-ink">{result.title}</span>
                      <span className="block truncate text-caption text-ink-muted">
                        {result.subtitle}
                      </span>
                    </span>
                    {index === cursor && (
                      <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
                    )}
                  </button>
                </li>
              ))}
              {results.length === 0 && state.status === 'success' && (
                <li className="px-2 py-4 text-body-sm text-ink-muted">
                  {state.data.guidance ?? 'No results you have access to.'}
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-caption text-ink-muted">
          <span>↑ ↓ to move · Enter to open · Esc to close</span>
          {term.trim() && (
            <Link
              href={`/search?q=${encodeURIComponent(term.trim())}`}
              onClick={onClose}
              className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-ink"
            >
              See all results
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0711 / FE-0712 — full results page                                      */
/* -------------------------------------------------------------------------- */

export function SearchResultsPage({ initialTerm }: { initialTerm: string }) {
  const { user } = useSession();
  const [term, setTerm] = React.useState(initialTerm);
  const [kinds, setKinds] = React.useState<readonly string[]>([]);

  const { state } = useAsync(
    () =>
      mockWorkspaceService.search(
        user?.userId ?? '',
        term,
        kinds.length ? (kinds as SearchEntityKind[]) : undefined,
      ),
    [user?.userId, term, kinds],
  );
  const { state: recentState } = useAsync(
    () => mockWorkspaceService.listRecentSearches(user?.userId ?? ''),
    [user?.userId, term],
  );

  if (state.status === 'loading') return <ReportsLoading label="search results" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Search" />;
  }
  const data = state.data;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Search"
        description="Employees, divisions, projects, tasks, timesheets, remarks and documents."
        meta={<Badge tone="neutral">{data.totalCount} results</Badge>}
      />

      <div className="mt-5 max-w-xl">
        <SearchInput
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Search"
          placeholder="Search across the system"
        />
      </div>

      <FilterBar
        className="mt-4"
        applied={kinds.map((kind) => ({
          key: kind,
          label: 'Type',
          value: KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind,
          onRemove: () => setKinds(kinds.filter((item) => item !== kind)),
        }))}
        onClearAll={() => setKinds([])}
        resultSummary={`${data.totalCount} result${data.totalCount === 1 ? '' : 's'}`}
      >
        <MultiSelectFilter
          label="Type"
          options={KIND_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          selected={kinds}
          onChange={setKinds}
        />
      </FilterBar>

      <Callout tone="info" className="mt-4">
        Results are filtered by your access before they are counted. The total is the number of
        records you may see, never the number that exist.
      </Callout>

      {recentState.status === 'success' && recentState.data.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Recent searches" description="Stored in this browser for the demo." />
          <ul className="mt-3 flex flex-wrap gap-2">
            {recentState.data.map((recent) => (
              <li key={recent}>
                <button
                  type="button"
                  onClick={() => setTerm(recent)}
                  className="inline-flex min-h-6 items-center rounded-full border border-border px-2.5 py-1 text-caption text-ink hover:bg-surface-sunken"
                >
                  {recent}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.groups.length === 0 ? (
        <EmptyState
          className="mt-5"
          variant={term.trim() ? 'no-results' : 'empty'}
          title={term.trim() ? 'No results you have access to' : 'Search the system'}
          description={data.guidance ?? undefined}
        />
      ) : (
        <div className="mt-5 space-y-5">
          {data.groups.map((group) => (
            <Card key={group.kind}>
              <CardHeader
                title={group.label}
                as="h2"
                description={`${group.results.length} result${group.results.length === 1 ? '' : 's'}`}
              />
              <ul className="mt-3 space-y-2">
                {group.results.map((result) => (
                  <li key={result.id}>
                    <Link
                      href={result.href}
                      className="block rounded-md border border-border p-3 transition-colors hover:border-highlight-hover hover:bg-surface-sunken"
                    >
                      <span className="flex flex-wrap items-start justify-between gap-2">
                        <span className="text-body-sm font-medium text-ink">{result.title}</span>
                        <Badge tone="neutral">{result.kindLabel}</Badge>
                      </span>
                      <span className="mt-0.5 block text-caption text-ink-muted">
                        {result.subtitle}
                      </span>
                      {result.snippet && (
                        <span className="mt-1 block text-caption text-ink-subtle">
                          {result.snippet}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
