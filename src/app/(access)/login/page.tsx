import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Spinner } from '@/components/ui/progress';
import { AuthLayout } from '@/features/access/auth-layout';
import { LoginForm } from '@/features/access/login-form';
import { DemoAccountPicker } from '@/features/access/demo-account-picker';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to the multi-division timesheet and work management system.',
};

export default function LoginPage() {
  return (
    <AuthLayout
      title="Sign in"
      description="Use your work email or employee ID."
      footer={
        <span className="text-ink-muted">
          Need an account?{' '}
          <Link
            href="/forgot-password"
            className="inline-flex min-h-6 items-center rounded-xs text-accent underline underline-offset-2"
          >
            Contact your administrator
          </Link>
        </span>
      }
      aside={<DemoAccountPicker />}
    >
      {/* useSearchParams needs a Suspense boundary during prerendering. */}
      <React.Suspense fallback={<Spinner label="Loading sign-in form" />}>
        <LoginForm />
      </React.Suspense>
    </AuthLayout>
  );
}
