import { z } from 'zod';
import { parseIsoDate } from '@/lib/format';
import type { Failure } from '@/contracts/results';
export const dateSchema = z.string().refine((value) => Boolean(parseIsoDate(value)) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'Enter a valid calendar date.');
const id = z.string().min(1).max(36);
export const entryInputSchema = z.object({
    employeeId: id, workDate: dateSchema, divisionId: id, projectId: id, taskId: id,
    durationMinutes: z.number().int().positive().max(1440),
    workLocation: z.enum(['office', 'wfh', 'hybrid', 'field_work', 'client_office', 'official_travel', 'training_venue']),
    workDescription: z.string().trim().min(1).max(10000), completedWork: z.string().trim().min(1).max(10000),
    supportingLink: z.string().url().max(1024).refine((s) => /^https?:\/\//i.test(s)).nullable(),
    attachmentIds: z.array(id).max(20), overtimeReason: z.string().max(10000).nullable(), criticalExplanation: z.string().max(10000).nullable(),
    source: z.literal('manual'), idempotencyKey: z.string().trim().min(1).max(128),
}).strict();
export function invalid(field: string, message: string, code = 'INVALID_INPUT'): Failure {
    return { status: 'validation_failure', code: 'VALIDATION_FAILED', message, focusField: field,
        fieldErrors: [{ field, message, code, guidance: message }] };
}
export function conflict(message = 'The record changed. Reload before trying again.', locked = false): Failure {
    return { status: 'conflict', code: locked ? 'PERIOD_LOCKED' : 'CONFLICT', message,
        guidance: locked ? 'Request an authorized amendment with a reason.' : 'Reload the latest record and review your changes.' };
}
