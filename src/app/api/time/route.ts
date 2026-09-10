import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { createTimeServices } from '@/server/time/composition';
import { handleTimeMutation, resultResponse } from '@/server/time/http';
import { invalid } from '@/server/time/validation';
export const runtime = 'nodejs';
let database: ReturnType<typeof createDatabaseClient> | undefined;
function token(request: NextRequest) { return request.cookies.get(process.env.NODE_ENV === 'production' ? '__Host-office_session' : 'office_session')?.value ?? ''; }
const noSession = () => resultResponse({ status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session' });
function services(request: NextRequest) { database ??= createDatabaseClient(); return createTimeServices(database.pool, token(request)); }
export async function POST(request: NextRequest) { if (!token(request))
    return noSession(); return handleTimeMutation(request, () => services(request), process.env.APP_BASE_URL ?? 'http://localhost:3000'); }
export async function GET(request: NextRequest) {
    if (!token(request))
        return noSession();
    try {
        const query = request.nextUrl.searchParams;
        const s = services(request);
        const employeeId = query.get('employeeId') ?? '';
        switch (query.get('view') ?? 'day') {
            case 'day': return resultResponse(await s.timesheets.getDay({ employeeId, date: query.get('date') ?? '' }));
            case 'week': return resultResponse(await s.timesheets.getWeek({ employeeId, weekStartDate: query.get('date') ?? '' }));
            case 'month': return resultResponse(await s.timesheets.getMonth({ employeeId, month: query.get('month') ?? '' }));
            case 'timer': return resultResponse(await s.timesheets.getRunningTimer());
            case 'period': return resultResponse(await s.periods.getVerificationSummary(query.get('id') ?? ''));
            case 'remarks': return resultResponse(await s.remarks.list({ pagination: { page: Number(query.get('page') ?? 1), pageSize: 25 }, filters: { employeeIds: [employeeId] } }));
            case 'entries': return resultResponse(await s.timesheets.listEntries({ pagination: { page: Number(query.get('page') ?? 1), pageSize: 25 }, filters: { employeeIds: [employeeId], dateRange: { from: query.get('from') ?? '', to: query.get('to') ?? '' } } }));
            default: return resultResponse(invalid('view', 'Choose day, week, month, entries, timer, period or remarks.'));
        }
    }
    catch {
        return resultResponse({ status: 'error', code: 'DEPENDENCY_FAILED', message: 'The records could not be loaded.', retryable: true });
    }
}
