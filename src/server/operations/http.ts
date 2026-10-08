import { z } from "zod";
import { resultResponse } from "@/server/time/http";
import type { OperationsService } from "./service";

const allowed = {
  hr: new Set([
    "getDashboard",
    "listDepartmentOptions",
    "listEmployees",
    "getEmployee",
    "saveEmployee",
    "saveAssignment",
    "endAssignment",
    "listPeriods",
    "getPeriod",
    "verifyPeriod",
    "requestUnlock",
    "amendPeriod",
  ]),
  team: new Set([
    "getDashboard",
    "listMembers",
    "listTimesheets",
    "getTimesheet",
    "addRemark",
    "resolveRemark",
    "listProjects",
    "getProject",
    "saveProject",
    "listTasks",
    "getTask",
    "saveTask",
    "setTaskStatus",
    "listRequests",
    "decideRequest",
    "listWorkload",
    "listEvaluations",
    "getEvaluation",
    "saveEvaluation",
  ]),
  dashboard: new Set(["getEmployeeDashboard", "getManagementDashboard"]),
  organization: new Set([
    "listDivisions",
    "listProjectsForDivision",
    "listTasksForProject",
    "getWorkEntryOptions",
  ]),
} as const;
const command = z
  .object({
    service: z.enum(["hr", "team", "dashboard", "organization"]),
    method: z.string().min(1).max(64),
    args: z.array(z.unknown()).max(4),
  })
  .strict();
export async function handleOperationsRequest(
  request: Request,
  service: OperationsService,
  origin: string,
) {
  if (request.headers.get("origin") !== new URL(origin).origin)
    return resultResponse({
      status: "permission_denied",
      code: "FORBIDDEN",
      message: "The request origin is not allowed.",
    });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return resultResponse({
      status: "validation_failure",
      code: "VALIDATION_FAILED",
      message: "Send valid JSON for a supported operation.",
      fieldErrors: [],
    });
  }
  const parsed = command.safeParse(body);
  if (
    !parsed.success ||
    !allowed[parsed.data.service].has(parsed.data.method as never)
  )
    return resultResponse({
      status: "validation_failure",
      code: "VALIDATION_FAILED",
      message: "Choose a supported operation.",
      fieldErrors: [],
    });
  try {
    const method =
      parsed.data.service === "team" && parsed.data.method === "getDashboard"
        ? "getTeamDashboard"
        : parsed.data.method;
    return resultResponse(
      await Reflect.apply(
        Reflect.get(service, method),
        service,
        parsed.data.args,
      ),
    );
  } catch {
    return resultResponse({
      status: "error",
      code: "DEPENDENCY_FAILED",
      message: "The operation could not be completed.",
      retryable: true,
    });
  }
}
