import { z } from 'zod';
import { resultResponse } from '@/server/time/http';
import { invalid } from '@/server/time/validation';
import type { createHrServices } from './composition';
const command = z.discriminatedUnion('operation', [
    z.object({
        operation: z.literal('request.save'), kind: z.enum(['wfh', 'leave']), id: z.uuid().optional(), expectedVersion: z.number().int().positive().optional(), input: z.record(z.string(), z.unknown())
    }),
    z.object({
        operation: z.literal('request.transition'), kind: z.enum(['wfh', 'leave']), id: z.uuid(), action: z.enum(['submit', 'cancel', 'approved', 'rejected', 'information_requested']), comment: z.string().max(10000).nullable().default(null), override: z.boolean().default(false), expectedVersion: z.number().int().positive().optional()
    }),
    z.object({ operation: z.literal('holiday.save'), id: z.uuid().optional(), input: z.record(z.string(), z.unknown()) }),
    z.object({ operation: z.literal('evaluation.period'), input: z.record(z.string(), z.unknown()) }),
    z.object({
        operation: z.literal('evaluation.assign'), periodId: z.uuid(), employeeId: z.uuid(), reviewerEmployeeId: z.uuid()
    }),
    z.object({
        operation: z.literal('evaluation.change'), id: z.uuid(), action: z.enum(['save_self', 'submit_self', 'save_scores', 'submit_review', 'publish', 'return']), input: z.unknown().optional(), expectedVersion: z.number().int().positive().optional()
    }),
]);
export async function handleHrMutation(request: Request, factory: () => ReturnType<typeof createHrServices>, origin: string) {
    if (request.headers.get('origin') !== new URL(origin).origin)
        return resultResponse({ status: 'permission_denied', code: 'FORBIDDEN', message: 'The request origin is not allowed.' });
    try {
        const text = await request.text();
        if (Buffer.byteLength(text) > 100000)
            return resultResponse(invalid('request', 'Reduce the request size.'));
        let raw: unknown;
        try {
            raw = JSON.parse(text);
        }
        catch {
            return resultResponse(invalid('request', 'Send valid JSON.'));
        }
        const parsed = command.safeParse(raw);
        if (!parsed.success)
            return resultResponse(invalid('request', parsed.error.issues[0].message));
        const c = parsed.data, s = factory();
        switch (c.operation) {
            case 'request.save': return resultResponse(await s.requests.save(c.kind, c.input, c.id, c.expectedVersion));
            case 'request.transition': return resultResponse(await s.requests.transition(c.kind, c.id, c.action, c.comment, c.override, c.expectedVersion));
            case 'holiday.save': return resultResponse(await (c.id ? s.holidays.update(c.id, c.input) : s.holidays.create(c.input as Parameters<typeof s.holidays.create>[0])));
            case 'evaluation.period': return resultResponse(await s.evaluationApplication.createPeriod(c.input));
            case 'evaluation.assign': return resultResponse(await s.evaluationApplication.assign(c.periodId, c.employeeId, c.reviewerEmployeeId));
            case 'evaluation.change': return resultResponse(await s.evaluationApplication.change(c.id, c.action, c.input, c.expectedVersion));
        }
    }
    catch {
        return resultResponse({
            status: 'error', code: 'DEPENDENCY_FAILED', message: 'The operation could not be completed.', retryable: true
        });
    }
}
