import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import mysql, { type Connection } from 'mysql2/promise';

export interface IsolatedDatabase {
  readonly name: string;
  readonly connection: Connection;
  dispose(): Promise<void>;
}

const safeDatabaseName = /^office_test_[a-f0-9]{12}$/;

export async function createIsolatedDatabase(): Promise<IsolatedDatabase> {
  const name = `office_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  if (!safeDatabaseName.test(name)) throw new Error('Unsafe generated database name');
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql';
  const admin = await mysql.createConnection(adminUrl);
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  const target = await mysql.createConnection({ uri: adminUrl.replace(/\/mysql$/, `/${name}`), multipleStatements: true, timezone: 'Z' });
  try {
    const migrationNames = readdirSync(join(process.cwd(), 'drizzle')).filter((entry) => /^\d{4}_.+\.sql$/.test(entry)).sort();
    for (const migrationName of migrationNames) {
      await target.query(readFileSync(join(process.cwd(), 'drizzle', migrationName), 'utf8'));
    }
  } catch (error) {
    await target.end();
    await admin.query(`DROP DATABASE \`${name}\``);
    await admin.end();
    throw error;
  }
  return {
    name,
    connection: target,
    async dispose() {
      await target.end();
      if (!safeDatabaseName.test(name)) throw new Error('Refusing unsafe database cleanup');
      await admin.query(`DROP DATABASE \`${name}\``);
      await admin.end();
    },
  };
}
