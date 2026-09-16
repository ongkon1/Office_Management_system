'use client';

import * as React from 'react';
import {
  MeetingMinutesList,
  MeetingMinutesListSkeleton,
} from '@/features/meeting-minutes/meeting-minutes-list';

export default function MeetingMinutesPage() {
  return (
    // The list reads its filters from the URL with `useSearchParams`, which
    // needs a Suspense boundary when the route is prerendered.
    <React.Suspense fallback={<MeetingMinutesListSkeleton />}>
      <MeetingMinutesList />
    </React.Suspense>
  );
}
