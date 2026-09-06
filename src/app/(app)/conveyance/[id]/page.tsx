'use client';

import * as React from 'react';
import { ConveyanceDetail } from '@/features/conveyance/conveyance-detail';

export default function ConveyanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  return <ConveyanceDetail claimId={id} />;
}
