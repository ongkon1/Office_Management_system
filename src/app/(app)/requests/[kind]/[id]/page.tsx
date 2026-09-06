'use client';
import { use } from 'react';
import { RequestDetail } from '@/features/team-lead/people-operations';
export default function RequestDetailPage({ params }: { params: Promise<{ kind: string; id: string }> }) { const { kind, id } = use(params); if (kind !== 'wfh' && kind !== 'leave') return null; return <RequestDetail kind={kind} requestId={id} />; }
