import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthAccount, AuthenticationStore } from './service';
import type { RateLimitStore } from './rate-limit';

interface AccountRow extends RowDataPacket { user_id: string; status: AuthAccount['state']; password_hash: string; failed_login_count: number; locked_until: Date | null; two_factor_enabled: number }
interface SessionRow extends RowDataPacket { id: string; user_id: string; expires_at: Date; revoked_at: Date | null; last_seen_at: Date }

export class MysqlAuthenticationStore implements AuthenticationStore, RateLimitStore {
  constructor(private readonly pool: Pool) {}
  async findAccount(identifierNormalized: string): Promise<AuthAccount | null> {
    const [rows] = await this.pool.execute<AccountRow[]>(`SELECT u.id user_id,u.status,a.password_hash,u.failed_login_count,u.locked_until,u.two_factor_enabled
      FROM users u JOIN auth_accounts a ON a.user_id=u.id AND a.provider_id='credential' WHERE u.email_normalized=? LIMIT 1`, [identifierNormalized]);
    const row = rows[0]; return row ? { userId: row.user_id, state: row.status, passwordHash: row.password_hash, failedCount: row.failed_login_count, lockedUntil: row.locked_until, twoFactorEnabled: Boolean(row.two_factor_enabled) } : null;
  }
  async recordAttempt(input: { userId: string | null; identifierHash: string; outcome: string; originHash: string; correlationId: string }) {
    await this.pool.execute(`INSERT INTO login_history(user_id,identifier_hash,outcome,ip_address) VALUES(?,?,?,?)`, [input.userId,input.identifierHash,input.outcome,input.originHash]);
    await this.pool.execute(`INSERT INTO auth_security_events(user_id,event_type,identifier_hash,ip_hash,correlation_id,safe_details) VALUES(?,?,?,?,?,JSON_OBJECT('outcome',?))`, [input.userId,'login_attempt',input.identifierHash,input.originHash,input.correlationId,input.outcome]);
  }
  async recordSecurityEvent(input: {userId:string|null;eventType:string;identifierHash?:string|null;originHash?:string|null;correlationId:string}) { await this.pool.execute(`INSERT INTO auth_security_events(user_id,event_type,identifier_hash,ip_hash,correlation_id,safe_details) VALUES(?,?,?,?,?,JSON_OBJECT())`,[input.userId,input.eventType,input.identifierHash??null,input.originHash??null,input.correlationId]); }
  async registerFailure(userId: string, lockedUntil: Date | null) { await this.pool.execute(`UPDATE users SET failed_login_count=failed_login_count+1,locked_until=?,status=IF(? IS NULL,status,'locked') WHERE id=?`, [lockedUntil,lockedUntil,userId]); }
  async clearFailures(userId: string) { await this.pool.execute(`UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=UTC_TIMESTAMP(6),status=IF(status='locked','active',status) WHERE id=?`, [userId]); }
  async createSession(input: { id: string; userId: string; tokenHash: string; expiresAt: Date; originHash: string; rotatedFrom: string | null }) { await this.pool.execute(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,ip_address,rotated_from_session_id) VALUES(?,?,?,?,?,?)`, [input.id,input.userId,input.tokenHash,input.expiresAt,input.originHash,input.rotatedFrom]); }
  async findSession(tokenHash: string) { const [rows] = await this.pool.execute<SessionRow[]>(`SELECT id,user_id,expires_at,revoked_at,last_seen_at FROM auth_sessions WHERE token_hash=? LIMIT 1`, [tokenHash]); const row=rows[0]; return row ? {id:row.id,userId:row.user_id,expiresAt:row.expires_at,revokedAt:row.revoked_at,lastSeenAt:row.last_seen_at}:null; }
  async touchSession(id: string, seenAt: Date) { await this.pool.execute(`UPDATE auth_sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL`,[seenAt,id]); }
  async revokeSession(tokenHash: string) { await this.pool.execute(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(6)) WHERE token_hash=?`, [tokenHash]); }
  async revokeAllSessions(userId: string) { await this.pool.execute(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(6)) WHERE user_id=?`,[userId]); }
  async saveReset(input: { identifierHash: string; tokenHash: string; expiresAt: Date }) { await this.pool.execute(`INSERT INTO auth_verifications(id,identifier_hash,value_hash,purpose,expires_at) VALUES(UUID(),?,?,'password_reset',?)`, [input.identifierHash,input.tokenHash,input.expiresAt]); }
  async consumeReset(identifierHash: string, tokenHash: string, passwordHash: string): Promise<boolean> {
    const connection = await this.pool.getConnection(); try { await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(`UPDATE auth_verifications SET consumed_at=UTC_TIMESTAMP(6) WHERE identifier_hash=? AND value_hash=? AND purpose='password_reset' AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP(6)`, [identifierHash,tokenHash]);
      if (result.affectedRows !== 1) { await connection.rollback(); return false; }
      await connection.execute(`UPDATE auth_accounts a JOIN users u ON u.id=a.user_id SET a.password_hash=? WHERE SHA2(u.email_normalized,256)=? AND a.provider_id='credential'`, [passwordHash,identifierHash]);
      await connection.execute(`UPDATE auth_sessions s JOIN users u ON u.id=s.user_id SET s.revoked_at=COALESCE(s.revoked_at,UTC_TIMESTAMP(6)) WHERE SHA2(u.email_normalized,256)=?`, [identifierHash]);
      await connection.commit(); return true;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  async increment(key: string, action: string, windowSeconds: number, maximum: number, now: Date) {
    const scope = key.length === 64 ? key : (await import('@/server/security/crypto')).secretHash(key);
    await this.pool.execute(`INSERT INTO auth_rate_limits(scope_key,action_key,window_started_at,attempt_count) VALUES(?,?,?,1)
      ON DUPLICATE KEY UPDATE attempt_count=IF(window_started_at<DATE_SUB(VALUES(window_started_at),INTERVAL ? SECOND),1,attempt_count+1),window_started_at=IF(window_started_at<DATE_SUB(VALUES(window_started_at),INTERVAL ? SECOND),VALUES(window_started_at),window_started_at)`, [scope,action,now,windowSeconds,windowSeconds]);
    const [rows] = await this.pool.execute<(RowDataPacket & { attempt_count: number; retry_after: number })[]>(`SELECT attempt_count,GREATEST(0,?-TIMESTAMPDIFF(SECOND,window_started_at,?)) retry_after FROM auth_rate_limits WHERE scope_key=? AND action_key=?`, [windowSeconds,now,scope,action]);
    return { allowed: rows[0].attempt_count <= maximum, retryAfterSeconds: rows[0].retry_after };
  }
}
