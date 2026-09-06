/**
 * Regrouping recorded time by the client its project is delivered for.
 *
 * This is *not* a second calculation. Active minutes are produced once, by
 * `src/lib/calculation/engine.ts`, and this module only re-buckets minutes that
 * engine already assigned to a project. It adds integer minutes and never
 * derives hours, so a client total can never disagree with the day it came
 * from.
 *
 * A client is a free-text label on a project (`REQ-WORK-001`), not an entity,
 * so the bucket key is the client name and `null` covers both a project with no
 * recorded client and time recorded against no project at all. That bucket is
 * reported rather than dropped, because the parts must still sum to the day.
 */
import type { ClientContributionView, DurationView } from '@/contracts/view-models';
import { NOT_RECORDED_LABEL } from '@/lib/format';
import { toDurationView } from '@/lib/status';

export interface ClientMinutes {
  readonly clientId: string | null;
  readonly activeMinutes: number;
}

/**
 * Builds the client split for one total.
 *
 * `activeMinutes` is the authoritative figure the split must reconcile to;
 * whatever `attributed` does not account for becomes unattributed time in the
 * `null` bucket.
 */
export function toClientContributions(
  activeMinutes: number,
  attributed: readonly ClientMinutes[],
): readonly ClientContributionView[] {
  const byClient = new Map<string | null, number>();
  let attributedMinutes = 0;

  for (const item of attributed) {
    if (item.activeMinutes <= 0) continue;
    byClient.set(item.clientId, (byClient.get(item.clientId) ?? 0) + item.activeMinutes);
    attributedMinutes += item.activeMinutes;
  }

  const unattributed = activeMinutes - attributedMinutes;
  if (unattributed > 0) {
    byClient.set(null, (byClient.get(null) ?? 0) + unattributed);
  }

  // Guard the divisor only; a zero total yields no buckets at all, so the
  // percentage is never actually read in that case.
  const divisor = activeMinutes || 1;

  return [...byClient.entries()]
    .map(([clientId, minutes]) => ({
      clientId,
      clientLabel: clientId ?? NOT_RECORDED_LABEL,
      active: toDurationView(minutes),
      sharePercent: Math.round((minutes / divisor) * 100),
    }))
    .sort(
      (a, b) =>
        b.active.minutes - a.active.minutes || a.clientLabel.localeCompare(b.clientLabel),
    );
}

export interface ClientSplitRow {
  readonly active: DurationView;
  readonly clientContributions: readonly ClientContributionView[];
}

/** Sums the per-day client splits of a set of rows into one split. */
export function sumClientContributions(
  rows: readonly ClientSplitRow[],
): readonly ClientContributionView[] {
  const activeMinutes = rows.reduce((total, row) => total + row.active.minutes, 0);
  const attributed = rows.flatMap((row) =>
    row.clientContributions.map((contribution) => ({
      clientId: contribution.clientId,
      activeMinutes: contribution.active.minutes,
    })),
  );
  return toClientContributions(activeMinutes, attributed);
}
