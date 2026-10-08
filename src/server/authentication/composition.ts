import type { Pool } from 'mysql2/promise';
import { AuthenticationRateLimiter } from './rate-limit';
import { AuthenticationService } from './service';
import { MysqlAuthenticationStore } from './mysql-store';
import { MysqlTwoFactorStore } from './mysql-two-factor-store';
import { TwoFactorService } from './two-factor';
import { EncryptedTotpProvider } from './totp-provider';

export function createAuthenticationService(pool: Pool) {
  const store=new MysqlAuthenticationStore(pool);
  return new AuthenticationService(store,()=>new Date(),new AuthenticationRateLimiter(store));
}

export function createTwoFactorService(pool:Pool){return new TwoFactorService(new EncryptedTotpProvider(),new MysqlTwoFactorStore(pool));}
