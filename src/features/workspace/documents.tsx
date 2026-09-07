'use client';

import * as React from 'react';
import { Download, Eye, FileText, Lock } from 'lucide-react';
import type { DocumentItemView } from '@/contracts/workspace';
import { mockWorkspaceService } from '@/services/mock/workspace';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { SearchInput } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RestrictedValue } from '@/components/ui/misc';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

const SCOPE_OPTIONS = [
  { value: 'company', label: 'Company' },
  { value: 'division', label: 'Division' },
  { value: 'project', label: 'Project' },
];

/**
 * FE-0723 — the document library.
 *
 * A document in a division the viewer cannot see is absent. A document they can
 * see but not open keeps its title and states why — those are different
 * situations and the screen distinguishes them, because "you may not open this"
 * is useful and "this does not exist" would be a lie.
 */
export function DocumentLibrary() {
  const { user } = useSession();
  const toast = useToast();
  const [term, setTerm] = React.useState('');
  const [scopes, setScopes] = React.useState<readonly string[]>([]);
  const [preview, setPreview] = React.useState<DocumentItemView | null>(null);
  const [denial, setDenial] = React.useState<string | null>(null);

  const { state } = useAsync(
    () => mockWorkspaceService.getDocuments(user?.userId ?? '', { term, scopes }),
    [user?.userId, term, scopes],
  );

  /*
   * The search term and the scope filter are `useAsync` deps, so the request
   * re-enters `loading` on every keystroke and every filter change. A
   * page-level skeleton here would unmount the field being typed into and the
   * popover being clicked, so the controls stay mounted and only the results
   * region below them changes state.
   */
  const data = state.status === 'success' ? state.data : null;
  const failure = state.status === 'failure' ? state.failure : null;

  async function download(document: DocumentItemView) {
    setDenial(null);
    const result = await mockWorkspaceService.downloadDocument(user?.userId ?? '', document.id);
    if (result.status === 'success') {
      toast.show({
        tone: 'info',
        title: 'Download not available yet',
        description: result.data.note,
      });
      return;
    }
    setDenial(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Documents"
        description="Company, division and project documents you have access to."
        meta={
          data && (
            <>
              <Badge tone="neutral">{data.totalCount} documents</Badge>
              {data.restrictedCount > 0 && (
                <Badge tone="warning">{data.restrictedCount} restricted</Badge>
              )}
            </>
          )
        }
      />

      {denial && (
        <Alert className="mt-4" tone="danger" title="Download refused" live>
          {denial}
        </Alert>
      )}

      <div className="mt-5 max-w-md">
        <SearchInput
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label="Search documents"
          placeholder="Search by title, description or file name"
        />
      </div>

      <FilterBar
        className="mt-4"
        applied={scopes.map((scope) => ({
          key: scope,
          label: 'Scope',
          value: SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope,
          onRemove: () => setScopes(scopes.filter((item) => item !== scope)),
        }))}
        onClearAll={() => setScopes([])}
        resultSummary={
          data ? `${data.totalCount} document${data.totalCount === 1 ? '' : 's'}` : 'Loading…'
        }
      >
        <MultiSelectFilter
          label="Scope"
          options={SCOPE_OPTIONS}
          selected={scopes}
          onChange={setScopes}
        />
      </FilterBar>

      <Callout tone="info" className="mt-4">
        Documents in divisions outside your access are not listed at all. A document you can see
        but not open keeps its title and says which permission it needs.
      </Callout>

      {state.status === 'loading' ? (
        <ReportsLoading label="document library" inline />
      ) : failure ? (
        <ReportsFallback result={failure} subject="Documents" inline />
      ) : !data ? null : data.groups.length === 0 ? (
        <EmptyState
          className="mt-5"
          variant={term || scopes.length ? 'no-results' : 'empty'}
          title={term || scopes.length ? 'No documents match' : 'No documents available'}
          description={
            term || scopes.length
              ? 'Clear the search or a scope filter to widen the results.'
              : 'Documents appear here once they are added to a division or project you belong to.'
          }
        />
      ) : (
        <div className="mt-5 space-y-5">
          {data.groups.map((group) => (
            <Card key={group.key}>
              <CardHeader
                title={group.label}
                as="h2"
                description={`${group.documents.length} document${group.documents.length === 1 ? '' : 's'}`}
              />
              <ul className="mt-4 space-y-2">
                {group.documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="flex min-w-0 gap-3">
                      <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                          {document.title}
                          <Badge tone="neutral">v{document.version}</Badge>
                          {document.isRestricted && (
                            <Badge tone="warning" icon={<Lock aria-hidden className="size-3.5" />}>
                              Restricted
                            </Badge>
                          )}
                        </p>
                        {document.description && (
                          <p className="mt-0.5 text-caption text-ink-muted">
                            {document.description}
                          </p>
                        )}
                        <p className="mt-1 text-caption text-ink-subtle">
                          {document.mediaTypeLabel} · {document.sizeLabel} · {document.scopeLabel} ·
                          uploaded by {document.uploadedByLabel} on {document.uploadedAtLabel}
                        </p>
                        {document.restrictionReason && (
                          <p className="mt-1 text-caption text-undertime">
                            {document.restrictionReason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeading={<Eye aria-hidden className="size-4" />}
                        onClick={() => setPreview(document)}
                      >
                        Preview
                      </Button>
                      {document.canDownload ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          iconLeading={<Download aria-hidden className="size-4" />}
                          onClick={() => download(document)}
                        >
                          Download
                        </Button>
                      ) : (
                        <RestrictedValue reason={document.restrictionReason ?? undefined} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.title ?? 'Document'}
        description={preview ? `${preview.fileName} · v${preview.version}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Close
            </Button>
            {preview?.canDownload && (
              <Button variant="primary" onClick={() => preview && download(preview)}>
                Download
              </Button>
            )}
          </>
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-sunken p-6 text-center">
              <p className="max-w-sm text-body-sm text-ink-muted">
                {preview.previewPlaceholder}
              </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-caption text-ink-muted">Scope</dt>
                <dd className="text-body-sm text-ink">{preview.scopeLabel}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Type and size</dt>
                <dd className="text-body-sm text-ink">
                  {preview.mediaTypeLabel} · {preview.sizeLabel}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Uploaded</dt>
                <dd className="text-body-sm text-ink">
                  {preview.uploadedAtLabel} by {preview.uploadedByLabel}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Access</dt>
                <dd className="text-body-sm text-ink">
                  {preview.isRestricted ? preview.restrictionReason : 'Available to you'}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Dialog>
    </PageContainer>
  );
}
