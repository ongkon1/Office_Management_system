'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/forms/field';
import { Input } from '@/components/forms/inputs';
import { Alert } from '@/components/feedback/alert';
import { AccordionItem } from '@/components/feedback/disclosure';
import { DEFAULT_ROUTE } from '@/components/shell/navigation';
import { serverAuthService } from '@/services/server/auth';
import { useSession } from './session-provider';

const CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 64;
const TWO_FACTOR_RESEND_SECONDS = 30;

/**
 * FE-0203 — two-factor verification.
 *
 * The code field is one input rather than six boxes: split inputs break
 * password managers, paste, and screen-reader navigation, and buy nothing a
 * `inputMode="numeric"` field with a character limit does not already give.
 */
export function TwoFactorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyTwoFactor } = useSession();

  const [code, setCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secondsUntilResend, setSecondsUntilResend] = React.useState(TWO_FACTOR_RESEND_SECONDS);
  const [resent, setResent] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const returnTo = searchParams.get('returnTo');

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (secondsUntilResend <= 0) return;
    const id = window.setInterval(() => {
      setSecondsUntilResend((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [secondsUntilResend]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await verifyTwoFactor(code);

    if (result.status === 'success') {
      router.replace(returnTo ?? DEFAULT_ROUTE[result.data.primaryRole]);
      return;
    }

    setSubmitting(false);
    setCode('');
    inputRef.current?.focus();

    if (result.status === 'validation_failure') {
      const first = result.fieldErrors[0];
      setError(first ? `${first.message} ${first.guidance}` : result.message);
      return;
    }

    if (result.status === 'unauthenticated') {
      setError('Your sign-in attempt expired. Start again from the sign-in page.');
      return;
    }

    setError('Verification is unavailable right now. Try again in a moment.');
  }

  async function handleResend() {
    await serverAuthService.resendTwoFactorCode();
    setSecondsUntilResend(TWO_FACTOR_RESEND_SECONDS);
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div aria-live="assertive">
        {error && <Alert tone="danger" title={error} />}
      </div>
      <div aria-live="polite">
        {resent && !error && (
          <Alert tone="info" title="You can now use the newest authenticator code." />
        )}
      </div>

      <Field
        label="Verification code"
        required
        helperText={`Enter the ${CODE_LENGTH}-digit authenticator code or an unused recovery code.`}
      >
        <Input
          ref={inputRef}
          name="one-time-code"
          type="text"
          autoComplete="one-time-code"
          maxLength={MAX_CODE_LENGTH}
          enterKeyHint="go"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
          className="text-center text-h2 tracking-[0.4em] tabular"
          placeholder="000000 or recovery code"
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={submitting}
        disabled={code.length < CODE_LENGTH}
      >
        Verify and sign in
      </Button>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="link"
          size="sm"
          disabled={secondsUntilResend > 0}
          onClick={handleResend}
        >
          {secondsUntilResend > 0
            ? `Resend code in ${secondsUntilResend}s`
            : 'Check for a new code'}
        </Button>
        <Button variant="link" size="sm" onClick={() => router.push('/login')}>
          Back to sign in
        </Button>
      </div>

      <div className="border-t border-border pt-1">
        <AccordionItem title="I cannot access my authenticator">
          Use one of the recovery codes issued when you enrolled — each works once.
          If you have none left, contact your administrator, who can reset two-factor
          authentication after verifying your identity. The reset is recorded in the
          audit log.
        </AccordionItem>
      </div>

    </form>
  );
}
