'use client';

import { useSession } from './session-provider';

/**
 * The signed-in employee's id.
 *
 * Screens take the employee from the session rather than a prop or a URL, so a
 * page cannot be pointed at someone else's records by editing the address.
 */
export function useEmployeeId(): string | null {
  const { user } = useSession();
  return user?.employeeId ?? null;
}
