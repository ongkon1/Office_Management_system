import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Spinner } from '@/components/ui/progress';
import { AuthLayout } from '@/features/access/auth-layout';
import { ResetPasswordForm } from '@/features/access/password-forms';

export const metadata: Metadata = { title: 'Set a new password' };

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Set a new password"
      description="Choose a password you have not used on this system before."
      footer={
        <Link
          href="/login"
          className="inline-flex min-h-6 items-center rounded-xs text-accent underline underline-offset-2"
        >
          Back to sign in
        </Link>
      }
    >
      <React.Suspense fallback={<Spinner label="Loading" />}>
        <ResetPasswordForm />
      </React.Suspense>
    </AuthLayout>
  );
}
