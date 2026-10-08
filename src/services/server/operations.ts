import type { HrService } from "@/contracts/hr";
import type { TeamLeadService } from "@/contracts/team-lead";
import type { EmployeeDashboardViewService } from "@/contracts/employee-views";
import type { ManagementService } from "@/contracts/finance";
import type { Division, Project, Task } from "@/contracts/domain";
import type { WorkEntryOptions } from "@/contracts/work-options";
import { serverPost } from "./http";

type OperationsService = HrService &
  TeamLeadService &
  EmployeeDashboardViewService &
  ManagementService & {
    listDivisions(
      userId: string,
    ): Promise<import("@/contracts/results").Result<readonly Division[]>>;
    listProjectsForDivision(
      userId: string,
      divisionId: string,
    ): Promise<import("@/contracts/results").Result<readonly Project[]>>;
    listTasksForProject(
      userId: string,
      projectId: string,
    ): Promise<import("@/contracts/results").Result<readonly Task[]>>;
    getWorkEntryOptions(
      employeeId: string,
      workDate: string,
    ): Promise<import("@/contracts/results").Result<WorkEntryOptions>>;
  };
const call = <T>(
  service: "hr" | "team" | "dashboard" | "organization",
  method: string,
  args: readonly unknown[],
) => serverPost<T>("/api/operations", { service, method, args });

export const serverOperationsHrService = new Proxy(
  {},
  {
    get:
      (_target, method) =>
      (...args: unknown[]) =>
        call("hr", String(method), args),
  },
) as HrService;
export const serverOperationsTeamLeadService = new Proxy(
  {},
  {
    get:
      (_target, method) =>
      (...args: unknown[]) =>
        call("team", String(method), args),
  },
) as TeamLeadService;
export const serverOperationsEmployeeDashboardService: EmployeeDashboardViewService =
  {
    getEmployeeDashboard: (...args) =>
      call("dashboard", "getEmployeeDashboard", args),
  };
export const serverOperationsManagementService: ManagementService = {
  getDashboard: (...args) => call("dashboard", "getManagementDashboard", args),
};
export const serverOperationsOrganizationService: Pick<
  OperationsService,
  | "listDivisions"
  | "listProjectsForDivision"
  | "listTasksForProject"
  | "getWorkEntryOptions"
> = {
  listDivisions: (...args) => call("organization", "listDivisions", args),
  listProjectsForDivision: (...args) =>
    call("organization", "listProjectsForDivision", args),
  listTasksForProject: (...args) =>
    call("organization", "listTasksForProject", args),
  getWorkEntryOptions: (...args) =>
    call("organization", "getWorkEntryOptions", args),
};
