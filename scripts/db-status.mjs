import { appliedMigrations, checksum, migrationConnection, migrationContents, migrationFiles } from './db-lib.mjs';

const connection = await migrationConnection();
try {
  const applied = await appliedMigrations(connection);
  for (const file of migrationFiles()) {
    const existing = applied.get(file.version);
    const state = !existing ? 'pending' : existing.checksum === checksum(migrationContents(file)) ? 'applied' : 'checksum-mismatch';
    console.log(`${file.version}\t${state}\t${file.name}`);
    if (state === 'checksum-mismatch') process.exitCode = 1;
  }
} finally {
  await connection.end();
}
