'use client';

import * as React from 'react';
import { MeetingMinuteDetail } from '@/features/meeting-minutes/meeting-minute-detail';

export default function MeetingMinutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <MeetingMinuteDetail minuteId={id} />;
}
