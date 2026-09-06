'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CircleCheck, Eye, EyeOff } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Field } from '@/components/forms/field';
import { Input } from '@/components/forms/inputs';
import { Alert, Callout } from '@/components/feedback/alert';
import { EmptyState } from '@/components/feedback/alert';
import { mockAuthService, DEMO_RESET_TOKENS } from '@/services/mock/auth';
import { isDemoMode } from './demo-mode';

/* -------------------------------------------------------------------------- */
/* Forgot password (FE-0202)                                                  */
/* -------------------------------------------------------------------------- */

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    await mockAuthService.requestPasswordReset({ email });
    setSubmitting(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        {/*
          The confirmation is deliberately identical whether or not the address
          exists. Saying "no account found" would turn this form into an
          account-enumeration oracle (REQ-NFR-SEC-002).
        */}
        <Alert tone="success" title="Check your email" live>
          If an account exists for <strong>{email}</strong>, a reset link is on its way.
          The link is valid for one hour and can be used once.
        </Alert>

        <p className="text-body-sm text-ink-muted">
          Nothing arrived? Check your spam folder, or try again in a few minutes.
        </p>

        {isDemoMode() && (
          <Callout tone="info">
            Demo: open a{' '}
            <Link
              className="underline underline-offset-2"
              href={`/reset-password?token=${DEMO_RESET_TOKENS.valid}`}
            >
              valid link
            </Link>
            ,{' '}
            <Link
              className="underline underline-offset-2"
              href={`/reset-password?token=${DEMO_RESET_TOKENS.expired}`}
            >
              expired link
            </Link>
            , or{' '}
            <Link
              className="underline underline-offset-2"
              href={`/reset-password?token=${DEMO_RESET_TOKENS.invalid}`}
            >
              invalid link
            </Link>
            .
          </Callout>
        )}

        <Button variant="secondary" fullWidth onClick={() => setSent(false)}>
          Use a different address
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label="Email address"
        required
        helperText="We will send a single-use link valid for one hour."
      >
        <Input
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@powerinai.com"
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
        Send reset link
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Reset password (FE-0202)                                                   */
/* -------------------------------------------------------------------------- */

const MIN_PASSWORD_LENGTH = 12;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [outcome, setOutcome] = React.useState<'done' | 'expired' | 'invalid' | null>(null);

  if (!token) {
    return (
      <EmptyState
        variant="error"
        title="This link is incomplete"
        description="The reset link is missing its token. Request a new one from the forgot-password page."
      />
    );
  }

  if (outcome === 'expired') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="warning" title="This reset link has expired" live>
          Reset links are valid for one hour and can be used once. Request a new one to continue.
        </Alert>
        <Button variant="primary" fullWidth onClick={() => router.push('/forgot-password')}>
          Request a new link
        </Button>
      </div>
    );
  }

  if (outcome === 'invalid') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger" title="This reset link is not valid" live>
          It may already have been used, or replaced by a newer link. Request a new one to continue.
        </Alert>
        <Button variant="primary" fullWidth onClick={() => router.push('/forgot-password')}>
          Request a new link
        </Button>
      </div>
    );
  }

  if (outcome === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CircleCheck aria-hidden className="size-8 text-success" />
          <div>
            <p className="text-body font-semibold text-ink">Password updated</p>
            <p className="mt-1 text-body-sm text-ink-muted">
              All other sessions have been signed out. Use your new password to sign in.
            </p>
          </div>
        </div>
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/login')}>
          Go to sign in
        </Button>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const errors: Record<string, string> = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters. Longer passphrases are stronger than short complex ones.`;
    }
    if (confirm !== password) {
      errors.confirm = 'The two passwords do not match. Retype them so they are identical.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const result = await mockAuthService.resetPassword({ token, password });
    setSubmitting(false);

    if (result.status === 'success') setOutcome('done');
    else if (result.status === 'conflict') setOutcome('expired');
    else setOutcome('invalid');
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label="New password"
        required
        error={fieldErrors.password}
        helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      >
        <div className="flex items-center gap-2">
          <Input
            name="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="flex-1"
          />
          <IconButton
            label={showPassword ? 'Hide password' : 'Show password'}
            variant="secondary"
            icon={
              showPassword ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )
            }
            onClick={() => setShowPassword((value) => !value)}
          />
        </div>
      </Field>

      <Field label="Confirm new password" required error={fieldErrors.confirm}>
        <Input
          name="confirm-password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          enterKeyHint="go"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
        Update password
      </Button>
    </form>
  );
}
