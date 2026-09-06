'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Field } from '@/components/forms/field';
import { Checkbox, Input } from '@/components/forms/inputs';
import { Alert } from '@/components/feedback/alert';
import { DEFAULT_ROUTE } from '@/components/shell/navigation';
import { useSession } from './session-provider';

/**
 * FE-0201 / FE-0205 — the sign-in form.
 *
 * Accessibility and password-manager behaviour are load-bearing here:
 * `autoComplete` hints let managers fill both fields, the form submits on
 * Enter because it is a real `<form>`, and failures are announced through a
 * live region rather than only rendered.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useSession();

  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const identifierRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const returnTo = searchParams.get('returnTo');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const result = await login({ identifier, password, rememberMe });

    if (result.status === 'success') {
      if (result.data.requiresTwoFactor) {
        router.push(`/two-factor${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`);
        return;
      }
      const user = result.data.user;
      router.replace(returnTo ?? (user ? DEFAULT_ROUTE[user.primaryRole] : '/dashboard'));
      return;
    }

    setSubmitting(false);

    if (result.status === 'validation_failure') {
      const next: Record<string, string> = {};
      for (const error of result.fieldErrors) {
        next[error.field] = `${error.message} ${error.guidance}`.trim();
      }
      setFieldErrors(next);
      setFormError(result.message);
      // Move focus to the first failing control so the error is not merely visible.
      (result.focusField === 'identifier' ? identifierRef : passwordRef).current?.focus();
      return;
    }

    if (result.status === 'permission_denied') {
      // `guidance` carries the route that explains the account state.
      if (result.guidance?.startsWith('/')) {
        router.push(result.guidance);
        return;
      }
      setFormError(result.message);
      return;
    }

    setFormError('Sign-in is unavailable right now. Try again in a moment.');
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* Announced on appearance; the fields carry their own messages too. */}
      <div aria-live="assertive">
        {formError && (
          <Alert tone="danger" title={formError}>
            Check the highlighted fields below.
          </Alert>
        )}
      </div>

      <Field
        label="Email or employee ID"
        required
        error={fieldErrors.identifier}
        helperText="For example nadia.rahman@demo.local or EMP-1001."
      >
        <Input
          ref={identifierRef}
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="you@powerinai.com"
        />
      </Field>

      <Field label="Password" required error={fieldErrors.password}>
        <div className="flex items-center gap-2">
          <Input
            ref={passwordRef}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            enterKeyHint="go"
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

      <div className="flex items-center justify-between gap-3">
        <Checkbox
          label="Remember me"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        <Link
          href="/forgot-password"
          className="inline-flex min-h-6 items-center rounded-xs text-body-sm text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
        {submitting ? 'Signing in' : 'Sign in'}
      </Button>

      <p className="text-caption text-ink-muted">
        Trouble signing in? Contact your administrator or the HR team. Repeated
        failed attempts lock the account.
      </p>
    </form>
  );
}
