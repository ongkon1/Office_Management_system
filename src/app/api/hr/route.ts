import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { createHrServices } from '@/server/hr/composition';
import { handleHrMutation } from '@/server/hr/http';
import { resultResponse } from '@/server/time/http';
import { invalid } from '@/server/time/validation';
export const runtime = 'nodejs';
let database: ReturnType<typeof createDatabaseClient> | undefined;
const token = (r: NextRequest) => r.cookies.get(process.env.NODE_ENV === 'production' ? '__Host-office_session' : 'office_session')?.value ?? '';
const noSession = () => resultResponse({
    status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session'
});
function services(r: NextRequest) {
    database ??= createDatabaseClient();
    return createHrServices(database.pool, token(r));
}
export async function POST(request: NextRequest) {
    if (!token(request))
        return noSession();
    return handleHrMutation(request, () => services(request), process.env.APP_BASE_URL ?? 'http://localhost:3000');
}
export async function GET(request: NextRequest) {
    if (!token(request))
        return noSession();
    try {
        const s = services(request), q = request.nextUrl.searchParams;
        const employeeId = q.get('employeeId') ?? '', id = q.get('id') ?? '';
        const query = { pagination: { page: Number(q.get('page') ?? 1), pageSize: 25 }, filters: { ...(employeeId ? { employeeIds: [employeeId] } : {}), ...(q.has('from') || q.has('to') ? { dateRange: { from: q.get('from') ?? '', to: q.get('to') ?? '' } } : {}) } };
        switch (q.get('view')) {
            case 'wfh': return resultResponse(id ? await s.wfh.getById(id) : await s.wfh.list(query));
            case 'leave': return resultResponse(id ? await s.leave.getRequest(id) : await s.leave.listRequests(query));
            case 'balances': return resultResponse(await s.leave.listBalances(employeeId, Number(q.get('year'))));
            case 'attendance': return resultResponse(await s.attendance.list(query));
            case 'workload': return resultResponse(await s.workload.listWeeks(query));
            case 'holidays': return resultResponse(await s.holidays.list(query));
            case 'evaluations': return resultResponse(id ? await s.evaluations.getById(id) : await s.evaluations.listEvaluations(query));
            case 'evaluation-periods': return resultResponse(await s.evaluations.listPeriods(query));
            default: return resultResponse(invalid('view', 'Choose a supported HR view.'));
        }
    }
    catch {
        return resultResponse({
            status: 'error', code: 'DEPENDENCY_FAILED', message: 'The records could not be loaded.', retryable: true
        });
    }
}
