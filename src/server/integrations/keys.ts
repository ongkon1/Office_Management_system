import { createHash } from 'node:crypto';
import type { KeyProvider } from '@/server/security/crypto';

/**
 * Encryption keys for integration secrets at rest (`BE-0731`, `BE-0734`):
 * webhook signing secrets and OAuth tokens are stored AES-256-GCM encrypted
 * and never returned after creation.
 *
 * `INTEGRATION_ENCRYPTION_KEYS` is a comma-separated `id:base64key` list, the
 * first being current; older ids stay readable so keys rotate without
 * re-encrypting everything at once. Production requires it. Development and
 * tests derive a key from the authentication secret under a separate label,
 * so the two key spaces never coincide.
 */
export function integrationKeyProvider(environment: NodeJS.ProcessEnv = process.env): KeyProvider {
  const configured = (environment.INTEGRATION_ENCRYPTION_KEYS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  if (configured.length) {
    const keys = configured.map((entry) => {
      const [id, encoded] = entry.split(':');
      const key = Buffer.from(encoded ?? '', 'base64');
      if (!id || !/^[a-z0-9-]{1,32}$/i.test(id) || key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_KEYS entries must be id:base64(32 bytes)');
      return { id, key };
    });
    return { current: () => keys[0], byId: (id) => keys.find((entry) => entry.id === id)?.key };
  }
  if (environment.NODE_ENV === 'production') throw new Error('INTEGRATION_ENCRYPTION_KEYS is required in production');
  const secret = environment.BETTER_AUTH_SECRET ?? 'development-only-integration-secret-not-for-production';
  const key = createHash('sha256').update(`integrations:${secret}`).digest();
  return { current: () => ({ id: 'derived-v1', key }), byId: (id) => (id === 'derived-v1' ? key : undefined) };
}
