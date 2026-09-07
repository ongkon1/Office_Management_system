import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { TwoFactorStore } from './two-factor';

interface TwoFactorRow extends RowDataPacket { encrypted_totp_secret:string; recovery_code_hashes:string | readonly string[] }

export class MysqlTwoFactorStore implements TwoFactorStore {
  constructor(private readonly pool: Pool) {}
  async saveEnrollment(userId:string, encryptedSecret:string, recoveryHashes:readonly string[]) {
    const connection=await this.pool.getConnection();
    try { await connection.beginTransaction();
      await connection.execute(`INSERT INTO auth_two_factor(user_id,encrypted_totp_secret,recovery_code_hashes,enabled_at) VALUES(?,?,CAST(? AS JSON),UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE encrypted_totp_secret=VALUES(encrypted_totp_secret),recovery_code_hashes=VALUES(recovery_code_hashes),enabled_at=VALUES(enabled_at),version=version+1`,[userId,encryptedSecret,JSON.stringify(recoveryHashes)]);
      await connection.execute(`UPDATE users SET two_factor_enabled=TRUE WHERE id=?`,[userId]); await connection.commit();
    } catch(error){await connection.rollback();throw error;} finally {connection.release();}
  }
  async load(userId:string){const [rows]=await this.pool.execute<TwoFactorRow[]>(`SELECT encrypted_totp_secret,recovery_code_hashes FROM auth_two_factor WHERE user_id=? LIMIT 1`,[userId]);const row=rows[0];if(!row)return null;return {encryptedSecret:row.encrypted_totp_secret,recoveryHashes:parseHashes(row.recovery_code_hashes)};}
  async consumeRecoveryCode(userId:string, hash:string){const connection=await this.pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.execute<TwoFactorRow[]>(`SELECT encrypted_totp_secret,recovery_code_hashes FROM auth_two_factor WHERE user_id=? FOR UPDATE`,[userId]);const row=rows[0];if(!row){await connection.rollback();return false;}const hashes=parseHashes(row.recovery_code_hashes);const index=hashes.indexOf(hash);if(index<0){await connection.rollback();return false;}hashes.splice(index,1);await connection.execute(`UPDATE auth_two_factor SET recovery_code_hashes=CAST(? AS JSON),version=version+1 WHERE user_id=?`,[JSON.stringify(hashes),userId]);await connection.commit();return true;}catch(error){await connection.rollback();throw error;}finally{connection.release();}}
  async disable(userId:string){const connection=await this.pool.getConnection();try{await connection.beginTransaction();await connection.execute(`DELETE FROM auth_two_factor WHERE user_id=?`,[userId]);await connection.execute(`UPDATE users SET two_factor_enabled=FALSE WHERE id=?`,[userId]);await connection.commit();}catch(error){await connection.rollback();throw error;}finally{connection.release();}}
}

function parseHashes(value:string|readonly string[]):string[]{const parsed=typeof value==='string'?JSON.parse(value) as unknown:value;if(!Array.isArray(parsed)||!parsed.every(item=>typeof item==='string'))throw new Error('Invalid recovery-code storage');return [...parsed];}
