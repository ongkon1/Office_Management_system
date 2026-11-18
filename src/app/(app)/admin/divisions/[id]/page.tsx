'use client';

import { use } from 'react';
import { DivisionDetail } from '@/features/admin/division-detail';

export default function AdminDivisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DivisionDetail divisionId={id} />;
}
