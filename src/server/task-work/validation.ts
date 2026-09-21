import { z } from 'zod';
const id = z.string().min(1).max(36);
const status = z.enum(['pending', 'in_progress', 'completed']);
export const transitionInputSchema = z.object({
    taskId: id, fromStatus: status, toStatus: status,
    // Accepted for contract compatibility, never used as authority.
    actorRole: z.enum(['employee', 'team_lead', 'super_admin', 'hr_manager', 'management']),
    note: z.string().trim().max(10000).nullable(),
    idempotencyKey: z.string().trim().min(1).max(128), expectedVersion: z.number().int().positive(),
}).strict();
export const assignmentInputSchema = z.object({ taskId: id, assigneeEmployeeId: id, expectedVersion: z.number().int().positive(), idempotencyKey: z.string().trim().min(1).max(128) }).strict();
