import { randomUUID } from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { BackendTeamTimesheetService } from './team-adapter';
import { TimeApplication } from './application';
import { MysqlTimeRepository } from './mysql-repository';
import { BackendPeriodService, BackendRemarkService, BackendTimesheetService } from './adapters';
/** Session tokens come from the trusted cookie boundary, never request payloads. */
export function createTimeServices(pool: Pool, sessionToken: string) {
    const authentication = new AuthenticationService(new MysqlAuthenticationStore(pool));
    const app = new TimeApplication(new MysqlTimeRepository(pool), async (date) => {
        const session = await authentication.validateSession(sessionToken);
        return session.status === 'success' ? loadActorPolicyContext(pool, session.data.userId, date) : null;
    });
    return { application: app, teamTimesheets: guardService(new BackendTeamTimesheetService(app)), timesheets: guardService(new BackendTimesheetService(app)), periods: guardService(new BackendPeriodService(app)), remarks: guardService(new BackendRemarkService(app)) };
}

/** Keep infrastructure failures inside Result at every public service method. */
export function guardService<T extends object>(service: T): T {
    return new Proxy(service, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => Promise.resolve().then(() => Reflect.apply(value, target, args)).catch(() => ({
                status: 'error', code: 'DEPENDENCY_FAILED', message: 'The operation could not be completed.', retryable: true, reference: randomUUID(),
            }));
        },
    });
}
