import type { Metadata } from 'next';
import { SessionExpiredScreen } from '@/features/access/account-state';

export const metadata: Metadata = { title: 'Session expired' };

export default function SessionExpiredPage() {
  return <SessionExpiredScreen />;
}
