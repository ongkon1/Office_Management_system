'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import type { MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import { Card } from '@/components/feedback/card';
import { Callout } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';

/** What to say when there is no interpretation, by why there is none. */
const NONE_YET: Readonly<Record<MeetingMinuteDetailView['processing']['status'], string>> = {
  not_processed: 'AI was not asked to read this minute, so there is no summary or list of decisions.',
  pending: 'The summary and decisions will appear here once task generation finishes.',
  processing: 'The summary and decisions will appear here once task generation finishes.',
  processed: 'Task generation finished without producing a summary or decisions.',
  failed: 'Task generation did not finish, so there is no summary or list of decisions.',
};

/**
 * `FE-1122` — the AI's reading of a minute, kept visibly apart from the minute.
 *
 * The minute above is the human record; this is an interpretation of it, and
 * the screen has to make that impossible to miss (`REQ-MTG-016`). So it is:
 *
 * - **Its own section, with its own heading** — never interleaved with the
 *   minute's content, and never folded into the generated-task list
 *   (`FE-1123`), which is a separate thing again: work created from the
 *   meeting, not a description of it.
 * - **Labelled in words** as AI-generated, with an icon beside the words
 *   rather than instead of them.
 * - **Rendered as plain text.** The minute is rendered as markup because the
 *   service sanitized it. This is model output, which `REQ-MTG-012` treats as
 *   untrusted, and it goes nowhere near that path: React escapes it.
 * - **Honest about drift.** Editing a minute never re-runs AI (`FE-1116`), so
 *   a summary can describe text that has since changed. When it does, the
 *   section says so above the summary, where it will be read first.
 *
 * Nothing here is an authorization decision. The interpretation is derived
 * only from content the viewer is already allowed to read, which is why the
 * service attaches it to any readable minute and it has no restricted form.
 */
export function AiInterpretation({ minute }: { minute: MeetingMinuteDetailView }) {
  const headingId = React.useId();
  const interpretation = minute.interpretation;

  return (
    <section aria-labelledby={headingId} className="mt-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-h3 text-ink">
              AI summary and decisions
            </h2>
            <p className="mt-0.5 text-body-sm text-ink-muted">
              An interpretation of the minute above, produced by task generation. It is not part of
              the minute.
            </p>
          </div>
          <Badge tone="neutral" icon={<Sparkles aria-hidden className="size-3.5 shrink-0" />}>
            AI-generated
          </Badge>
        </div>

        {interpretation === null ? (
          <p className="mt-4 text-body-sm text-ink-muted">{NONE_YET[minute.processing.status]}</p>
        ) : (
          <>
            {interpretation.basedOnEarlierContent && (
              <Callout tone="warning" className="mt-4">
                The minute has been edited since this was generated, so it may no longer match. Editing
                does not run task generation again.
              </Callout>
            )}

            <h3 className="mt-5 text-label text-ink">Summary</h3>
            {/* Model output can carry a long link as easily as a minute can. */}
            <p className="mt-2 max-w-2xl text-body text-ink break-words">{interpretation.summary}</p>

            <h3 className="mt-5 text-label text-ink">Decisions</h3>
            {interpretation.decisions.length === 0 ? (
              <p className="mt-2 text-body-sm text-ink-muted">No decisions were identified.</p>
            ) : (
              <ol className="mt-2 flex max-w-2xl list-decimal flex-col gap-1.5 pl-5 text-body text-ink break-words">
                {interpretation.decisions.map((decision) => (
                  <li key={decision.id}>{decision.text}</li>
                ))}
              </ol>
            )}

            {minute.processing.processedAtLabel && (
              <p className="mt-4 text-caption text-ink-muted">
                Generated {minute.processing.processedAtLabel}.
              </p>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
