import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoAccountPicker } from './demo-account-picker';

const login = vi.fn();
const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

vi.mock('./session-provider', () => ({
  useSession: () => ({ login }),
}));

describe('database-backed demo account picker', () => {
  beforeEach(() => {
    login.mockReset();
    replace.mockReset();
    push.mockReset();
  });

  it('signs in with the identifier created by the development seed', async () => {
    login.mockResolvedValue({
      status: 'success',
      data: {
        requiresTwoFactor: false,
        user: { primaryRole: 'super_admin' },
      },
    });
    render(<DemoAccountPicker />);
    fireEvent.click(screen.getByRole('button', { name: /Demo accounts/i }));
    fireEvent.click(screen.getByRole('button', { name: /Amina Rahman/i }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        identifier: 'admin@powerin.ai',
        password: 'Demo1234!',
        rememberMe: false,
      }),
    );
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByText('Nadia Rahman')).not.toBeInTheDocument();
  });

  it('shows recovery guidance instead of failing silently', async () => {
    login.mockResolvedValue({
      status: 'validation_failure',
      code: 'VALIDATION_FAILED',
      message: 'Sign-in failed.',
      fieldErrors: [],
    });
    render(<DemoAccountPicker />);
    fireEvent.click(screen.getByRole('button', { name: /Demo accounts/i }));
    fireEvent.click(screen.getByRole('button', { name: /Nadia Islam/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('npm run db:seed');
  });
});
