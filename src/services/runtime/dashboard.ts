import type { EmployeeDashboardViewService } from "@/contracts/employee-views";
import type { ManagementService } from "@/contracts/finance";
import {
  serverOperationsEmployeeDashboardService,
  serverOperationsManagementService,
} from "@/services/server/operations";

export const employeeDashboardService: EmployeeDashboardViewService =
  serverOperationsEmployeeDashboardService;

export const managementService: ManagementService =
  serverOperationsManagementService;
