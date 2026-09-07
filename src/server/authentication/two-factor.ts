import { randomOpaqueToken, secretHash } from '@/server/security/crypto';

export interface TwoFactorProvider {
  beginEnrollment(userId: string): Promise<{ readonly encryptedSecret: string; readonly provisioningUri: string }>;
  verifyTotp(encryptedSecret: string, code: string): Promise<boolean>;
}
export interface TwoFactorStore {
  saveEnrollment(userId: string, encryptedSecret: string, recoveryHashes: readonly string[]): Promise<void>;
  load(userId: string): Promise<{ readonly encryptedSecret: string; readonly recoveryHashes: readonly string[] } | null>;
  consumeRecoveryCode(userId: string, hash: string): Promise<boolean>;
  disable(userId: string): Promise<void>;
}
export interface TwoFactorAudit { record(userId: string, action: 'enrolled' | 'verified' | 'recovery_used' | 'reset'): Promise<void> }

export class TwoFactorService {
  constructor(private readonly provider: TwoFactorProvider, private readonly store: TwoFactorStore, private readonly audit?: TwoFactorAudit) {}
  async enroll(userId: string) {
    const enrollment = await this.provider.beginEnrollment(userId);
    const recoveryCodes = Array.from({ length: 10 }, () => randomOpaqueToken(9));
    await this.store.saveEnrollment(userId, enrollment.encryptedSecret, recoveryCodes.map(secretHash));
    await this.audit?.record(userId, 'enrolled');
    return { provisioningUri: enrollment.provisioningUri, recoveryCodes };
  }
  async verify(userId: string, code: string): Promise<boolean> {
    const state = await this.store.load(userId); if (!state) return false;
    const verified = await this.provider.verifyTotp(state.encryptedSecret, code);
    if (verified) await this.audit?.record(userId, 'verified');
    return verified;
  }
  async recover(userId: string, code: string): Promise<boolean> { const used=await this.store.consumeRecoveryCode(userId, secretHash(code)); if(used) await this.audit?.record(userId,'recovery_used'); return used; }
  async reset(userId: string, authorizedByUserId: string) {
    if (userId !== authorizedByUserId) throw new Error('A separately authorized administrative reset workflow is required');
    await this.store.disable(userId);
    await this.audit?.record(userId, 'reset');
  }
}
