import { z } from 'zod';
import { parseIsoDate } from '@/lib/format';
import type { Failure } from '@/contracts/results';
export const dateSchema = z.string().refine((value) => Boolean(parseIsoDate(value)), 'Enter a valid calendar date.');
const id = z.string().min(1).max(36);
export const timerInputSchema = z.object({
    divisionId: id, projectId: id.nullable(), taskId: id.nullable(),
    workLocation: z.enum(['office', 'wfh', 'hybrid', 'field_work', 'client_office', 'official_travel', 'training_venue']),
});
export const entryInputSchema = timerInputSchema.extend({
    draftEntryId: id.optional(), draftVersion: z.number().int().positive().optional(),
    employeeId: id, workDate: dateSchema, entryMethod: z.enum(['manual_clock', 'manual_duration']),
    startTime: z.string().nullable(), endTime: z.string().nullable(),
    activeMinutes: z.number().int().positive().max(1440).nullable(),
    workDescription: z.string().trim().min(1).max(10000), completedWork: z.string().trim().min(1).max(10000),
    supportingLink: z.string().url().max(1024).refine((s) => /^https?:\/\//i.test(s)).nullable(),
    attachmentIds: z.array(id).max(20), overtimeReason: z.string().max(10000).nullable(), criticalExplanation: z.string().max(10000).nullable(),
});
export function invalid(field: string, message: string, code = 'INVALID_INPUT'): Failure {
    return { status: 'validation_failure', code: 'VALIDATION_FAILED', message, focusField: field,
        fieldErrors: [{ field, message, code, guidance: message }] };
}
export function conflict(message = 'The record changed. Reload before trying again.', locked = false): Failure {
    return { status: 'conflict', code: locked ? 'PERIOD_LOCKED' : 'CONFLICT', message,
        guidance: locked ? 'Request an authorized amendment with a reason.' : 'Reload the latest record and review your changes.' };
}
