import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthLayout } from '@/features/access/auth-layout';
import { ForgotPasswordForm } from '@/features/access/password-forms';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your work email and we will send you a link to set a new password."
      footer={
        <Link
          href="/login"
          className="inline-flex min-h-6 items-center rounded-xs text-accent underline underline-offset-2"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
