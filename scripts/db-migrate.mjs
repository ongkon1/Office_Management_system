import { appliedMigrations, checksum, displayName, migrationConnection, migrationContents, migrationFiles } from './db-lib.mjs';

const connection = await migrationConnection();
try {
  const [[lock]] = await connection.query("SELECT GET_LOCK('office_management_migrations', 10) AS acquired");
  if (lock.acquired !== 1) throw new Error('Could not acquire migration lock');
  const applied = await appliedMigrations(connection);
  for (const file of migrationFiles()) {
    const contents = migrationContents(file);
    const hash = checksum(contents);
    const existing = applied.get(file.version);
    if (existing) {
      if (existing.checksum !== hash) throw new Error(`Checksum mismatch: ${displayName(file)}`);
      continue;
    }
    await connection.query(contents);
    await connection.execute('INSERT INTO schema_migrations(version,name,checksum) VALUES(?,?,?)', [file.version, file.name, hash]);
    console.log(`Applied ${displayName(file)}`);
  }
  await connection.query("SELECT RELEASE_LOCK('office_management_migrations')");
} finally {
  await connection.end();
}
