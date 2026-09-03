import * as React from 'react';
import type { Metadata } from 'next';
import { Spinner } from '@/components/ui/progress';
import { AuthLayout } from '@/features/access/auth-layout';
import { TwoFactorForm } from '@/features/access/two-factor-form';

export const metadata: Metadata = { title: 'Two-factor verification' };

export default function TwoFactorPage() {
  return (
    <AuthLayout
      title="Verify it is you"
      description="This account requires a second step. Enter the code from your authenticator app."
    >
      <React.Suspense fallback={<Spinner label="Loading" />}>
        <TwoFactorForm />
      </React.Suspense>
    </AuthLayout>
  );
}
