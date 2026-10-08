import type { HrService } from "@/contracts/hr";
import { serverPost } from "./http";
import { serverOperationsHrService } from "./operations";

type Supported = HrService;
const call = <T>(method: string, args: readonly unknown[]) =>
  serverPost<T>("/api/hr", { operation: "client.hr", method, args });

export const serverHrService: Supported = {
  getDashboard: serverOperationsHrService.getDashboard,
  listDepartmentOptions: serverOperationsHrService.listDepartmentOptions,
  listEmployees: serverOperationsHrService.listEmployees,
  getEmployee: serverOperationsHrService.getEmployee,
  saveEmployee: serverOperationsHrService.saveEmployee,
  saveAssignment: serverOperationsHrService.saveAssignment,
  endAssignment: serverOperationsHrService.endAssignment,
  getAttendance: (...args) => call("getAttendance", args),
  listRequests: (...args) => call("listRequests", args),
  listDivisionRequestSummary: (...args) =>
    call("listDivisionRequestSummary", args),
  listLeaveBalances: (...args) => call("listLeaveBalances", args),
  decideRequest: (input) => call("decideRequest", [input]),
  listHolidays: (...args) => call("listHolidays", args),
  saveHoliday: (...args) => call("saveHoliday", args),
  setHolidayActive: (...args) => call("setHolidayActive", args),
  listPeriods: serverOperationsHrService.listPeriods,
  getPeriod: serverOperationsHrService.getPeriod,
  verifyPeriod: serverOperationsHrService.verifyPeriod,
  requestUnlock: serverOperationsHrService.requestUnlock,
  amendPeriod: serverOperationsHrService.amendPeriod,
  listEvaluationPeriods: (...args) => call("listEvaluationPeriods", args),
  createEvaluationPeriod: (...args) => call("createEvaluationPeriod", args),
  listEvaluations: (...args) => call("listEvaluations", args),
  getEvaluation: (...args) => call("getEvaluation", args),
  sendReminder: (...args) => call("sendReminder", args),
  publishEvaluation: (...args) => call("publishEvaluation", args),
  returnEvaluation: (...args) => call("returnEvaluation", args),
};
