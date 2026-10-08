import type { DepartmentAdministrationService } from '@/contracts/organization-hierarchy';
import { serverPost } from './http';

/**
 * The HTTP adapter for department administration (`OH-BE-0216`).
 *
 * It posts to the existing `/api/admin` envelope with namespaced method names,
 * so there is one administration route, one origin check and one error mapping
 * rather than a second API model.
 *
 * Optional arguments are omitted rather than sent as `undefined`: JSON turns
 * `undefined` into `null`, and a `null` argument would defeat the parameter
 * defaults on the server.
 */
const call = <T>(method: string, args: readonly unknown[]) =>
  serverPost<T>('/api/admin', { method, args });

export const serverDepartmentAdminService: DepartmentAdministrationService = {
  catalogue: (userId, filter) =>
    call('department.catalogue', filter === undefined ? [userId] : [userId, filter]),
  get: (userId, departmentId) => call('department.get', [userId, departmentId]),
  create: (userId, input) => call('department.create', [userId, input]),
  update: (userId, departmentId, input) =>
    call('department.update', [userId, departmentId, input]),
  setStatus: (userId, input) => call('department.setStatus', [userId, input]),
  remove: (userId, departmentId) => call('department.remove', [userId, departmentId]),
  listEligibleLeads: (userId, departmentId, effectiveFrom) =>
    call(
      'department.listEligibleLeads',
      effectiveFrom === undefined ? [userId, departmentId] : [userId, departmentId, effectiveFrom],
    ),
  appointLead: (userId, input) => call('department.appointLead', [userId, input]),
};
