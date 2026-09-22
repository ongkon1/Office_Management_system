'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import type { MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';
import { useToast } from '@/components/feedback/toast';
import { Callout } from '@/components/feedback/alert';
import { Button } from '@/components/ui/button';

function newIdempotencyKey(): string {
  return `mm-request-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * `FE-1131` — starting task generation for a minute saved without it.
 *
 * Rendered only when the service's `canRequestProcessing` is true, which it is
 * only for a Not Processed, unarchived minute the viewer may change — never
 * for Employee or Management/View-Only. The service refuses the same call
 * from anyone else, so hiding the button is the courtesy, not the control.
 *
 * Like the retry beside it, the request is busy for its whole length, ignores
 * repeat clicks and keeps one idempotency key until it succeeds, so a double
 * click starts one run (`REQ-MTG-023`). The page's announcer speaks the move
 * to Pending, so the toast is visual only.
 */
export function RequestProcessing({
  minute,
  userId,
  onChanged,
}: {
  minute: MeetingMinuteDetailView;
  userId: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [requesting, setRequesting] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const key = React.useRef<string | null>(null);

  if (!minute.actions.canRequestProcessing) return null;

  async function request() {
    if (requesting) return;
    setRequesting(true);
    setProblem(null);
    key.current ??= newIdempotencyKey();

    const result = await mockMeetingMinutesService.requestProcessing(userId, {
      minuteId: minute.id,
      expectedVersion: minute.version,
      idempotencyKey: key.current,
    });
    setRequesting(false);

    if (result.status === 'success') {
      key.current = null;
      toast.show({
        tone: 'success',
        title: 'Task generation queued',
        description: 'It runs in the background. The minute stays as it is.',
        announce: false,
      });
      onChanged();
      return;
    }
    setProblem(
      'guidance' in result && result.guidance ? `${result.message} ${result.guidance}` : result.message,
    );
  }

  return (
    <div className="mt-4">
      {problem && (
        <Callout tone="warning" className="mb-3">
          {problem}
        </Callout>
      )}
      <Button
        variant="secondary"
        loading={requesting}
        onClick={request}
        iconLeading={<Sparkles aria-hidden className="size-4" />}
      >
        {requesting ? 'Starting task generation' : 'Start task generation'}
      </Button>
    </div>
  );
}
