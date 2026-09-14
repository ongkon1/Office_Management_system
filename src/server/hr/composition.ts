import type { Pool } from 'mysql2/promise';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { guardService } from '@/server/time/composition';
import { HrRepository } from './repository';
import { RequestApplication } from './requests';
import { AttendanceApplication } from './attendance';
import { HolidayApplication } from './holidays';
import { EvaluationApplication } from './evaluations';
import { HrJobs } from './jobs';
import { WorkloadPlanning } from './planning';
import { BackendHrViews } from './hr-views';
import { BackendWfhService, BackendLeaveService, BackendAttendanceService, BackendHolidayService, BackendWorkPolicyService, BackendWorkloadService, BackendEvaluationService } from './adapters';
export function createHrServices(pool: Pool, sessionToken: string) {
    const authentication = new AuthenticationService(new MysqlAuthenticationStore(pool));
    const requests = new RequestApplication(new HrRepository(pool), async (on) => {
        const session = await authentication.validateSession(sessionToken);
        return session.status === 'success' ? loadActorPolicyContext(pool, session.data.userId, on) : null;
    });
    const attendance = new AttendanceApplication(requests), holidays = new HolidayApplication(requests), evaluations = new EvaluationApplication(requests);
    return {
        hr: guardService(new BackendHrViews(requests, attendance, holidays, evaluations)), requests, planning: new WorkloadPlanning(attendance), attendanceApplication: attendance, evaluationApplication: evaluations, jobs: new HrJobs(attendance), wfh: guardService(new BackendWfhService(requests)), leave: guardService(new BackendLeaveService(requests)), attendance: guardService(new BackendAttendanceService(attendance)), holidays: guardService(new BackendHolidayService(holidays)), workPolicies: guardService(new BackendWorkPolicyService(requests)), workload: guardService(new BackendWorkloadService(attendance)), evaluations: guardService(new BackendEvaluationService(evaluations))
    };
}
