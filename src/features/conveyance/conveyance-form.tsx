'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import type {
  ConveyanceFormInput,
  ReceiptUploadInput,
  TravelMode,
} from '@/contracts/conveyance';
import {
  ACCEPTED_RECEIPT_TYPES,
  MAX_RECEIPT_BYTES,
  TRAVEL_MODE_OPTIONS,
} from '@/contracts/conveyance';
import { mockConveyanceService } from '@/services/mock/conveyance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { FileUpload, Input, RadioGroup } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const EMPTY: ConveyanceFormInput = {
  businessName: '',
  clientName: '',
  visitedDate: '',
  visitedTime: '',
  mode: 'self',
  modeDescription: '',
  amount: '',
  receipt: null,
};

interface FormError {
  readonly field: string;
  readonly message: string;
}

/**
 * `FE-0765`, `FE-0766` — the conveyance claim form.
 *
 * Two things here are deliberate and easy to get wrong.
 *
 * **The date/time field is read-only and comes from the service.** Reading a
 * clock in the component would produce a hydration mismatch and, worse, would
 * disagree with the pinned demo clock the record is actually stamped with. The
 * field shows the value the claim will carry, not the browser's opinion of now.
 *
 * **The receipt is optional, and "absent" is not "failed".** A file that is too
 * large or the wrong type is reported as a problem to fix; choosing no file at
 * all is a complete, valid claim. Conflating the two is how someone ends up
 * believing they attached evidence they did not.
 */
