import { z } from 'zod';
import { resultResponse } from '@/server/time/http';
import { invalid } from '@/server/time/validation';
import type { createReportingServices } from './composition';
import { preview } from './adapters';
const command = z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('report.run'), reportKey: z.string().max(100), query: z.record(z.string(), z.unknown()) }).strict(),
    z.object({ operation: z.literal('export.request'), input: z.unknown() }).strict(),
    z.object({ operation: z.literal('export.transition'), id: z.uuid(), action: z.enum(['cancel', 'retry', 'delete']) }).strict(),
    z.object({ operation: z.literal('finance.change'), kind: z.enum(['rate', 'billable', 'budget', 'payroll']), input: z.unknown() }).strict(),
]);
export async function handleReportingMutation(request: Request, factory: () => ReturnType<typeof createReportingServices>, origin: string) {
    if (request.headers.get('origin') !== new URL(origin).origin)
        return resultResponse({ status: 'permission_denied', code: 'FORBIDDEN', message: 'The request origin is not allowed.' });
    try {
        const body = await request.text();
        if (Buffer.byteLength(body) > 100000)
            return resultResponse(invalid('request', 'Reduce the request size.'));
        let raw: unknown;
        try {
            raw = JSON.parse(body);
        }
        catch {
            return resultResponse(invalid('request', 'Send valid JSON.'));
        }
        const parsed = command.safeParse(raw);
        if (!parsed.success)
            return resultResponse(invalid('request', parsed.error.issues[0].message));
        const c = parsed.data, s = factory();
        switch (c.operation) {
            case 'report.run': {
                const result = await s.reports.run(c.reportKey, c.query);
                return resultResponse(result.status === 'success' ? { status: 'success', data: preview(result.data) } : result);
            }
            case 'export.request': return resultResponse(await s.exports.request(c.input));
            case 'export.transition': return resultResponse(await s.exports.transition(c.id, c.action));
            case 'finance.change': return resultResponse(await s.finance.change(c.kind, c.input));
        }
    }
    catch {
        return resultResponse({ status: 'error', code: 'DEPENDENCY_FAILED', message: 'The operation could not be completed.', retryable: true });
    }
}
