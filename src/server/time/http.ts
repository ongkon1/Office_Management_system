import { z } from 'zod';
import { transitionInputSchema, assignmentInputSchema } from '@/server/task-work/validation';
import type { Result } from '@/contracts/results';
import { isTrustedMutation } from '@/server/security/request';
import { entryInputSchema, dateSchema, invalid } from './validation';
import type { createTimeServices } from './composition';
const id = z.string().min(1).max(36);
const key = z.string().min(1).max(128);
const remarkLink = z.discriminatedUnion('type', [z.object({ type: z.literal('none') }), z.object({ type: z.literal('timesheet'), workDate: dateSchema }), z.object({ type: z.literal('task'), taskId: id })]);
const command = z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('task.transition'), input: transitionInputSchema }),
    z.object({ operation: z.literal('task.assign'), input: assignmentInputSchema }),
    z.object({ operation: z.literal('draft.convert'), id, expectedVersion: z.number().int().positive(), input: entryInputSchema }),
    z.object({ operation: z.literal('create'), input: entryInputSchema.extend({ idempotencyKey: key }) }),
    z.object({ operation: z.literal('update'), id, input: entryInputSchema.extend({ expectedVersion: z.number().int().positive(), changeReason: z.string().trim().min(1).max(10000) }) }),
    z.object({ operation: z.literal('delete'), id, expectedVersion: z.number().int().positive() }),
    z.object({ operation: z.literal('preview'), input: entryInputSchema, excludeWorkLogId: id.optional() }),
    z.object({ operation: z.literal('copy'), id, targetDate: dateSchema }),
    z.object({ operation: z.literal('break'), input: z.object({ employeeId: id, workDate: dateSchema, minutes: z.number().int().min(0).max(1440), reason: z.string().trim().min(1).max(10000) }) }),
    z.object({ operation: z.literal('period.verify'), input: z.object({ periodId: id, note: z.string().max(10000).nullable(), idempotencyKey: key }) }),
    z.object({ operation: z.literal('period.amend'), input: z.object({ periodId: id, recordId: id, reason: z.string().trim().min(1).max(10000), changes: z.record(z.string(), z.unknown()), idempotencyKey: key }) }),
    z.object({ operation: z.literal('period.unlock'), input: z.object({ periodId: id, reason: z.string().trim().min(1).max(10000) }) }),
    z.object({ operation: z.literal('remark.create'), input: z.object({ employeeId: id, message: z.string().trim().min(1).max(10000), relatedRecord: remarkLink, isCorrectionRequest: z.boolean(), requestedChanges: z.string().max(10000).nullable() }) }),
    z.object({ operation: z.literal('remark.respond'), id, message: z.string().trim().min(1).max(10000) }),
    z.object({ operation: z.literal('remark.resolve'), id }),
]);
type Services = ReturnType<typeof createTimeServices>;
export function resultResponse(result: Result<unknown>) { const status = { success: 200, validation_failure: 400, unauthenticated: 401, permission_denied: 403, not_found: 404, conflict: 409, error: 503 }[result.status]; return Response.json(result, { status, headers: { 'Cache-Control': 'private, no-store', 'Time-Contract-Version': '2' } }); }
export async function handleTimeMutation(request: Request, services: () => Services, trustedOrigin: string) {
    try {
        if (!isTrustedMutation({ method: request.method, origin: request.headers.get('origin'), referer: request.headers.get('referer'), secFetchSite: request.headers.get('sec-fetch-site') }, [trustedOrigin]))
            return resultResponse({ status: 'permission_denied', code: 'FORBIDDEN', message: 'The request origin is not allowed.' });
        const text = await request.text();
        if (text.length > 100000)
            return resultResponse(invalid('input', 'Use a request smaller than 100 KB.'));
        const body = JSON.parse(text);
        if (typeof body?.operation === 'string' && body.operation.startsWith('timer.')) return retiredTimeResponse();
        if (body?.input && typeof body.input === 'object' && ['startTime', 'endTime', 'entryMethod', 'activeMinutes', 'draftEntryId'].some(key => key in body.input)) return retiredTimeResponse();
        const parsed = command.safeParse(body);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return resultResponse(invalid(issue.path.join('.'), issue.message));
        }
        const c = parsed.data;
        const s = services();
        let result: Result<unknown>;
        switch (c.operation) {
            case 'task.transition': result = await s.timesheets.transitionTask(c.input); break;
            case 'task.assign': result = await s.tasks.assign(c.input); break;
            case 'draft.convert': result = await s.timesheets.convertDraft(c.id, c.expectedVersion, c.input); break;
            case 'create':
                result = await s.timesheets.createWorkLog(c.input);
                break;
            case 'update':
                result = await s.timesheets.updateWorkLog(c.id, c.input);
                break;
            case 'delete':
                result = await s.timesheets.deleteWorkLog(c.id, c.expectedVersion);
                break;
            case 'preview':
                result = await s.timesheets.previewWorkLog(c.input, { excludeWorkLogId: c.excludeWorkLogId });
                break;
            case 'copy':
                result = await s.timesheets.copyWorkLog({ sourceWorkLogId: c.id, targetDate: c.targetDate });
                break;
            case 'break':
                result = await s.timesheets.setBreakOverride(c.input);
                break;
            case 'period.verify':
                result = await s.periods.verify(c.input);
                break;
            case 'period.amend':
                result = await s.periods.amend(c.input);
                break;
            case 'period.unlock':
                result = await s.periods.requestUnlock(c.input);
                break;
            case 'remark.create':
                result = await s.remarks.create(c.input);
                break;
            case 'remark.respond':
                result = await s.remarks.respond({ remarkId: c.id, message: c.message });
                break;
            case 'remark.resolve':
                result = await s.remarks.resolve({ remarkId: c.id });
                break;
        }
        return resultResponse(result);
    }
    catch (error) {
        return resultResponse(error instanceof SyntaxError ? invalid('input', 'Send a valid JSON request.') : { status: 'error', code: 'DEPENDENCY_FAILED', message: 'The operation could not be completed.', retryable: true });
    }
}

/** Old clients receive an explicit retirement response, without touching retired tables. */
export function retiredTimeResponse() {
    return Response.json({ status: 'error', code: 'OPERATION_RETIRED', message: 'Clock entries and timers have been retired. Use duration-based work logs.', retryable: false, contractVersion: 2 }, { status: 410, headers: { 'Cache-Control': 'private, no-store', 'Time-Contract-Version': '2' } });
}
