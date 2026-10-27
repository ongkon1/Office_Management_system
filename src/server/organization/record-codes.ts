import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { RECORD_CODE_PREFIX, formatRecordCode, recordCodePattern, type RecordCodeKind } from '@/lib/record-codes';

/**
 * System-assigned identifiers for employees, divisions and projects.
 *
 * People no longer type these. A typed code collided, drifted from the format
 * the rest of the product reads, and turned every create form into a guessing
 * game about which numbers were taken. The service assigns the next number in
 * the same transaction as the insert and never changes it afterwards — reports,
 * exports and audit history name records by these codes. The format itself
 * lives in `src/lib/record-codes.ts`, shared with the mock adapter.
 */
const CODE_COLUMN: Readonly<Record<RecordCodeKind, { readonly table: string; readonly column: string }>> = {
  employee: { table: 'employees', column: 'employee_code' },
  division: { table: 'divisions', column: 'division_key' },
  project: { table: 'projects', column: 'project_code' },
};

/**
 * The next code for `kind`. Call inside the creating transaction: the locking
 * read holds every existing code until commit, so two concurrent creates queue
 * rather than both reading the same maximum.
 */
export async function nextRecordCode(connection: Pick<PoolConnection, 'execute'>, kind: RecordCodeKind): Promise<string> {
  const { table, column } = CODE_COLUMN[kind];
  const [rows] = await connection.execute<(RowDataPacket & { highest: number | string | null })[]>(
    `SELECT MAX(CAST(SUBSTRING(${column},${RECORD_CODE_PREFIX[kind].length + 2}) AS UNSIGNED)) highest FROM ${table}
     WHERE ${column} REGEXP ? FOR UPDATE`,
    [recordCodePattern(kind)],
  );
  return formatRecordCode(kind, Number(rows[0]?.highest ?? 0) + 1);
}

/** MySQL `ER_DUP_ENTRY`, raised when a code was taken despite the lock. */
export const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { errno?: number }).errno === 1062;