export function ConveyanceForm() {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();

  const [form, setForm] = React.useState<ConveyanceFormInput>(EMPTY);
  const [errors, setErrors] = React.useState<readonly FormError[]>([]);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [receiptNote, setReceiptNote] = React.useState<string | null>(null);

  const { state } = useAsync(
    () => mockConveyanceService.formContext(user?.userId ?? ''),
    [user?.userId],
  );

  function set<K extends keyof ConveyanceFormInput>(key: K, value: ConveyanceFormInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseFile(files: FileList) {
    const file = files[0];
    if (!file) return;

    setReceiptNote(null);

    if (file.size > MAX_RECEIPT_BYTES) {
      setReceiptNote(
        'That file is larger than 5 MB. Attach a smaller one, or submit without a receipt.',
      );
      return;
    }
    if (!ACCEPTED_RECEIPT_TYPES.includes(file.type as never)) {
      setReceiptNote(
        'Only JPEG, PNG and PDF can be attached. Submit without a receipt if you have none.',
      );
      return;
    }

    const receipt: ReceiptUploadInput = {
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
    };
    set('receipt', receipt);
  }

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading claim form</span>
          <Skeleton height="4rem" rounded="md" />
          <Skeleton height="18rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status !== 'success') {
    return (
      <PageContainer>
        <EmptyState
          variant="error"
          title="Claim form unavailable"
          description={state.failure.message}
        />
      </PageContainer>
    );
  }

  const context = state.data;

  if (!context.canSubmit) {
    return (
      <PageContainer>
        <PageHeader title="New conveyance claim" />
        <EmptyState
          variant="denied"
          className="mt-5"
          title="Only an Employee or a Team Lead can submit a claim"
          description={context.submitBlockedReason ?? undefined}
          secondaryAction={
            <LinkButton href="/conveyance" variant="secondary" size="sm">
              Back to conveyance
            </LinkButton>
          }
        />
      </PageContainer>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors([]);
    setBlocked(null);
    setSubmitting(true);

    const result = await mockConveyanceService.submit(user?.userId ?? '', form);
    setSubmitting(false);

    if (result.status === 'success') {
      toast.show({
        tone: 'success',
        title: 'Conveyance claim submitted',
        description: result.data.nextStep,
      });
      router.push(`/conveyance/${result.data.id}`);
      return;
    }

    if (result.status === 'validation_failure') {
      setErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          message: `${error.message} ${error.guidance}`,
        })),
      );
      return;
    }

    setBlocked(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <PageContainer>
      <PageHeader
        title="New conveyance claim"
        description="Claim a journey you made for work."
      />

      <Callout tone="info" className="mt-5">
        {user?.primaryRole === 'team_lead'
          ? 'Your own claim goes straight to HR and the Super Administrator.'
          : 'Your Team Lead reviews this first. It reaches HR and the Super Administrator afterwards.'}
      </Callout>

      {/*
        `noValidate`: the browser's required-field bubble pre-empts the service,
        and the service is what carries the corrective guidance `REQ-TIME-025`
        requires.
      */}
      <form className="mt-5" onSubmit={submit} noValidate>
        <Card>
          <CardHeader title="Journey" description="Where you went and what it cost." />

          {errors.length > 0 && (
            <FormErrorSummary
              className="mt-4"
              title="This claim could not be submitted"
              errors={errors}
            />
          )}

          {blocked && (
            <Callout tone="warning" className="mt-4">
              {blocked}
            </Callout>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="Date/time"
              helperText={`Recorded automatically in ${context.timezone}.`}
            >
              {/*
                Read-only rather than disabled: a disabled input is skipped by
                keyboard navigation, so a screen-reader user would never hear
                the value that is about to be stamped on their claim.
              */}
              <Input
                name="submittedAt"
                value={context.nowLabel}
                readOnly
                aria-readonly
                className="bg-surface-sunken"
              />
            </Field>

            <Field label="Business name" required error={errorFor('businessName')}>
              <Input
                name="businessName"
                value={form.businessName}
                onChange={(event) => set('businessName', event.target.value)}
              />
            </Field>

            <Field label="Client name" required error={errorFor('clientName')}>
              <Input
                name="clientName"
                value={form.clientName}
                onChange={(event) => set('clientName', event.target.value)}
              />
            </Field>

            <Field label="Visited date" required error={errorFor('visitedDate')}>
              <Input
                type="date"
                name="visitedDate"
                max={context.maxVisitedDate}
                value={form.visitedDate}
                onChange={(event) => set('visitedDate', event.target.value)}
              />
            </Field>

            <Field label="Time" required error={errorFor('visitedTime')}>
              <Input
                type="time"
                name="visitedTime"
                value={form.visitedTime}
                onChange={(event) => set('visitedTime', event.target.value)}
              />
            </Field>

            <Field
              label="Amount"
              required
              helperText="In BDT. Digits only, up to two decimal places."
              error={errorFor('amount')}
            >
              <Input
                name="amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => set('amount', event.target.value)}
              />
            </Field>
          </div>

          <div className="mt-4">
            <RadioGroup
              name="mode"
              legend="How did you travel?"
              value={form.mode}
              onValueChange={(value) => set('mode', value as TravelMode)}
              options={TRAVEL_MODE_OPTIONS}
            />
          </div>

          {form.mode === 'other' && (
            <div className="mt-4">
              <Field
                label="Describe the mode"
                required
                helperText='A reviewer cannot decide on "Other" with no detail.'
                error={errorFor('modeDescription')}
              >
                <Input
                  name="modeDescription"
                  value={form.modeDescription}
                  onChange={(event) => set('modeDescription', event.target.value)}
                />
              </Field>
            </div>
          )}
        </Card>

        <Card className="mt-5">
          <CardHeader
            title="Receipt"
            description="Optional. A claim without one is still valid."
          />

          {(receiptNote || errorFor('receipt')) && (
            <Callout tone="warning" className="mt-4">
              {receiptNote ?? errorFor('receipt')}
            </Callout>
          )}

          <FileUpload
            className="mt-4"
            label="Attach a receipt"
            accept={ACCEPTED_RECEIPT_TYPES.join(',')}
            helperText="JPEG, PNG or PDF, up to 5 MB. Leave this empty if you have no receipt."
            files={
              form.receipt
                ? [
                    {
                      id: 'receipt',
                      name: form.receipt.fileName,
                      size: `${Math.max(1, Math.round(form.receipt.sizeBytes / 1024))} KB`,
                    },
                  ]
                : []
            }
            onFilesSelected={chooseFile}
            onRemove={() => {
              set('receipt', null);
              setReceiptNote(null);
            }}
          />
        </Card>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            iconLeading={<Send aria-hidden className="size-4" />}
          >
            Submit claim
          </Button>
          <LinkButton href="/conveyance" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </PageContainer>
  );
}
