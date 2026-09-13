import type { Pool } from 'mysql2/promise';
import { S3Client } from '@aws-sdk/client-s3';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { RequestApplication } from '@/server/hr/requests';
import { HrRepository } from '@/server/hr/repository';
import { guardService } from '@/server/time/composition';
import { ReportApplication } from './application';
import { FinanceApplication } from './finance';
import { ExportApplication } from './exports';
import { S3ExportStorage, type ExportStorage } from './storage';
import { createFinanceViewService } from './finance-adapter';
import { BackendReportingService } from './adapters';
export function createReportingServices(pool: Pool, sessionToken: string, storage?: ExportStorage) {
    const authentication = new AuthenticationService(new MysqlAuthenticationStore(pool));
    const requests = new RequestApplication(new HrRepository(pool), async (on) => { const s = await authentication.validateSession(sessionToken); return s.status === 'success' ? loadActorPolicyContext(pool, s.data.userId, on) : null; });
    const reports = new ReportApplication(requests);
    const objectStorage = storage ?? new S3ExportStorage(new S3Client({ region: process.env.S3_REGION ?? process.env.AWS_REGION ?? 'ap-southeast-1', endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } } : {}) }), process.env.EXPORT_S3_BUCKET ?? process.env.S3_BUCKET ?? 'unconfigured-private-exports');
    const exports = new ExportApplication(reports, objectStorage, { fontPath: process.env.EXPORT_PDF_FONT_PATH });
    return { reports, financeViews: guardService(createFinanceViewService(reports, exports)), finance: new FinanceApplication(reports), exports, reporting: guardService(new BackendReportingService(reports, exports)) };
}
