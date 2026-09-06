'use client';

import * as React from 'react';
import { Check, FileText, Undo2, X } from 'lucide-react';
import type { ConveyanceDetailView } from '@/contracts/conveyance';
import { mockConveyanceService } from '@/services/mock/conveyance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Field } from '@/components/forms/field';
import { Textarea } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RestrictedValue } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { ApprovalTimeline } from '@/components/feedback/approval-timeline';
import { claimTone } from './conveyance-list';

/**
 * `FE-0768`, `FE-0770`, `FE-0771` — one conveyance claim.
 *
 * The receipt is rendered from `detail.receipt`, which is a discriminated union
 * the service produced. A viewer who may not see it receives the `restricted`
 * variant, which carries no file name, size or link at all — there is nothing
 * here to accidentally render. That is the point of doing redaction in the type
 * rather than with a conditional in the markup.
 */
export function ConveyanceDetail({ claimId }: { claimId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [decision, setDecision] = React.useState<'approved' | 'rejected' | null>(null);
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { state, reload } = useAsync(
    () => mockConveyanceService.get(user?.userId ?? '', claimId),
    [user?.userId, claimId],
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading conveyance claim</span>
          <Skeleton height="4rem" rounded="md" />
          <Skeleton height="16rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status !== 'success') {
    return (
      <PageContainer>
        <EmptyState
          variant={state.failure.status === 'not_found' ? 'empty' : 'error'}
          title="Conveyance claim not found"
          description="It may have been withdrawn, or you may not have access to it."
          secondaryAction={
            <LinkButton href="/conveyance" variant="secondary" size="sm">
              Back to conveyance
            </LinkButton>
          }
        />
      </PageContainer>
    );
  }

  const data: ConveyanceDetailView = state.data;

  async function decide() {
    if (!decision) return;
    setReasonError(null);
    setConflict(null);
    setBusy(true);

    const result = await mockConveyanceService.decide(user?.userId ?? '', claimId, {
      decision,
      reason,
    });
    setBusy(false);

    if (result.status === 'success') {
      setDecision(null);
      setReason('');
      reload();
      toast.show({
        tone: decision === 'approved' ? 'success' : 'info',
        title: decision === 'approved' ? 'Claim approved' : 'Claim rejected',
        description: result.data.nextStep,
      });
      return;
    }

    if (result.status === 'validation_failure') {
      setReasonError(
        result.fieldErrors.map((error) => `${error.message} ${error.guidance}`).join(' '),
      );
      return;
    }

    setDecision(null);
    setConflict(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
    reload();
  }

  async function withdraw() {
    setBusy(true);
    const result = await mockConveyanceService.withdraw(user?.userId ?? '', claimId);
    setBusy(false);
    if (result.status === 'success') {
      reload();
      toast.show({ tone: 'info', title: 'Claim withdrawn' });
      return;
    }
    setConflict(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
    reload();
  }

  const facts: { label: string; value: string }[] = [
    { label: 'Client', value: data.clientName },
    { label: 'Visited', value: data.visitedLabel },
    {
      label: 'Mode',
      value: data.modeDescription ? `${data.modeLabel} — ${data.modeDescription}` : data.modeLabel,
    },
    { label: 'Amount', value: data.amountDisplay },
    { label: 'Claimed by', value: `${data.submitterName} · ${data.submitterRoleLabel}` },
    { label: 'Submitted', value: data.submittedAtLabel },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={data.businessName}
        description={`${data.reference} · ${data.visitedLabel}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={claimTone(data)}>{data.stageLabel}</Badge>
            {data.canWithdraw && (
              <Button
                variant="ghost"
                size="sm"
                onClick={withdraw}
                disabled={busy}
                iconLeading={<Undo2 aria-hidden className="size-4" />}
              >
                Withdraw
              </Button>
            )}
          </span>
        }
      />

      {conflict && (
        <Alert tone="warning" className="mt-5" title="This could not be recorded" live>
          {conflict}
        </Alert>
      )}

      <Callout tone="info" className="mt-5">
        {data.nextStep}
      </Callout>

      {data.canDecide && (
        <Card className="mt-5">
          <CardHeader title="Your decision" description="This claim is waiting for you." />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={() => setDecision('approved')}
              iconLeading={<Check aria-hidden className="size-4" />}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDecision('rejected')}
              iconLeading={<X aria-hidden className="size-4" />}
            >
              Reject
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Claim" />
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-caption text-ink-muted">{fact.label}</dt>
                  <dd className="text-body-sm text-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Receipt" />
            {data.receipt.state === 'restricted' ? (
              <p className="mt-4">
                <RestrictedValue reason="You are not authorized to view this receipt." />
              </p>
            ) : data.receipt.state === 'none' ? (
              <p className="mt-4 text-body-sm text-ink-muted">
                No receipt was attached. The upload is optional, so this claim is complete
                without one.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                <FileText aria-hidden className="size-5 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {data.receipt.fileName}
                  </span>
                  <span className="block text-caption text-ink-subtle">
                    {data.receipt.typeLabel} · {data.receipt.sizeLabel}
                  </span>
                </span>
                <Badge tone="neutral">Attached</Badge>
              </div>
            )}
          </Card>
        </div>

        <ApprovalTimeline
          reviews={data.reviews}
          pendingReviewers={data.pendingReviewers}
          description="Every decision recorded on this claim, in order."
        />
      </div>

      <Dialog
        open={decision !== null}
        onClose={() => {
          setDecision(null);
          setReasonError(null);
        }}
        title={decision === 'approved' ? 'Approve this claim' : 'Reject this claim'}
        description={
          decision === 'approved'
            ? 'It moves to the next stage of the chain.'
            : 'A rejection ends the chain. The person who claimed will see your reason.'
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDecision(null);
                setReasonError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={decide} loading={busy}>
              {decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        <Field
          label={decision === 'rejected' ? 'Reason' : 'Note (optional)'}
          required={decision === 'rejected'}
          error={reasonError ?? undefined}
          helperText={
            decision === 'rejected'
              ? 'Say what would need to change for this to be approved.'
              : undefined
          }
        >
          <Textarea
            name="reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </Dialog>
    </PageContainer>
  );
}
