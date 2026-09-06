'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import type { RequisitionFormInput, RequisitionKind } from '@/contracts/requisition';
import { mockRequisitionService } from '@/services/mock/requisition';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Tabs } from '@/components/feedback/disclosure';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';

const EMPTY: RequisitionFormInput = {
  kind: 'in_house',
  itemName: '',
  purpose: '',
  urgency: '',
  approxAmount: '',
  modelName: '',
  lastRecoverDate: '',
};

interface FormError {
  readonly field: string;
  readonly message: string;
}

/**
 * `FE-0744`, `FE-0745`, `FE-0746` — the two requisition forms.
 *
 * They are one screen with a labelled choice rather than two routes, because
 * the decision a person is actually making is "repair something we own" versus
 * "buy something new" — that is a property of the request, not a different
 * destination. The shared fields keep their values when the choice changes;
 * `lastRecoverDate` belongs only to the in-house form and is cleared when it
 * stops applying, so a hidden value can never be submitted.
 *
 * Every field is a text input, as specified. The amount and the date are
 * normalised by the service, not here — a component never parses money.
 */
export function RequisitionForm() {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();

  const [form, setForm] = React.useState<RequisitionFormInput>(EMPTY);
  const [errors, setErrors] = React.useState<readonly FormError[]>([]);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const role = user?.primaryRole;
  const canSubmit = role === 'employee' || role === 'team_lead';

  function set<K extends keyof RequisitionFormInput>(
    key: K,
    value: RequisitionFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseKind(kind: RequisitionKind) {
    setForm((current) => ({
      ...current,
      kind,
      // Never carry a field the chosen form does not show.
      lastRecoverDate: kind === 'in_house' ? current.lastRecoverDate : '',
    }));
    setErrors([]);
  }

  if (!canSubmit) {
    return (
      <PageContainer>
        <PageHeader title="Raise a requisition" />
        <EmptyState
          variant="denied"
          className="mt-5"
          title="Only an Employee or a Team Lead can raise a requisition"
          description="You can review the requisitions that reach you, but not raise one."
          secondaryAction={
            <LinkButton href="/requisitions" variant="secondary" size="sm">
              Back to requisitions
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

    const result = await mockRequisitionService.submit(user?.userId ?? '', form);
    setSubmitting(false);

    if (result.status === 'success') {
      toast.show({
        tone: 'success',
        title: 'Requisition submitted',
        description: result.data.nextStep,
      });
      router.push(`/requisitions/${result.data.id}`);
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
      'guidance' in result
        ? `${result.message} ${result.guidance ?? ''}`.trim()
        : result.message,
    );
  }

  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;
  const isInHouse = form.kind === 'in_house';

  return (
    <PageContainer>
      <PageHeader
        title="Raise a requisition"
        description="Ask for an item to be repaired, replaced or bought."
      />

      <Callout tone="info" className="mt-5">
        {role === 'team_lead'
          ? 'Your own requisition goes straight to HR, Finance and the Super Administrator.'
          : 'Your Team Lead reviews this first. It reaches HR, Finance and the Super Administrator afterwards.'}
      </Callout>

      <Tabs
        className="mt-5"
        label="Requisition type"
        activeKey={form.kind}
        onChange={(key) => chooseKind(key as RequisitionKind)}
        items={[
          { key: 'in_house', label: 'In-house' },
          { key: 'new', label: 'New' },
        ]}
      />

      {/*
        `noValidate` is deliberate. The browser's own required-field bubble
        pre-empts the service, and the service is what carries the corrective
        guidance `REQ-TIME-025` requires.
      */}
      <form className="mt-4" onSubmit={submit} noValidate>
        <Card>
          <CardHeader
            title={isInHouse ? 'In-house item' : 'New item'}
            description={
              isInHouse
                ? 'An item we already own that needs repair or replacing.'
                : 'Something we do not have yet.'
            }
          />

          {errors.length > 0 && (
            <FormErrorSummary
              className="mt-4"
              title="This requisition could not be submitted"
              errors={errors}
            />
          )}

          {blocked && (
            <Callout tone="warning" className="mt-4">
              {blocked}
            </Callout>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errorFor('itemName')}>
              <Input
                name="itemName"
                value={form.itemName}
                onChange={(event) => set('itemName', event.target.value)}
              />
            </Field>

            <Field
              label="Purpose"
              required
              helperText={isInHouse ? 'For example Repair or Lost.' : undefined}
              error={errorFor('purpose')}
            >
              <Input
                name="purpose"
                value={form.purpose}
                onChange={(event) => set('purpose', event.target.value)}
              />
            </Field>

            {isInHouse && (
              <Field
                label="Last recover date"
                required
                helperText="YYYY-MM-DD."
                error={errorFor('lastRecoverDate')}
              >
                <Input
                  name="lastRecoverDate"
                  value={form.lastRecoverDate}
                  onChange={(event) => set('lastRecoverDate', event.target.value)}
                />
              </Field>
            )}

            <Field
              label={isInHouse ? 'Model name' : 'Model'}
              required
              error={errorFor('modelName')}
            >
              <Input
                name="modelName"
                value={form.modelName}
                onChange={(event) => set('modelName', event.target.value)}
              />
            </Field>

            <Field
              label="Approx amount"
              required
              helperText="In BDT. Digits only, up to two decimal places."
              error={errorFor('approxAmount')}
            >
              <Input
                name="approxAmount"
                inputMode="decimal"
                value={form.approxAmount}
                onChange={(event) => set('approxAmount', event.target.value)}
              />
            </Field>

            <Field
              label="Urgency"
              required
              helperText="For example High, Medium or Low."
              error={errorFor('urgency')}
            >
              <Input
                name="urgency"
                value={form.urgency}
                onChange={(event) => set('urgency', event.target.value)}
              />
            </Field>
          </div>
        </Card>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            iconLeading={<Send aria-hidden className="size-4" />}
          >
            Submit requisition
          </Button>
          <LinkButton href="/requisitions" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </PageContainer>
  );
}
