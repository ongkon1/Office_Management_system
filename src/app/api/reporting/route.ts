import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { createReportingServices } from '@/server/reporting/composition';
import { handleReportingMutation } from '@/server/reporting/http';
import { resultResponse } from '@/server/time/http';
import { invalid } from '@/server/time/validation';
export const runtime = 'nodejs';
let database: ReturnType<typeof createDatabaseClient> | undefined;
const token = (r: NextRequest) => r.cookies.get(process.env.NODE_ENV === 'production' ? '__Host-office_session' : 'office_session')?.value ?? '';
const noSession = () => resultResponse({ status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session' });
function services(r: NextRequest) { database ??= createDatabaseClient(); return createReportingServices(database.pool, token(r)); }
export async function POST(request: NextRequest) { if (!token(request))
    return noSession(); return handleReportingMutation(request, () => services(request), process.env.APP_BASE_URL ?? 'http://localhost:3000'); }
export async function GET(request: NextRequest) {
    if (!token(request))
        return noSession();
    try {
        const s = services(request), q = request.nextUrl.searchParams, id = q.get('id') ?? '';
        if (q.get('view') === 'catalogue')
            return resultResponse(await s.reports.catalogue());
        if (q.get('view') === 'exports')
            return resultResponse(id ? await s.exports.get(id) : await s.exports.list());
        if (q.get('view') === 'download') {
            const r = await s.exports.download(id);
            if (r.status !== 'success')
                return resultResponse(r);
            return new Response(r.data.stream, { headers: { 'Content-Type': r.data.mediaType, 'Content-Disposition': `attachment; filename="${r.data.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
        }
        return resultResponse(invalid('view', 'Choose catalogue, exports or download.'));
    }
    catch {
        return resultResponse({ status: 'error', code: 'DEPENDENCY_FAILED', message: 'The records could not be loaded.', retryable: true });
    }
}
