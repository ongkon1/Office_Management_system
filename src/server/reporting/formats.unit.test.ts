import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, it, expect } from 'vitest';
import { costOfRatedMinutes, storedMoney } from '@/lib/money';
import { allocateMinutes } from '@/lib/calculation/engine';
import { reportQuerySchema } from './query';
import { renderExport, safeSpreadsheetCell } from './formats';
import type { ReportDataset } from './application';
const query = reportQuerySchema.parse({ dateRange: { from: '2026-09-02', to: '2026-09-02' } });
const dataset: ReportDataset = { spec: { key: 'employee-hours', title: 'Employee hours', category: 'timesheet', group: 'employee', permission: 'report.read' }, query, rows: [{ key: '1', activeMinutes: 419, rated: [], cells: { employee: '=HYPERLINK("https://example.invalid")', active: '6:59', note: '<script>alert(1)</script>বাংলা' } }], totals: { active: '6:59' }, totalItems: 1, activeMinutes: 419, overtimeMinutes: 0, breakMinutes: 60, totalMinutes: 479, metadata: { timezone: 'Asia/Dhaka', generatedAt: '2026-09-02T06:00:00Z', policyVersions: [1, 2], period: query.dateRange!, includesUnverifiedData: true, filters: query } };
describe('Phase 6 precision, export content and bounds', () => {
    it('rounds a mixed-rate total once and rejects lost storage precision', () => {
        expect(costOfRatedMinutes([{ hourlyRate: { amount: '0.01', currency: 'BDT' }, minutes: 1 }, { hourlyRate: { amount: '0.01', currency: 'BDT' }, minutes: 29 }])).toEqual({ amount: '0.01', currency: 'BDT' });
        expect(storedMoney('1250.7500', 'BDT').amount).toBe('1250.75');
        expect(() => storedMoney('1250.7501', 'BDT')).toThrow();
        expect(() => costOfRatedMinutes([{ hourlyRate: { amount: '1.00', currency: 'USD' }, minutes: 1 }])).toThrow();
    });
    it('allocates a separate break and overtime without gaining or losing minutes', () => { expect(allocateMinutes(60, [180, 120, 120])).toEqual([26, 17, 17]); for (let i = 0; i < 500; i++)
        expect(allocateMinutes(i, [1, 5, 9]).reduce((n, v) => n + v, 0)).toBe(i); });
    it('validates calendar dates and treats an empty filter as no matches', () => { for (const date of ['2026-02-30', '2026-13-01', '2026-00-00', 'not-a-date'])
        expect(reportQuerySchema.safeParse({ dateRange: { from: date, to: date } }).success).toBe(false); expect(reportQuerySchema.parse({ ...query, employeeIds: [] }).employeeIds).toEqual([]); });
    it('neutralizes formula prefixes including leading whitespace and control characters', () => { for (const value of ['=1+1', ' +1', '\t@SUM(A1)', '\r-2', '\n=1', '\u0000=1'])
        expect(safeSpreadsheetCell(value)).toBe("'" + value); expect(safeSpreadsheetCell('ordinary')).toBe('ordinary'); });
    it('writes parseable Excel text cells and escaped CSV/print with matching provenance', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'report-formats-'));
        try {
            for (const format of ['excel', 'csv', 'print'] as const)
                await renderExport(dataset, format, join(dir, format));
            const book = new ExcelJS.Workbook();
            await book.xlsx.readFile(join(dir, 'excel'));
            let found = false;
            book.worksheets[0].eachRow(row => { row.eachCell(cell => { if (String(cell.value).includes('HYPERLINK')) {
                found = true;
                expect(cell.type).toBe(ExcelJS.ValueType.String);
                expect(String(cell.value)).toMatch(/^'/);
            } }); });
            expect(found).toBe(true);
            const csv = await readFile(join(dir, 'csv'), 'utf8');
            expect(csv).toContain("'=HYPERLINK");
            expect(csv).toContain('6:59');
            expect(csv).toContain('Policy versions: 1, 2');
            expect(csv).toContain('বাংলা');
            const html = await readFile(join(dir, 'print'), 'utf8');
            expect(html).toContain('&lt;script&gt;');
            expect(html).not.toContain('<script>');
            expect(html).toContain('<thead>');
            expect(html).toContain('Unverified information');
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('generates a real PDF and fails safely when Unicode needs a configured font', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'report-pdf-'));
        try {
            await renderExport({ ...dataset, rows: [{ ...dataset.rows[0], cells: { employee: 'Employee', active: '6:59' } }] }, 'pdf', join(dir, 'pdf'));
            expect((await readFile(join(dir, 'pdf'))).subarray(0, 5).toString()).toBe('%PDF-');
            await expect(renderExport(dataset, 'pdf', join(dir, 'unicode'))).rejects.toThrow('Unicode PDF font');
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('streams a large worksheet with all rows retained', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'report-large-'));
        try {
            const rows = Array.from({ length: 20000 }, (_, i) => ({ key: String(i), activeMinutes: 1, rated: [], cells: { employee: `Employee ${i}`, active: '0:01' } }));
            await renderExport({ ...dataset, rows, totalItems: rows.length }, 'excel', join(dir, 'large'));
            const reader = new ExcelJS.stream.xlsx.WorkbookReader(join(dir, 'large'), {});
            let count = 0;
            for await (const sheet of reader)
                for await (const row of sheet)
                    if (String(row.getCell(1).value).startsWith('Employee '))
                        count++;
            expect(count).toBe(20001);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 30000);
});
