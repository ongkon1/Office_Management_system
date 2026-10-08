import type { Result } from '@/contracts/results';

/**
 * Honest production fallback for a frontend whose backend milestone has not
 * shipped yet. It prevents deterministic demo records from becoming live
 * application data while preserving the typed service boundary.
 */
export function unavailableService<T extends object>(label: string): T {
  return new Proxy({} as T, {
    get(_target, property) {
      if (property === 'then') return undefined;
      return async (): Promise<Result<never>> => ({
        status: 'error',
        code: 'DEPENDENCY_FAILED',
        message: `${label} is not available from the server yet.`,
        retryable: false,
      });
    },
  });
}

/** Combine a partial server adapter with an unavailable production fallback. */
export function partialService<T extends object>(server: Partial<T>, label: string): T {
  const unavailable = unavailableService<T>(label);
  return new Proxy({} as T, {
    get(_target, property) {
      return Reflect.get(server, property) ?? Reflect.get(unavailable, property);
    },
  });
}
