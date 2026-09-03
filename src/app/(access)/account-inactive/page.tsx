import type { Metadata } from 'next';
import { AccountInactiveScreen } from '@/features/access/account-state';

export const metadata: Metadata = { title: 'Account inactive' };

export default function AccountInactivePage() {
  return <AccountInactiveScreen />;
}
