import { describe, expect, it, vi } from "vitest";
import { handleOperationsRequest } from "./http";
import type { OperationsService } from "./service";

const origin = "http://localhost:3000";
const request = (body: unknown, requestOrigin = origin) =>
  new Request(`${origin}/api/operations`, {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("BE-0902 operations HTTP boundary", () => {
  it("rejects a cross-origin request before dispatch", async () => {
    const getEmployeeDashboard = vi.fn();
    const response = await handleOperationsRequest(
      request(
        {
          service: "dashboard",
          method: "getEmployeeDashboard",
          args: ["user-1"],
        },
        "https://other.invalid",
      ),
      { getEmployeeDashboard } as unknown as OperationsService,
      origin,
    );
    expect(response.status).toBe(403);
    expect(getEmployeeDashboard).not.toHaveBeenCalled();
  });

  it("rejects malformed and non-allowlisted operations", async () => {
    const service = {} as OperationsService;
    for (const body of [
      "{",
      { service: "organization", method: "dropDatabase", args: [] },
      { service: "unknown", method: "listDivisions", args: [] },
    ]) {
      const response = await handleOperationsRequest(
        request(body),
        service,
        origin,
      );
      expect(response.status).toBe(400);
    }
  });

  it("dispatches Team Lead dashboard compatibility to the canonical method", async () => {
    const getTeamDashboard = vi.fn().mockResolvedValue({
      status: "success",
      data: { marker: "team-dashboard" },
    });
    const response = await handleOperationsRequest(
      request({ service: "team", method: "getDashboard", args: ["user-1"] }),
      { getTeamDashboard } as unknown as OperationsService,
      origin,
    );
    expect(getTeamDashboard).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("forwards only the employee and date to authenticated work-option lookup", async () => {
    const getWorkEntryOptions = vi.fn().mockResolvedValue({
      status: "success",
      data: { divisions: [], projects: [], tasks: [] },
    });
    const response = await handleOperationsRequest(
      request({
        service: "organization",
        method: "getWorkEntryOptions",
        args: ["employee-1", "2026-09-02"],
      }),
      { getWorkEntryOptions } as unknown as OperationsService,
      origin,
    );
    expect(getWorkEntryOptions).toHaveBeenCalledWith(
      "employee-1",
      "2026-09-02",
    );
    expect(response.status).toBe(200);
  });

  it("does not leak infrastructure error details", async () => {
    const getEmployeeDashboard = vi
      .fn()
      .mockRejectedValue(new Error("mysql://secret-password"));
    const response = await handleOperationsRequest(
      request({
        service: "dashboard",
        method: "getEmployeeDashboard",
        args: ["user-1"],
      }),
      { getEmployeeDashboard } as unknown as OperationsService,
      origin,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-password");
  });
});
