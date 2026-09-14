import { z } from 'zod';
import { daysBetween } from '@/lib/format';
import { dateSchema } from '@/server/time/validation';
const ids = z.array(z.string().min(1).max(36)).max(100);
export const reportQuerySchema = z.object({
    dateRange: z.object({ from: dateSchema, to: dateSchema }).optional(), periodId: z.string().max(36).optional(),
    employeeIds: ids.optional(), divisionIds: ids.optional(), projectIds: ids.optional(), taskIds: ids.optional(), teamLeadIds: ids.optional(),
    employmentTypes: z.array(z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant'])).optional(),
    workLocations: z.array(z.enum(['office', 'wfh', 'hybrid', 'field_work', 'client_office', 'official_travel', 'training_venue'])).optional(),
    dayStatuses: z.array(z.enum(['missing', 'under_time', 'complete', 'overtime', 'critical'])).optional(),
    recordStatuses: z.array(z.enum(['saved', 'locked', 'draft', 'pending', 'approved', 'rejected', 'cancelled', 'information_requested', 'published', 'self_submitted', 'review_submitted', 'open', 'responded', 'resolved'])).optional(),
    wfhOnly: z.boolean().optional(), overtimeOnly: z.boolean().optional(), verifiedOnly: z.boolean().optional(),
    page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25),
    sort: z.enum(['key', 'activeMinutes', 'date', 'employee']).default('key'), direction: z.enum(['asc', 'desc']).default('asc'),
    search: z.string().trim().max(200).optional(), includeProtectedFields: z.boolean().default(true),
}).strict().refine(q => !q.dateRange || (q.dateRange.to >= q.dateRange.from && daysBetween(q.dateRange.from, q.dateRange.to) <= 366), { path: ['dateRange'], message: 'Choose an ordered range of at most 367 days.' });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export const matches = (values: readonly string[] | undefined, value: string | null | undefined) => values === undefined || (value != null && values.includes(value));
