'use client';

import * as React from 'react';
import { MeetingMinuteEdit } from '@/features/meeting-minutes/meeting-minute-edit';

export default function EditMeetingMinutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  return <MeetingMinuteEdit minuteId={id} />;
}
