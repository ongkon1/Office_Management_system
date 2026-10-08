import { afterEach, describe, expect, it, vi } from "vitest";
import { serverTimesheetService } from "./timesheet";
import { serverFinanceService } from "./finance";
import { serverAdminService } from "./admin";
import { serverEmployeeTaskService } from "./employee";
import { serverProfileService } from "./profile";
import { serverTaskReviewService } from "./task-review";
import { serverWorkspaceService } from "./workspace";
import {
  serverOperationsEmployeeDashboardService,
  serverOperationsOrganizationService,
  serverOperationsTeamLeadService,
} from "./operations";

describe("BE-0902 browser service transports", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reads timesheets with same-origin cookies and no cache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        json: vi.fn().mockResolvedValue({ status: "success", data: {} }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await serverTimesheetService.getDay({
      employeeId: "employee-1",
      date: "2026-09-02",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/time?"),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });
  it("sends finance view requests to the authenticated reporting boundary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        json: vi.fn().mockResolvedValue({ status: "success", data: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await serverFinanceService.listPeriods("user-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/reporting");
    expect(JSON.parse(String(init.body))).toMatchObject({
      operation: "client.finance",
      method: "listPeriods",
      userId: "user-1",
    });
  });
  it.each([
    [
      "admin",
      "/api/admin",
      () => serverAdminService.listDivisions("user-1"),
      "listDivisions",
    ],
    [
      "employee",
      "/api/employee",
      () => serverEmployeeTaskService.listForEmployee("employee-1"),
      "listForEmployee",
    ],
    [
      "profile",
      "/api/profile",
      () => serverProfileService.getOwnProfile("user-1"),
      "getOwnProfile",
    ],
    [
      "task review",
      "/api/task-review",
      () => serverTaskReviewService.queue("user-1"),
      "queue",
    ],
    [
      "workspace",
      "/api/workspace",
      () => serverWorkspaceService.getNotifications("user-1"),
      "getNotifications",
    ],
  ] as const)(
    "sends %s requests through its authenticated server boundary",
    async (_label, path, invoke, method) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({
          json: vi.fn().mockResolvedValue({ status: "success", data: [] }),
        });
      vi.stubGlobal("fetch", fetchMock);
      await invoke();
      expect(fetchMock).toHaveBeenCalledWith(
        path,
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          cache: "no-store",
        }),
      );
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(String(init.body))).toMatchObject({ method });
    },
  );
  it.each([
    [
      "employee dashboard",
      () =>
        serverOperationsEmployeeDashboardService.getEmployeeDashboard("user-1"),
      "dashboard",
      "getEmployeeDashboard",
    ],
    [
      "Team Lead dashboard",
      () => serverOperationsTeamLeadService.getDashboard("user-1"),
      "team",
      "getDashboard",
    ],
    [
      "work-entry options",
      () =>
        serverOperationsOrganizationService.getWorkEntryOptions(
          "employee-1",
          "2026-09-02",
        ),
      "organization",
      "getWorkEntryOptions",
    ],
  ] as const)(
    "sends %s through the consolidated operations boundary",
    async (_label, invoke, service, method) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({
          json: vi.fn().mockResolvedValue({ status: "success", data: {} }),
        });
      vi.stubGlobal("fetch", fetchMock);
      await invoke();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/operations",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          cache: "no-store",
        }),
      );
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(String(init.body))).toMatchObject({ service, method });
    },
  );
});
