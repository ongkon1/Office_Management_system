'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { Callout } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';

/**
 * `FE-1124` — on a task's own page, where the task came from (`AC-MTG-010`).
 *
 * It renders **nothing** for an ordinary task: the service answers not found
 * when a task has no source minute, and that is the common case, not a
 * failure worth a message. For a generated task it says so in words, links the
 * minute when the viewer can read it, and says only that a minute exists when
 * they cannot — naming no title, client or project.
 *
 * The wording is deliberate. Task generation *created* the task and matching
 * *proposed* its assignee; neither decided who may see it or log time on it.
 * The sentence says what does — the task's project and assignment — so the
 * AI's part cannot be read as an authorization decision.
 */
export function TaskSourceMinute({ taskId }: { taskId: string }) {
  const { user } = useSession();
  const userId = user?.userId ?? '';
  const { state } = useAsync(
    () => mockMeetingMinutesService.getTaskSourceMinute(userId, taskId),
    [userId, taskId],
  );

  if (state.status !== 'success') return null;
  const source = state.data;

  return (
    <Callout tone="info" className="mt-4">
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral" icon={<Sparkles aria-hidden className="size-3.5 shrink-0" />}>
          AI-generated
        </Badge>
        <span>
          {source.access === 'visible' ? (
            <>
              Created by task generation from the meeting minute{' '}
              <Link
                href={source.href}
                className="inline-flex min-h-6 items-center rounded-xs font-medium text-accent underline underline-offset-2"
              >
                {source.title}
              </Link>
              {source.isArchived ? ' (archived)' : ''}.
            </>
          ) : (
            <>Created by task generation from a meeting minute you do not have access to.</>
          )}{' '}
          Who can see this task and log time on it follows its project and assignment, like any
          other task.
        </span>
      </span>
    </Callout>
  );
}
