import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { hasPermission, type ActorPolicyContext } from '@/server/authorization/policy';
import { recordAudit } from '@/server/audit/record';
import { conflict, denied, guarded, invalid } from './results';

/**
 * Server-owned module switches (`BE-0714` "when enabled", `BE-0732` "when
 * approved"). Messaging and external integrations ship **off** in migration
 * `0014`, matching the frontend defaults. The browser's feature-flag store
 * only hides navigation; this is the switch the services obey.
 */
export const SERVER_MODULES = ['messages', 'integrations'] as const;
export type ServerModuleKey = (typeof SERVER_MODULES)[number];

export async function isModuleEnabled(db: Pick<Pool | PoolConnection, 'execute'>, key: ServerModuleKey): Promise<boolean> {
  const [rows] = await db.execute<(RowDataPacket & { is_enabled: number })[]>('SELECT is_enabled FROM module_settings WHERE module_key=?', [key]);
  return Boolean(rows[0]?.is_enabled);
}

export interface ModuleSettingView {
  readonly key: ServerModuleKey;
  readonly isEnabled: boolean;
  readonly version: number;
}

export class ModuleSettings {
  constructor(private readonly pool: Pool) {}

  list(): Promise<Result<readonly ModuleSettingView[]>> {
    return guarded(async () => {
      const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT module_key,is_enabled,version FROM module_settings ORDER BY module_key');
      return success(rows.map((row) => ({ key: row.module_key as ServerModuleKey, isEnabled: Boolean(row.is_enabled), version: Number(row.version) })));
    });
  }

  /** Super Administrator, or a holder of `module.manage`; always with a reason. */
  set(actor: ActorPolicyContext, key: ServerModuleKey, enabled: boolean, reason: string, expectedVersion: number): Promise<Result<ModuleSettingView>> {
    return guarded(async () => {
      if (!(actor.roles.includes('super_admin') || hasPermission(actor, 'module.manage'))) return denied('Only a Super Administrator can switch modules on or off.');
      if (!SERVER_MODULES.includes(key)) return invalid('key', 'Choose a module.', 'Messaging or integrations.');
      if (!reason.trim()) return invalid('reason', 'Say why the module is changing.', 'The reason is kept in the audit trail.');
      const [result] = await this.pool.execute<ResultSetHeader>(
        'UPDATE module_settings SET is_enabled=?,reason=?,updated_by_user_id=?,version=version+1 WHERE module_key=? AND version=?',
        [enabled, reason.trim(), actor.userId, key, expectedVersion]);
      if (!result.affectedRows) return conflict('The setting changed since you opened it.', 'Reload and try again.');
      await recordAudit(this.pool, { actorUserId: actor.userId, action: enabled ? 'module.enabled' : 'module.disabled', resourceType: 'module', resourceId: null, scope: { key }, reason: reason.trim() });
      return success({ key, isEnabled: enabled, version: expectedVersion + 1 });
    });
  }
}
