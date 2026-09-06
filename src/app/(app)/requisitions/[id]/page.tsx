'use client';

import * as React from 'react';
import { RequisitionDetail } from '@/features/requisition/requisition-detail';

export default function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  return <RequisitionDetail requisitionId={id} />;
}
