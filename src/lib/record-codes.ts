/**
 * The format of system-assigned record codes: `EMP-0001`, `DIV-0001`,
 * `PRJ-0001`. One definition, read by the MySQL service and the mock adapter,
 * so the demo never numbers records differently from production.
 *
 * Codes that predate the rule (`EMP-001`, `powerinai`, `PIAI-CRM`) are kept as
 * they are and ignored for numbering: only codes already in the generated
 * shape count, so a legacy code is never reissued or skipped into.
 */
export type RecordCodeKind = 'employee' | 'division' | 'project';

export const RECORD_CODE_PREFIX: Readonly<Record<RecordCodeKind, string>> = {
  employee: 'EMP',
  division: 'DIV',
  project: 'PRJ',
};

/** Four digits; the number simply grows past 9999 rather than wrapping. */
export const formatRecordCode = (kind: RecordCodeKind, sequence: number) =>
  `${RECORD_CODE_PREFIX[kind]}-${String(sequence).padStart(4, '0')}`;

/** The pattern a generated code matches, as a regular-expression source. */
export const recordCodePattern = (kind: RecordCodeKind) => `^${RECORD_CODE_PREFIX[kind]}-[0-9]+$`;

/** The next code after the highest generated code in `existing`. */
export function nextRecordCodeFrom(kind: RecordCodeKind, existing: readonly string[]): string {
  const pattern = new RegExp(recordCodePattern(kind));
  const highest = existing
    .filter((code) => pattern.test(code))
    .reduce((max, code) => Math.max(max, Number(code.slice(RECORD_CODE_PREFIX[kind].length + 1))), 0);
  return formatRecordCode(kind, highest + 1);
}
