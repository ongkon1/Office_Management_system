import { drizzle } from 'drizzle-orm/mysql2';
import mysql, { type Pool } from 'mysql2/promise';

import { parseDatabaseEnvironment } from '@/server/config/database';

function createDrizzleClient(pool: Pool) {
  return drizzle({ client: pool, casing: 'snake_case' });
}

export interface DatabaseClient {
  readonly pool: Pool;
  readonly db: ReturnType<typeof createDrizzleClient>;
  close(): Promise<void>;
}

export function createDatabaseClient(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseClient {
  const config = parseDatabaseEnvironment(environment);
  const url = new URL(config.DATABASE_URL);
  const pool = mysql.createPool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: config.DATABASE_POOL_LIMIT,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    decimalNumbers: false,
    timezone: 'Z',
    charset: 'utf8mb4',
  });

  return {
    pool,
    db: createDrizzleClient(pool),
    close: () => pool.end(),
  };
}
