'use client';
import { use } from 'react';
import { ReportBuilder } from '@/features/reports/report-builder';
export default function ReportPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return <ReportBuilder reportKey={key} />;
}
