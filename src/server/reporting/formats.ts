import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ExportFormat } from '@/contracts/domain';
import { formatTimestamp } from '@/lib/format';
import type { ReportDataset } from './application';
export const mediaTypes: Record<ExportFormat, string> = { excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf', print: 'text/html; charset=utf-8' };
export const extensions: Record<ExportFormat, string> = { excel: 'xlsx', csv: 'csv', pdf: 'pdf', print: 'html' };
export function safeSpreadsheetCell(value: string) { return /^[\s\u0000-\u001f]*[=+@\-]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value; }
export const escapeHtml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function metadataLines(data: ReportDataset): string[] { return [data.spec.title, `Period: ${data.metadata.period.from} to ${data.metadata.period.to}`, `Timezone: ${data.metadata.timezone}`, `Generated: ${formatTimestamp(data.metadata.generatedAt)}`, `Policy versions: ${data.metadata.policyVersions.join(', ') || 'No calculated records'}`, `Filters: ${JSON.stringify(data.metadata.filters)}`, data.metadata.includesUnverifiedData ? 'Unverified information included' : 'Verified records only']; }
/** Row values stay text in all formats. Formula-looking values never become formulas. */
export async function renderExport(data: ReportDataset, format: ExportFormat, path: string, fontPath?: string) {
    const columns = [...new Set(data.rows.flatMap(r => Object.keys(r.cells)))];
    const values = (function* () { for (const line of metadataLines(data))
        yield [line]; yield columns; for (const row of data.rows)
        yield columns.map(c => row.cells[c] ?? 'Not recorded'); yield columns.map(c => data.totals[c] ?? (c === columns[0] ? 'Totals' : '')); })();
    const out = createWriteStream(path, { flags: 'wx', mode: 0o600 });
    const completion = finished(out);
    void completion.catch(() => { });
    try {
        if (format === 'excel') {
            const book = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useSharedStrings: false, useStyles: false });
            const sheet = book.addWorksheet('Report');
            for (const row of values)
                sheet.addRow(row.map(safeSpreadsheetCell)).commit();
            sheet.commit();
            await book.commit();
        }
        else if (format === 'pdf') {
            const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
            doc.on('error', e => out.destroy(e));
            doc.pipe(out);
            if (fontPath)
                doc.font(fontPath);
            for (const row of values) {
                const text = row.join(' | ');
                if (!fontPath && /[^\u0000-\u00ff]/u.test(text))
                    throw new Error('Configure a Unicode PDF font for this report');
                doc.fontSize(9).text(text, { width: doc.page.width - 72 });
            }
            doc.end();
        }
        else {
            const write = async (s: string) => { if (!out.write(s))
                await once(out, 'drain'); };
            if (format === 'print')
                await write('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Report</title><style>body{font:12px sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid;padding:4px;overflow-wrap:anywhere}thead{display:table-header-group}@media print{tr{break-inside:avoid}}</style><body>');
            if (format === 'csv') {
                await write('\ufeff');
                for (const row of values)
                    await write(row.map(s => '"' + safeSpreadsheetCell(s).replaceAll('"', '""') + '"').join(',') + '\r\n');
            }
            else {
                for (const line of metadataLines(data))
                    await write(`<p>${escapeHtml(line)}</p>`);
                await write(`<table><thead><tr>${columns.map(c => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>`);
                for (const row of data.rows)
                    await write(`<tr>${columns.map(c => `<td>${escapeHtml(row.cells[c] ?? 'Not recorded')}</td>`).join('')}</tr>`);
                await write(`</tbody><tfoot><tr>${columns.map(c => `<td>${escapeHtml(data.totals[c] ?? '')}</td>`).join('')}</tr></tfoot></table></body></html>`);
            }
            out.end();
        }
        await completion;
    }
    catch (error) {
        out.destroy();
        await completion.catch(() => { });
        throw error;
    }
}
