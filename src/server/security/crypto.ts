import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { hashPassword as betterAuthHashPassword, verifyPassword as betterAuthVerifyPassword } from 'better-auth/crypto';

export async function hashPassword(password: string): Promise<string> {
  return betterAuthHashPassword(password.normalize('NFKC'));
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try { return await betterAuthVerifyPassword({ password: password.normalize('NFKC'), hash: encoded }); }
  catch { return false; }
}

export function randomOpaqueToken(bytes = 32): string { return randomBytes(bytes).toString('base64url'); }
export function secretHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export interface KeyProvider { current(): { readonly id: string; readonly key: Buffer }; byId(id: string): Buffer | undefined }

export function encryptSecret(plaintext: string, provider: KeyProvider): string {
  const { id, key } = provider.current();
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', id, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(envelope: string, provider: KeyProvider): string {
  const [version, id, iv, tag, ciphertext] = envelope.split('.');
  const key = id ? provider.byId(id) : undefined;
  if (version !== 'v1' || !key || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
