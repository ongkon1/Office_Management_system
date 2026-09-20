'use client';

import * as React from 'react';
import type { ClientRef, MeetingMinuteFields, MeetingMinuteProjectOption } from '@/contracts/meeting-minutes';
import { MEETING_MINUTE_LIMITS } from '@/contracts/meeting-minutes';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { Card, CardHeader } from '@/components/feedback/card';
import { Field } from '@/components/forms/field';
import { Input, Select, Textarea } from '@/components/forms/inputs';

/**
 * `FE-1116` — the fields a meeting minute is written in, shared by Add and Edit.
 *
 * Extracted rather than copied. The client-to-project dependency
 * (`REQ-MTG-005`), the two reachable length limits and the wording of every
 * hint are rules, not decoration: a second copy drifts, and the drift shows up
 * as one form accepting a client-project pair the other refuses. The forms
 * keep what genuinely differs — which service they call, what their actions
 * are, and what they do afterwards.
 *
 * Neither control is capped with `maxLength`. Silently truncating a pasted
 * minute is worse than telling someone it is too long, so the over-limit state
 * is shown here and refused by the service (`FE-1114`).
 */
export interface MinuteFieldsProps {
  values: MeetingMinuteFields;
  clients: readonly ClientRef[];
  projectOptions: readonly MeetingMinuteProjectOption[];
  projectsLoading: boolean;
  limits: typeof MEETING_MINUTE_LIMITS;
  /** The field-level message, already carrying its corrective guidance. */
  errorFor: (field: string) => string | undefined;
  onChange: <K extends keyof MeetingMinuteFields>(key: K, value: MeetingMinuteFields[K]) => void;
  /** Separate from `onChange`, because changing the client clears the project. */
  onClientChange: (clientId: string) => void;
  /** Wording differs: a new minute is recorded, an existing one is corrected. */
  minuteCardDescription: string;
  /** Shown inside the Meeting card, above the fields: the error summary and
   *  any blocking message, which belong to the form rather than to a field. */
  notices?: React.ReactNode;
}

export function MinuteFields({
  values,
  clients,
  projectOptions,
  projectsLoading,
  limits,
  errorFor,
  onChange,
  onClientChange,
  minuteCardDescription,
  notices,
}: MinuteFieldsProps) {
  const titleOverBy = values.title.trim().length - limits.titleMaxLength;
  const contentOverBy = values.content.length - limits.contentMaxLength;

  return (
    <>
      <Card>
        <CardHeader
          title="Meeting"
          description="The client and project decide who can read this minute."
        />

        {notices}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="Title"
          required
          className="sm:col-span-2"
          helperText={`What the meeting was, in a line. Up to ${formatCount(limits.titleMaxLength)} characters.`}
          error={
            errorFor('title') ??
            (titleOverBy > 0
              ? `The title is ${formatCount(titleOverBy)} characters over the limit. Shorten it and save again.`
              : undefined)
          }
        >
          <Input
            name="title"
            value={values.title}
            onChange={(event) => onChange('title', event.target.value)}
          />
        </Field>

        <Field label="Client" required error={errorFor('clientId')}>
          <Select
            name="clientId"
            value={values.clientId}
            placeholder="Choose a client"
            disabled={clients.length === 0}
            options={clients.map((client) => ({ value: client.id, label: client.name }))}
            onChange={(event) => onClientChange(event.target.value)}
          />
        </Field>

        <Field
          label="Project"
          required
          disabled={values.clientId === '' || projectsLoading}
          helperText={
            values.clientId === ''
              ? 'Choose a client first.'
              : projectsLoading
                ? 'Loading projects for this client.'
                : projectOptions.length === 0
                  ? 'This client has no active project you can record a minute against.'
                  : undefined
          }
          error={errorFor('projectId')}
        >
          <Select
            name="projectId"
            value={values.projectId}
            placeholder="Choose a project"
            options={projectOptions.map((project) => ({
              value: project.id,
              label: `${project.name} (${project.code})`,
            }))}
            onChange={(event) => onChange('projectId', event.target.value)}
          />
          </Field>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Minute" description={minuteCardDescription} />

        <Field
          label="What the meeting covered"
          required
          className="mt-5"
          helperText="Plain text. Leave a blank line between paragraphs; formatting that cannot be stored safely is removed."
          error={
            errorFor('content') ??
            (contentOverBy > 0
              ? 'The minute is over the character limit. Shorten it and save again.'
              : undefined)
          }
        >
          <Textarea
            name="content"
            rows={14}
            value={values.content}
            onChange={(event) => onChange('content', event.target.value)}
          />
        </Field>

        {/* Never colour alone: over the limit is said in words too. */}
        <p
          className={cn(
            'mt-1.5 text-caption',
            contentOverBy > 0 ? 'font-medium text-danger' : 'text-ink-muted',
          )}
        >
          {formatCount(values.content.length)} of {formatCount(limits.contentMaxLength)} characters
          {contentOverBy > 0 && ` — ${formatCount(contentOverBy)} over the limit`}
        </p>
      </Card>
    </>
  );
}
