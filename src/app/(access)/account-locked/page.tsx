import type { Metadata } from 'next';
import { AccountLockedScreen } from '@/features/access/account-state';

export const metadata: Metadata = { title: 'Account locked' };

export default function AccountLockedPage() {
  return <AccountLockedScreen />;
}
