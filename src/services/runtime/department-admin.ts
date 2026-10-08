import type { DepartmentAdministrationService } from '@/contracts/organization-hierarchy';
import { serverDepartmentAdminService } from '@/services/server/department-admin';
import { runtimeInvalidation } from './invalidation';

/**
 * Department administration, served by MySQL through `/api/admin` (Phase B2).
 *
 * Every mutation notifies the shared refresh signal, so an open catalogue, a
 * detail panel and any screen reading department data re-read the change
 * instead of holding a stale row. Nothing derived is cached on the server — the
 * policy context resolves leadership per request from effective-dated rows —
 * so this is the only cache there is to invalidate (`OH-BE-0209`).
 */
function notifying<TArgs extends readonly unknown[], TResult extends { status: string }>(
  operation: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const result = await operation(...args);
    if (result.status === 'success') runtimeInvalidation.notify();
    return result;
  };
}

export const departmentAdminService: DepartmentAdministrationService = {
  catalogue: serverDepartmentAdminService.catalogue,
  get: serverDepartmentAdminService.get,
  listEligibleLeads: serverDepartmentAdminService.listEligibleLeads,
  create: notifying(serverDepartmentAdminService.create),
  update: notifying(serverDepartmentAdminService.update),
  setStatus: notifying(serverDepartmentAdminService.setStatus),
  remove: notifying(serverDepartmentAdminService.remove),
  appointLead: notifying(serverDepartmentAdminService.appointLead),
};
