'use client';

import * as React from 'react';
import { MeetingMinuteDetail } from '@/features/meeting-minutes/meeting-minute-detail';

export default function MeetingMinutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  // Keyed by id, so moving to another minute is a fresh instance: the
  // detail keeps its data on screen while *this* minute refreshes, and
  // must never show one minute's data under another's address.
  return <MeetingMinuteDetail key={id} minuteId={id} />;
}
