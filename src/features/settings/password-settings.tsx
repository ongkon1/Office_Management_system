'use client';

import * as React from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { serverAuthService } from '@/services/server/auth';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert } from '@/components/feedback/alert';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input } from '@/components/forms/inputs';
import { Button, IconButton } from '@/components/ui/button';

const MIN_PASSWORD_LENGTH = 12;

export function PasswordSettings() {
  const { user } = useSession();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPasswords, setShowPasswords] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [failure, setFailure] = React.useState<string | null>(null);

  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    const localErrors: { field: string; message: string }[] = [];
    if (!currentPassword) {
      localErrors.push({ field: 'currentPassword', message: 'Enter your current password.' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      localErrors.push({
        field: 'newPassword',
        message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }
    if (confirmPassword !== newPassword) {
      localErrors.push({
        field: 'confirmPassword',
        message: 'The new passwords do not match. Retype them so they are identical.',
      });
    }
    setErrors(localErrors);
    if (localErrors.length > 0 || !user) return;

    setSaving(true);
    const result = await serverAuthService.changePassword({
      userId: user.userId,
      currentPassword,
      newPassword,
    });
    setSaving(false);
    if (result.status === 'success') {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrors([]);
      toast.show({
        tone: 'success',
        title: 'Password changed',
        description: 'Use the new password the next time you sign in.',
      });
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(result.fieldErrors.map((error) => ({
        field: error.field,
        message: `${error.message} ${error.guidance}`,
      })));
      return;
    }
    setFailure('guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message);
  }

  return (
    <Card className="mt-5 max-w-2xl">
      <CardHeader
        title="Change password"
        description="Confirm your current password, then choose a new password for your account."
        actions={<KeyRound aria-hidden className="size-5 text-primary" />}
      />
      <form className="mt-5 space-y-4" noValidate onSubmit={submit}>
        <FormErrorSummary errors={errors} />
        {failure && <Alert tone="danger" title="Password not changed" live>{failure}</Alert>}
        <Field label="Current password" required error={fieldError('currentPassword')}>
          <Input
            name="current-password"
            type={showPasswords ? 'text' : 'password'}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field
          label="New password"
          required
          helperText={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}
          error={fieldError('newPassword')}
        >
          <div className="flex items-center gap-2">
            <Input
              name="new-password"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="flex-1"
            />
            <IconButton
              label={showPasswords ? 'Hide passwords' : 'Show passwords'}
              variant="secondary"
              icon={showPasswords
                ? <EyeOff aria-hidden className="size-4" />
                : <Eye aria-hidden className="size-4" />}
              onClick={() => setShowPasswords((value) => !value)}
            />
          </div>
        </Field>
        <Field label="Confirm new password" required error={fieldError('confirmPassword')}>
          <Input
            name="confirm-new-password"
            type={showPasswords ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary" loading={saving}>
          Change password
        </Button>
      </form>
    </Card>
  );
}
