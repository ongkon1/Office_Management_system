'use client';

import * as React from 'react';
import { Check, Undo2, X } from 'lucide-react';
import type { RequisitionDetailView } from '@/contracts/requisition';
import { mockRequisitionService } from '@/services/mock/requisition';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ApprovalTimeline } from '@/components/feedback/approval-timeline';
import { stageTone } from './requisition-list';

/**
 * `FE-0748`, `FE-0749`, `FE-0750` — one requisition.
 *
 * The timeline is the point of this screen. A reviewer deciding on an item
 * needs to know who has already looked at it and what they said; a submitter
 * needs to know who is holding it now. Both read the same list, because there
 * is only one chain and hiding half of it from either side would make the
 * status unexplainable.
 */
export function RequisitionDetail({ requisitionId }: { requisitionId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [decision, setDecision] = React.useState<'approved' | 'rejected' | null>(null);
  const [reason, setReason] = React.useState('');
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { state, reload } = useAsync(
    () => mockRequisitionService.get(user?.userId ?? '', requisitionId),
    [user?.userId, requisitionId],
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading requisition</span>
          <Skeleton height="4rem" rounded="md" />
          <Skeleton height="16rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status !== 'success') {
    /*
     * A requisition the viewer may not see and one that does not exist arrive
     * here identically, and are presented identically. Distinguishing them
     * would turn the URL into a way to confirm that a record exists.
     */
    return (
      <PageContainer>
        <EmptyState
          variant={state.failure.status === 'not_found' ? 'empty' : 'error'}
          title="Requisition not found"
          description="It may have been withdrawn, or you may not have access to it."
          secondaryAction={
            <LinkButton href="/requisitions" variant="secondary" size="sm">
              Back to requisitions
            </LinkButton>
          }
        />
      </PageContainer>
    );
  }

  const data: RequisitionDetailView = state.data;

  async function decide() {
    if (!decision) return;
    setReasonError(null);
    setConflict(null);
    setBusy(true);

    const result = await mockRequisitionService.decide(user?.userId ?? '', requisitionId, {
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
        title: decision === 'approved' ? 'Requisition approved' : 'Requisition rejected',
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
    const result = await mockRequisitionService.withdraw(user?.userId ?? '', requisitionId);
    setBusy(false);
    if (result.status === 'success') {
      reload();
      toast.show({ tone: 'info', title: 'Requisition withdrawn' });
      return;
    }
    setConflict(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
    reload();
  }

  const facts: { label: string; value: string }[] = [
    { label: 'Type', value: data.kindLabel },
    { label: 'Purpose', value: data.purpose },
    { label: 'Urgency', value: data.urgency },
    { label: 'Model', value: data.modelName },
    { label: 'Approx amount', value: data.amountDisplay },
    ...(data.lastRecoverDateLabel
      ? [{ label: 'Last recover date', value: data.lastRecoverDateLabel }]
      : []),
    { label: 'Raised by', value: `${data.submitterName} · ${data.submitterRoleLabel}` },
    { label: 'Submitted', value: data.submittedAtLabel },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={data.itemName}
        description={`${data.reference} · ${data.kindLabel}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={stageTone(data)}>{data.stageLabel}</Badge>
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
          <CardHeader
            title="Your decision"
            description="This requisition is waiting for you."
          />
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
        <Card>
          <CardHeader title="Request" />
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-caption text-ink-muted">{fact.label}</dt>
                <dd className="text-body-sm text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <ApprovalTimeline
          reviews={data.reviews}
          pendingReviewers={data.pendingReviewers}
          description="Every decision recorded on this requisition, in order."
        />
      </div>

      <Dialog
        open={decision !== null}
        onClose={() => {
          setDecision(null);
          setReasonError(null);
        }}
        title={decision === 'approved' ? 'Approve this requisition' : 'Reject this requisition'}
        description={
          decision === 'approved'
            ? 'It moves to the next stage of the chain.'
            : 'A rejection ends the chain. The person who raised it will see your reason.'
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
