import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  HrService,
  HrEmployeeRowView,
  HrAssignmentView,
  HrEmployeeDetailView,
  HrPeriodWorkspaceView,
} from "@/contracts/hr";
import type {
  TeamLeadService,
  TeamMemberView,
  TeamProjectView,
  ProjectActivityView,
  ProjectFormOptionsView,
  TeamTaskView,
  TeamRequestView,
  WorkloadMemberView,
  TeamEvaluationView,
} from "@/contracts/team-lead";
import type { ManagementDashboard } from "@/contracts/finance";
import type { WorkEntryOptions } from "@/contracts/work-options";
import type {
  Division,
  Project,
  Task,
  RoleKey,
  TaskStatus,
  Priority,
  ProjectStatus,
} from "@/contracts/domain";
import type { Result } from "@/contracts/results";
import type {
  DivisionRef,
  EmployeeRef,
  PeriodTotalsView,
  ProjectProgressView,
} from "@/contracts/view-models";
import { success } from "@/contracts/results";
import {
  isDuplicateKeyError,
  nextRecordCode,
} from "@/server/organization/record-codes";
import {
  formatDate,
  formatDateRange,
  formatDateWithWeekday,
  formatDurationDelta,
  formatMonth,
  formatMoney,
  formatTimestamp,
} from "@/lib/format";
import { money, storedMoney } from "@/lib/money";
import {
  ATTENDANCE_LABEL,
  REQUEST_STATE_LABEL,
  toDayStatusView,
  toDurationView,
} from "@/lib/status";
import { AuthenticationService } from "@/server/authentication/service";
import { MysqlAuthenticationStore } from "@/server/authentication/mysql-store";
import { loadActorPolicyContext } from "@/server/authorization/mysql-context";
import {
  hasPermission,
  type ActorPolicyContext,
} from "@/server/authorization/policy";
import { hashPassword } from "@/server/security/crypto";
import type { createHrServices } from "@/server/hr/composition";
import type { createTimeServices } from "@/server/time/composition";
import { businessToday } from "@/lib/business-date";
import { NotificationService } from "@/server/notifications/service";

type Row = RowDataPacket & Record<string, unknown>;
type HrServices = ReturnType<typeof createHrServices>;
type TimeServices = ReturnType<typeof createTimeServices>;
const today = businessToday;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES: readonly Priority[] = ["low", "medium", "high", "urgent"];
const PROJECT_STATUSES: readonly ProjectStatus[] = ["planned", "active", "on_hold", "completed", "closed"];
const PROJECT_FIELD_LABEL: Readonly<Record<string, string>> = {
  name: "name", client: "client", startDate: "start date", endDate: "end date", priority: "priority",
  estimate: "estimate", progress: "progress", notes: "notes", status: "status", manager: "manager",
  budget: "budget", members: "members",
};
/** Organisation-wide authority over projects. */
const isWideRole = (a: ActorPolicyContext) =>
  a.roles.includes("super_admin") || a.roles.includes("hr_manager");
/** Management/View-Only with no other role: may read, never change. */
const isReadOnly = (a: ActorPolicyContext) =>
  a.roles.includes("management") &&
  !a.roles.some((role) => ["super_admin", "hr_manager", "team_lead"].includes(role));
/** A role that carries project management — an appointment alone does not. */
const canCreateProject = (a: ActorPolicyContext) =>
  isWideRole(a) || a.roles.includes("team_lead");
const date = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const absent = (resource = "record"): Result<never> => ({
  status: "not_found",
  code: "NOT_FOUND",
  message: `${resource} was not found.`,
  resource,
});
const denied = (message = "You do not have permission."): Result<never> => ({
  status: "permission_denied",
  code: "FORBIDDEN",
  message,
});
const invalid = (
  field: string,
  message: string,
  guidance: string,
): Result<never> => ({
  status: "validation_failure",
  code: "VALIDATION_FAILED",
  message,
  focusField: field,
  fieldErrors: [{ field, code: "INVALID_VALUE", message, guidance }],
});
const conflict = (message: string, guidance: string): Result<never> => ({
  status: "conflict",
  code: "CONFLICT",
  message,
  guidance,
});
const employee = (r: Row, p = ""): EmployeeRef => ({
  id: String(r[`${p}id`]),
  employeeCode: String(r[`${p}employee_code`]),
  fullName: String(r[`${p}display_name`]),
  designation: r[`${p}job_title`] ? String(r[`${p}job_title`]) : null,
  avatarUrl: r[`${p}image_url`] ? String(r[`${p}image_url`]) : null,
});
const division = (r: Row, p = ""): DivisionRef => ({
  id: String(r[`${p}division_id`] ?? r[`${p}id`]),
  name: String(r[`${p}division_name`] ?? r[`${p}name`]),
  code: String(r[`${p}division_code`] ?? r[`${p}division_key`]),
  isRestricted: Boolean(r[`${p}division_restricted`] ?? r[`${p}is_government`]),
});
const periodTotals = (
  label: string,
  rows: readonly Row[],
): PeriodTotalsView => {
  const sum = (k: string) => rows.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  return {
    label,
    active: toDurationView(sum("active_minutes")),
    break: toDurationView(sum("break_minutes")),
    total: toDurationView(sum("total_minutes")),
    overtime: toDurationView(
      rows.reduce((n, r) => n + Math.max(0, Number(r.total_minutes) - 480), 0),
    ),
    requiredActive: toDurationView(sum("required_active_minutes")),
    completeDayCount: rows.filter((r) => r.classification === "complete")
      .length,
    underTimeDayCount: rows.filter((r) => r.classification === "under_time")
      .length,
    overtimeDayCount: rows.filter((r) => r.classification === "overtime")
      .length,
    criticalDayCount: rows.filter((r) => r.classification === "critical")
      .length,
    missingDayCount: rows.filter((r) => r.classification === "missing").length,
  };
};

export class OperationsService {
  private auth: AuthenticationService;
  constructor(
    private pool: Pool,
    private token: string,
    private hr: HrServices,
    private time: TimeServices,
  ) {
    this.auth = new AuthenticationService(new MysqlAuthenticationStore(pool));
  }
  private async actor(on = today()) {
    const s = await this.auth.validateSession(this.token);
    return s.status === "success"
      ? loadActorPolicyContext(this.pool, s.data.userId, on)
      : null;
  }
  private async identity(userId: string, on = today()) {
    const a = await this.actor(on);
    return a?.userId === userId ? a : null;
  }
  private async hrActor(userId: string) {
    const a = await this.identity(userId);
    return a &&
      (a.roles.includes("hr_manager") || a.roles.includes("super_admin"))
      ? a
      : null;
  }
  private async rows(
    sql: string,
    values: (string | number | boolean | null | Date)[] = [],
  ) {
    const [r] = await this.pool.execute<Row[]>(sql, values);
    return r;
  }
  private async transaction<T>(fn: (c: PoolConnection) => Promise<T>) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const v = await fn(c);
      await c.commit();
      return v;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  private async employeeRow(id: string) {
    return (
      (
        await this.rows(
          `SELECT e.*,u.email,u.image_url,u.status user_status,d.id division_id,d.name division_name,d.division_key division_code,d.is_government division_restricted FROM employees e JOIN users u ON u.id=e.user_id LEFT JOIN employee_division_assignments a ON a.employee_id=e.id AND a.is_primary=TRUE AND a.is_active=TRUE AND a.effective_from<=CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) LEFT JOIN divisions d ON d.id=a.division_id WHERE e.id=?`,
          [id],
        )
      )[0] ?? null
    );
  }
  private mapEmployeeRow(r: Row): HrEmployeeRowView {
    const missing = [
      ...(!r.phone ? ["Phone"] : []),
      ...(!r.office_location ? ["Office location"] : []),
      ...(!r.division_id ? ["Primary division"] : []),
    ];
    return {
      employee: employee(r),
      status: String(r.status) === "active" ? "active" : "inactive",
      statusLabel: String(r.status) === "active" ? "Active" : "Inactive",
      primaryDivision: r.division_id ? division(r) : null,
      divisionCodes: r.division_code ? [String(r.division_code)] : [],
      employmentType: String(
        r.employment_type ?? "full_time",
      ) as HrEmployeeRowView["employmentType"],
      employmentTypeLabel: String(r.employment_type ?? "full_time").replaceAll(
        "_",
        " ",
      ),
      workMode: String(
        r.normal_work_mode ?? "office",
      ) as HrEmployeeRowView["workMode"],
      workModeLabel: String(r.normal_work_mode ?? "office").replaceAll(
        "_",
        " ",
      ),
      joiningDateLabel: r.hire_date
        ? formatDate(date(r.hire_date))
        : "Not recorded",
      isProfileIncomplete: Boolean(missing.length),
      missingFields: missing,
      href: `/employees/${String(r.id)}`,
    };
  }

  async listDivisionOptions(userId: string) {
    if (!(await this.hrActor(userId))) return denied();
    const rows = await this.rows(
      "SELECT id,name,is_government FROM divisions WHERE is_active=TRUE ORDER BY name",
    );
    return success(
      rows.map((r) => ({
        value: String(r.id),
        label: String(r.name),
        isRestricted: Boolean(r.is_government),
      })),
    );
  }
  async listDepartmentOptions(userId: string, divisionId: string) {
    if (!(await this.hrActor(userId))) return denied();
    // The contract's option shape (`value`/`label`/`currentLead`), which is
    // what the placement controls read. The lead shown is the appointment
    // effective today — context only; the form never submits it.
    const rows = await this.rows(
      `SELECT d.id,d.name,d.division_id,d.is_active,e.id lead_id,e.employee_code lead_code,e.display_name lead_name,e.job_title lead_title,u.image_url lead_image
       FROM departments d
       LEFT JOIN department_lead_assignments l ON l.department_id=d.id AND l.effective_from<=CURRENT_DATE AND (l.effective_to IS NULL OR l.effective_to>=CURRENT_DATE)
       LEFT JOIN employees e ON e.id=l.lead_employee_id LEFT JOIN users u ON u.id=e.user_id
       WHERE d.division_id=? AND d.is_active=TRUE ORDER BY d.name`,
      [divisionId],
    );
    return success(
      rows.map((r) => ({
        value: String(r.id),
        label: String(r.name),
        divisionId: String(r.division_id),
        isActive: Boolean(r.is_active),
        currentLead: r.lead_id
          ? {
              id: String(r.lead_id),
              employeeCode: String(r.lead_code),
              fullName: String(r.lead_name),
              designation: r.lead_title ? String(r.lead_title) : null,
              avatarUrl: r.lead_image ? String(r.lead_image) : null,
            }
          : null,
      })),
    );
  }
  async listEmployees(
    userId: string,
    filters: Parameters<HrService["listEmployees"]>[1] = {},
  ) {
    if (!(await this.hrActor(userId))) return denied();
    const rows = await this.rows(
      `SELECT e.*,u.email,u.image_url,u.status user_status,d.id division_id,d.name division_name,d.division_key division_code,d.is_government division_restricted,GROUP_CONCAT(DISTINCT ad.division_key ORDER BY ad.division_key) division_codes FROM employees e JOIN users u ON u.id=e.user_id LEFT JOIN employee_division_assignments a ON a.employee_id=e.id AND a.is_primary=TRUE AND a.is_active=TRUE AND a.effective_from<=CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) LEFT JOIN divisions d ON d.id=a.division_id LEFT JOIN employee_division_assignments aa ON aa.employee_id=e.id AND aa.is_active=TRUE AND aa.effective_from<=CURRENT_DATE AND (aa.effective_to IS NULL OR aa.effective_to>=CURRENT_DATE) LEFT JOIN divisions ad ON ad.id=aa.division_id GROUP BY e.id,u.email,u.image_url,u.status,d.id,d.name,d.division_key,d.is_government ORDER BY e.display_name`,
    );
    let result = rows.map((r) => ({
      ...this.mapEmployeeRow(r),
      divisionCodes: String(r.division_codes ?? "")
        .split(",")
        .filter(Boolean),
    }));
    const f = filters ?? {};
    if (f.search)
      result = result.filter((x) =>
        `${x.employee.fullName} ${x.employee.employeeCode}`
          .toLowerCase()
          .includes(f.search!.trim().toLowerCase()),
      );
    if (f.status?.length)
      result = result.filter((x) => f.status!.includes(x.status));
    if (f.divisionIds?.length)
      result = result.filter(
        (x) =>
          x.primaryDivision && f.divisionIds!.includes(x.primaryDivision.id),
      );
    if (f.employmentTypes?.length)
      result = result.filter((x) =>
        f.employmentTypes!.includes(x.employmentType),
      );
    if (f.workModes?.length)
      result = result.filter((x) => f.workModes!.includes(x.workMode));
    if (f.incompleteOnly) result = result.filter((x) => x.isProfileIncomplete);
    return success(result);
  }
  private async assignments(employeeId: string): Promise<HrAssignmentView[]> {
    const rows = await this.rows(
      `SELECT a.*,d.id division_id,d.name division_name,d.division_key division_code,d.is_government division_restricted,dept.id department_id,dept.name department_name,dept.code department_code,le.id lead_id,le.employee_code lead_employee_code,le.display_name lead_display_name,le.job_title lead_job_title,lu.image_url lead_image_url FROM employee_division_assignments a JOIN divisions d ON d.id=a.division_id LEFT JOIN departments dept ON dept.id=a.department_id LEFT JOIN department_lead_assignments dla ON dla.department_id=dept.id AND dla.effective_from<=CURRENT_DATE AND (dla.effective_to IS NULL OR dla.effective_to>=CURRENT_DATE) LEFT JOIN employees le ON le.id=COALESCE(dla.lead_employee_id,a.lead_employee_id) LEFT JOIN users lu ON lu.id=le.user_id WHERE a.employee_id=? ORDER BY a.effective_from DESC`,
      [employeeId],
    );
    const now = today();
    return rows.map((r) => {
      const from = date(r.effective_from),
        to = r.effective_to ? date(r.effective_to) : null;
      return {
        id: String(r.id),
        employeeId,
        division: division(r),
        department: {
          id: String(r.department_id ?? ""),
          name: String(r.department_name ?? "Not assigned"),
          code: String(r.department_code ?? "—"),
        },
        isPrimary: Boolean(r.is_primary),
        effectiveTeamLead: r.lead_id ? employee(r, "lead_") : null,
        allocationPercent: Number(r.allocation_percent_basis_points) / 100,
        expectedWeekly: toDurationView(Number(r.expected_weekly_minutes)),
        startDate: from,
        startDateLabel: formatDate(from),
        endDate: to,
        endDateLabel: to ? formatDate(to) : null,
        isTemporary: Boolean(r.is_temporary),
        isActive: Boolean(r.is_active),
        isEffectiveToday:
          Boolean(r.is_active) && from <= now && (!to || to >= now),
        roleInDivision: r.role_in_division ? String(r.role_in_division) : null,
      };
    });
  }
  async getEmployee(
    userId: string,
    employeeId: string,
  ): Promise<Result<HrEmployeeDetailView>> {
    if (!(await this.hrActor(userId))) return absent("Employee");
    const r = await this.employeeRow(employeeId);
    if (!r) return absent("Employee");
    const assignments = await this.assignments(employeeId);
    const month = today().slice(0, 7);
    const sums = await this.rows(
      "SELECT * FROM daily_summaries WHERE employee_id=? AND work_date BETWEEN ? AND ?",
      [employeeId, `${month}-01`, `${month}-31`],
    );
    const roles = await this.rows(
      `SELECT r.role_key FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)`,
      [String(r.user_id)],
    );
    const role =
      (["hr_manager", "team_lead", "employee"] as RoleKey[]).find((k) =>
        roles.some((x) => x.role_key === k),
      ) ?? "employee";
    const base = this.mapEmployeeRow(r);
    return success({
      employee: base.employee,
      userRole: role as HrEmployeeDetailView["userRole"],
      status: base.status,
      statusLabel: base.statusLabel,
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      officeLocation: r.office_location ? String(r.office_location) : null,
      employmentType: base.employmentType,
      employmentTypeLabel: base.employmentTypeLabel,
      joiningDateLabel: base.joiningDateLabel,
      workMode: base.workMode,
      workModeLabel: base.workModeLabel,
      skills: Array.isArray(r.skills)
        ? r.skills
        : JSON.parse(String(r.skills ?? "[]")),
      standardDaily: toDurationView(
        Number(r.standard_daily_active_minutes ?? 420),
      ),
      standardWeekly: toDurationView(
        Number(r.standard_weekly_active_minutes ?? 2100),
      ),
      workPolicyLabel: "Standard day",
      missingFields: base.missingFields,
      assignments,
      totalAllocationPercent: assignments
        .filter((a) => a.isEffectiveToday)
        .reduce((n, a) => n + a.allocationPercent, 0),
      allocationWarning: null,
      projects: [],
      monthly: periodTotals(formatMonth(month), sums),
      attendance: [],
      wfh: [],
      leave: [],
      leaveBalances: [],
      evaluations: [],
      remarks: [],
      documents: [],
      auditHistory: [],
    });
  }
  async saveEmployee(
    userId: string,
    input: Parameters<HrService["saveEmployee"]>[1],
    employeeId?: string,
  ) {
    const actor = await this.hrActor(userId);
    if (!actor) return denied();
    if (!input.fullName.trim())
      return invalid(
        "fullName",
        "Enter the employee name.",
        "Use the employment record name.",
      );
    if (!input.email.trim())
      return invalid(
        "email",
        "Enter a work email.",
        "The employee signs in with this address.",
      );
    if (
      !employeeId &&
      (!input.initialPassword || input.initialPassword.length < 12)
    )
      return invalid(
        "initialPassword",
        "Use at least 12 characters.",
        "Create a secure initial password.",
      );
    const emailOwner = await this.rows(
      "SELECT u.id FROM users u LEFT JOIN employees e ON e.user_id=u.id WHERE u.email_normalized=? AND (e.id IS NULL OR e.id<>COALESCE(?,''))",
      [input.email.trim().toLowerCase(), employeeId ?? null],
    );
    if (emailOwner[0])
      return conflict(
        "That work email is already in use.",
        "Use the employee's own work email address.",
      );
    // A new employee is placed in the same transaction that creates them.
    // Without this the account existed with no division, so it could record
    // no time and appeared in no division until HR added a placement by hand.
    if (!employeeId) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.joiningDate ?? ""))
        return invalid(
          "joiningDate",
          "Enter the joining date.",
          "The primary division assignment starts on this date.",
        );
      const division = await this.rows(
        "SELECT id FROM divisions WHERE id=? AND is_active=TRUE",
        [input.primaryDivisionId ?? ""],
      );
      if (!division[0])
        return invalid(
          "primaryDivisionId",
          "Choose an active primary division.",
          "Select a division from the list.",
        );
      const department = await this.rows(
        "SELECT id FROM departments WHERE id=? AND division_id=? AND is_active=TRUE",
        [input.primaryDepartmentId ?? "", input.primaryDivisionId],
      );
      if (!department[0])
        return invalid(
          "primaryDepartmentId",
          "Choose an active department in the primary division.",
          "If the list is empty, a Super Administrator must create a department for this division first.",
        );
    }
    const id = employeeId ?? randomUUID();
    try {
    await this.transaction(async (c) => {
      if (employeeId) {
        await c.execute(
          // The employee code is not updated: it is assigned once on create.
          `UPDATE employees e JOIN users u ON u.id=e.user_id SET e.display_name=?,e.job_title=?,e.employment_type=?,e.hire_date=?,e.phone=?,e.office_location=?,e.normal_work_mode=?,e.standard_daily_active_minutes=?,e.standard_weekly_active_minutes=?,e.skills=?,e.status=?,u.name=?,u.email=?,u.email_normalized=?,u.status=?,e.version=e.version+1,u.version=u.version+1 WHERE e.id=?`,
          [
            input.fullName.trim(),
            input.designation.trim(),
            input.employmentType,
            input.joiningDate,
            input.phone || null,
            input.officeLocation || null,
            input.normalWorkMode,
            input.standardDailyActiveMinutes,
            input.standardWeeklyActiveMinutes,
            JSON.stringify(input.skills),
            input.status,
            input.fullName.trim(),
            input.email.trim(),
            input.email.trim().toLowerCase(),
            input.status,
            id,
          ],
        );
      } else {
        const uid = randomUUID();
        const employeeCode = await nextRecordCode(c, "employee");
        await c.execute(
          "INSERT INTO users(id,name,email,email_normalized,employee_identifier,status) VALUES(?,?,?,?,?,?)",
          [
            uid,
            input.fullName.trim(),
            input.email.trim(),
            input.email.trim().toLowerCase(),
            employeeCode,
            input.status,
          ],
        );
        await c.execute(
          "INSERT INTO employees(id,user_id,employee_code,display_name,job_title,hire_date,employment_type,phone,office_location,normal_work_mode,standard_daily_active_minutes,standard_weekly_active_minutes,skills,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            uid,
            employeeCode,
            input.fullName.trim(),
            input.designation.trim(),
            input.joiningDate,
            input.employmentType,
            input.phone || null,
            input.officeLocation || null,
            input.normalWorkMode,
            input.standardDailyActiveMinutes,
            input.standardWeeklyActiveMinutes,
            JSON.stringify(input.skills),
            input.status,
          ],
        );
        await c.execute(
          "INSERT INTO auth_accounts(id,user_id,provider_id,account_id,password_hash) VALUES(?,?,'credential',?,?)",
          [
            randomUUID(),
            uid,
            input.email.trim().toLowerCase(),
            await hashPassword(input.initialPassword!),
          ],
        );
        const role = actor.roles.includes("super_admin")
          ? (input.userRole ?? "employee")
          : "employee";
        for (const key of role === "team_lead"
          ? ["employee", "team_lead"]
          : [role])
          await c.execute(
            "INSERT INTO user_roles(id,user_id,role_id,effective_from) SELECT ?,?,id,CURRENT_DATE FROM roles WHERE role_key=? AND is_active=TRUE",
            [randomUUID(), uid, key],
          );
        await c.execute(
          "INSERT INTO employee_division_assignments(id,employee_id,division_id,department_id,effective_from,allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_temporary,is_active) VALUES(?,?,?,?,?,10000,?,TRUE,FALSE,TRUE)",
          [
            randomUUID(),
            id,
            input.primaryDivisionId,
            input.primaryDepartmentId!,
            input.joiningDate,
            input.standardWeeklyActiveMinutes,
          ],
        );
      }
    });
    } catch (error) {
      if (isDuplicateKeyError(error))
        return conflict(
          "Another record took that identifier or email at the same moment.",
          "Save again; a new employee ID is assigned automatically.",
        );
      throw error;
    }
    const r = await this.employeeRow(id);
    return r ? success(this.mapEmployeeRow(r)) : absent("Employee");
  }
  async saveAssignment(
    userId: string,
    input: Parameters<HrService["saveAssignment"]>[1],
    assignmentId?: string,
  ) {
    if (!(await this.hrActor(userId))) return denied();
    if (input.endDate && input.endDate < input.startDate)
      return invalid(
        "endDate",
        "The end date cannot be before the start date.",
        "Choose an ordered range.",
      );
    const dep = await this.rows(
      "SELECT id FROM departments WHERE id=? AND division_id=? AND is_active=TRUE",
      [input.departmentId, input.divisionId],
    );
    if (!dep[0])
      return invalid(
        "departmentId",
        "Choose an active department in this division.",
        "Reload department options.",
      );
    const id = assignmentId ?? randomUUID();
    await this.transaction(async (c) => {
      if (input.isPrimary)
        await c.execute(
          "UPDATE employee_division_assignments SET is_primary=FALSE,version=version+1 WHERE employee_id=? AND id<>?",
          [input.employeeId, id],
        );
      if (assignmentId)
        await c.execute(
          "UPDATE employee_division_assignments SET division_id=?,department_id=?,effective_from=?,effective_to=?,allocation_percent_basis_points=?,expected_weekly_minutes=?,is_primary=?,is_temporary=?,is_active=?,role_in_division=?,version=version+1 WHERE id=?",
          [
            input.divisionId,
            input.departmentId,
            input.startDate,
            input.endDate,
            input.allocationPercent * 100,
            input.expectedWeeklyMinutes,
            input.isPrimary,
            input.isTemporary,
            input.isActive,
            input.roleInDivision || null,
            id,
          ],
        );
      else
        await c.execute(
          "INSERT INTO employee_division_assignments(id,employee_id,division_id,department_id,effective_from,effective_to,allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_temporary,is_active,role_in_division) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            input.employeeId,
            input.divisionId,
            input.departmentId,
            input.startDate,
            input.endDate,
            input.allocationPercent * 100,
            input.expectedWeeklyMinutes,
            input.isPrimary,
            input.isTemporary,
            input.isActive,
            input.roleInDivision || null,
          ],
        );
    });
    return success(await this.assignments(input.employeeId));
  }
  async endAssignment(userId: string, assignmentId: string, endDate: string) {
    if (!(await this.hrActor(userId))) return denied();
    const rows = await this.rows(
      "SELECT employee_id,effective_from FROM employee_division_assignments WHERE id=?",
      [assignmentId],
    );
    if (!rows[0]) return absent("Assignment");
    if (endDate < date(rows[0].effective_from))
      return invalid(
        "endDate",
        "The end date cannot be before the start date.",
        "Choose a later date.",
      );
    await this.pool.execute(
      "UPDATE employee_division_assignments SET effective_to=?,is_active=?,version=version+1 WHERE id=?",
      [endDate, endDate >= today(), assignmentId],
    );
    return success(await this.assignments(String(rows[0].employee_id)));
  }

  async listPeriods(userId: string) {
    if (!(await this.hrActor(userId))) return denied();
    const rows = await this.rows(
      "SELECT id FROM timesheet_periods ORDER BY end_date DESC",
    );
    const out = [];
    for (const r of rows) {
      const v = await this.getPeriod(userId, String(r.id));
      if (v.status === "success") out.push(v.data);
    }
    return success(out);
  }
  async getPeriod(
    userId: string,
    periodId: string,
  ): Promise<Result<HrPeriodWorkspaceView>> {
    if (!(await this.hrActor(userId))) return absent("Period");
    const p = (
      await this.rows(
        `SELECT tp.*,pv.version_number,u.name verified_name FROM timesheet_periods tp JOIN policy_versions pv ON pv.id=tp.policy_version_id LEFT JOIN users u ON u.id=tp.verified_by_user_id WHERE tp.id=?`,
        [periodId],
      )
    )[0];
    if (!p) return absent("Period");
    const summary = await this.time.periods.getVerificationSummary(periodId);
    if (summary.status !== "success")
      return summary as Result<HrPeriodWorkspaceView>;
    const days = await this.rows(
      "SELECT ds.*,e.display_name,e.employee_code,e.job_title,u.image_url FROM daily_summaries ds JOIN employees e ON e.id=ds.employee_id JOIN users u ON u.id=e.user_id WHERE ds.work_date BETWEEN ? AND ? ORDER BY e.display_name,ds.work_date",
      [date(p.start_date), date(p.end_date)],
    );
    const grouped = new Map<string, Row[]>();
    for (const d of days)
      grouped.set(String(d.employee_id), [
        ...(grouped.get(String(d.employee_id)) ?? []),
        d,
      ]);
    const rows = [...grouped.entries()].map(([id, x]) => ({
      employee: employee({
        ...x[0],
        id,
        employee_code: x[0].employee_code,
        display_name: x[0].display_name,
      }),
      recordedDays: x.filter((d) => Number(d.active_minutes) > 0).length,
      requiredDays: x.filter((d) => Number(d.required_active_minutes) > 0)
        .length,
      completenessPercent: x.length
        ? Math.round(
            (x.filter((d) => d.classification === "complete").length * 100) /
              x.length,
          )
        : 0,
      active: toDurationView(
        x.reduce((n, d) => n + Number(d.active_minutes), 0),
      ),
      missingDays: x.filter((d) => d.classification === "missing").length,
      underTimeDays: x.filter((d) => d.classification === "under_time").length,
      overtimeDays: x.filter((d) => d.classification === "overtime").length,
      criticalDays: x.filter((d) => d.classification === "critical").length,
      unresolvedCorrections: 0,
      isReady: x.every(
        (d) => !["missing", "under_time"].includes(String(d.classification)),
      ),
      href: `/employees/${id}`,
    }));
    return success({
      periodId,
      label: String(p.label),
      rangeLabel: formatDateRange(date(p.start_date), date(p.end_date)),
      startDate: date(p.start_date),
      endDate: date(p.end_date),
      includedDateCount:
        Math.round(
          (new Date(date(p.end_date)).getTime() -
            new Date(date(p.start_date)).getTime()) /
            86400000,
        ) + 1,
      status: String(p.status) as HrPeriodWorkspaceView["status"],
      statusLabel: String(p.status).replaceAll("_", " "),
      policyVersion: Number(p.version_number),
      employeeCount: summary.data.employeeCount,
      completeEmployeeCount: summary.data.completeEmployeeCount,
      openExceptionCount: summary.data.openExceptionCount,
      unresolvedCorrectionCount: summary.data.unresolvedCorrectionCount,
      verifiedAtLabel: p.verified_at
        ? formatTimestamp(new Date(p.verified_at as Date).toISOString())
        : null,
      verifiedByLabel: p.verified_name ? String(p.verified_name) : null,
      canVerify: summary.data.canVerify,
      canAmend: summary.data.canAmend,
      blockedReason: summary.data.openExceptionCount
        ? `${summary.data.openExceptionCount} exception(s) remain.`
        : null,
      unlockRequest: null,
      rows,
      amendments: [],
    });
  }
  async verifyPeriod(input: Parameters<HrService["verifyPeriod"]>[0]) {
    if (!(await this.hrActor(input.userId))) return denied();
    const current = await this.getPeriod(input.userId, input.periodId);
    if (current.status !== "success") return current;
    if (current.data.openExceptionCount && !input.acknowledgedExceptions)
      return conflict(
        "Open exceptions remain.",
        "Acknowledge the exceptions before verification.",
      );
    const r = await this.time.periods.verify({
      periodId: input.periodId,
      note: input.acknowledgedExceptions ? "Exceptions acknowledged." : null,
      idempotencyKey: randomUUID(),
    });
    return r.status === "success"
      ? this.getPeriod(input.userId, input.periodId)
      : (r as Result<HrPeriodWorkspaceView>);
  }
  async requestUnlock(input: Parameters<HrService["requestUnlock"]>[0]) {
    if (!(await this.hrActor(input.userId))) return denied();
    const r = await this.time.periods.requestUnlock({
      periodId: input.periodId,
      reason: input.reason,
    });
    return r.status === "success"
      ? this.getPeriod(input.userId, input.periodId)
      : (r as Result<HrPeriodWorkspaceView>);
  }
  async amendPeriod(input: Parameters<HrService["amendPeriod"]>[0]) {
    if (!(await this.hrActor(input.userId))) return denied();
    const entry = (
      await this.rows(
        "SELECT te.id,te.version FROM time_entries te JOIN timesheet_periods p ON te.work_date BETWEEN p.start_date AND p.end_date WHERE p.id=? AND te.employee_id=? ORDER BY te.work_date LIMIT 1",
        [input.periodId, input.employeeId],
      )
    )[0];
    if (!entry) return absent("Work log");
    const r = await this.time.periods.amend({
      periodId: input.periodId,
      recordId: String(entry.id),
      reason: input.reason,
      changes: {
        completedWork: input.after,
        expectedVersion: Number(entry.version),
      },
      idempotencyKey: randomUUID(),
    });
    return r.status === "success"
      ? this.getPeriod(input.userId, input.periodId)
      : (r as Result<HrPeriodWorkspaceView>);
  }

  async getDashboard(userId: string) {
    if (!(await this.hrActor(userId))) return denied();
    const employees = await this.listEmployees(userId);
    if (employees.status !== "success") return employees;
    const month = today().slice(0, 7),
      sums = await this.rows(
        "SELECT * FROM daily_summaries WHERE work_date BETWEEN ? AND ?",
        [`${month}-01`, `${month}-31`],
      );
    const divisions = await this.rows(
      `SELECT d.*,COUNT(DISTINCT a.employee_id) count FROM divisions d LEFT JOIN employee_division_assignments a ON a.division_id=d.id AND a.is_active=TRUE AND a.effective_from<=CURRENT_DATE AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) GROUP BY d.id ORDER BY d.name`,
    );
    const periods = await this.listPeriods(userId);
    return success({
      totalEmployees: employees.data.length,
      activeEmployees: employees.data.filter((e) => e.status === "active")
        .length,
      divisionCount: divisions.length,
      divisionHeadcount: divisions.map((r) => ({
        division: division(r),
        count: Number(r.count),
      })),
      attendanceBreakdown: [],
      exceptions: {
        missing: {
          key: "missing",
          label: "Missing",
          value: String(
            sums.filter((r) => r.classification === "missing").length,
          ),
          href: "/attendance",
        },
        underTime: {
          key: "under",
          label: "Under-time",
          value: String(
            sums.filter((r) => r.classification === "under_time").length,
          ),
          href: "/attendance",
        },
        overtime: {
          key: "over",
          label: "Overtime",
          value: String(
            sums.filter((r) => r.classification === "overtime").length,
          ),
          href: "/attendance",
        },
        critical: {
          key: "critical",
          label: "Critical",
          value: String(
            sums.filter((r) => r.classification === "critical").length,
          ),
          href: "/attendance",
        },
      },
      monthlyHours: periodTotals(formatMonth(month), sums),
      openEvaluationPeriods: [],
      wfhTrend: [],
      workloadConcerns: [],
      incompleteProfiles: employees.data.filter((e) => e.isProfileIncomplete)
        .length,
      pendingVerification:
        periods.status === "success"
          ? (periods.data.find(
              (p) => p.status !== "verified" && p.status !== "amended",
            ) ?? null)
          : null,
      recentAssignments: [],
    });
  }

  private async lead(userId: string) {
    const a = await this.identity(userId);
    return a &&
      (a.roles.includes("team_lead") || (a.departmentIds?.size ?? 0) > 0)
      ? a
      : null;
  }
  async getTeamDashboard(userId: string) {
    const actor = await this.lead(userId);
    if (!actor) return denied("Team Lead access is not currently effective.");
    const members = await this.listMembers(userId);
    if (members.status !== "success") return members;
    const projects = await this.listProjects(userId);
    const requests = await this.listRequests(userId);
    const timesheets = await this.listTimesheets(userId);
    const departments = await this.rows(
      `SELECT dept.id,dept.name,dept.division_id,d.name division_name,d.is_government,dla.effective_from,
       (SELECT COUNT(*) FROM employee_division_assignments ea WHERE ea.department_id=dept.id AND ea.is_active=TRUE AND ea.effective_from<=CURRENT_DATE AND (ea.effective_to IS NULL OR ea.effective_to>=CURRENT_DATE)) member_count
       FROM department_lead_assignments dla JOIN departments dept ON dept.id=dla.department_id JOIN divisions d ON d.id=dept.division_id
       WHERE dla.lead_employee_id=? AND dla.effective_from<=CURRENT_DATE AND (dla.effective_to IS NULL OR dla.effective_to>=CURRENT_DATE)`,
      [actor.employeeId ?? ""],
    );
    const count = (status: string) =>
      members.data.filter((member) => member.status.status === status).length;
    const metric = (key: string, label: string, value: number) => ({
      key,
      label,
      value: String(value),
      href: "/team/timesheets",
    });
    const projectProgress: ProjectProgressView[] =
      projects.status === "success"
        ? projects.data.map((project) => ({
            project: {
              id: project.id,
              name: project.name,
              code: project.code,
              divisionId: project.division.id,
            },
            completionPercent: project.completionPercent,
            estimated: project.estimated,
            actual: project.actual,
            variancePercent: project.estimated.minutes
              ? Math.round(
                  ((project.actual.minutes - project.estimated.minutes) * 100) /
                    project.estimated.minutes,
                )
              : null,
            status: project.status,
            budget: null,
            href: `/projects/${project.id}`,
          }))
        : [];
    return success({
      leadScope: {
        departments: departments.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          divisionId: String(row.division_id),
          divisionName: String(row.division_name),
          isRestricted: Boolean(row.is_government),
          effectiveFromLabel: formatDate(date(row.effective_from)),
          memberCount: Number(row.member_count),
        })),
        divisionCount: new Set(
          departments.map((row) => String(row.division_id)),
        ).size,
        fromAppointmentOnly: !actor.roles.includes("team_lead"),
        scheduled: [],
      },
      assignedHeadcount: members.data.length,
      workingToday: members.data.filter((member) => member.active.minutes > 0)
        .length,
      attendanceBreakdown: [],
      exceptions: {
        missing: metric("missing", "Missing", count("missing")),
        underTime: metric("under", "Under-time", count("under_time")),
        overtime: metric("over", "Overtime", count("overtime")),
        critical: metric("critical", "Critical", count("critical")),
      },
      divisionHours: [],
      projectProgress,
      pendingTasks: 0,
      overdueTasks: 0,
      pendingRequests:
        requests.status === "success"
          ? requests.data
              .filter((request) => request.state === "pending")
              .map((request) => ({
                id: request.id,
                kind: request.kind,
                employee: request.employee,
                dateLabel: request.dateLabel,
                portionLabel: request.portionLabel,
                reason: request.reason,
                state: request.state,
                stateLabel: REQUEST_STATE_LABEL[request.state],
                decidedByLabel: null,
                wasOverridden: false,
                href: `/${request.kind}/${request.id}`,
              }))
          : [],
      workloadWarnings: [],
      recentEntries:
        timesheets.status === "success" ? timesheets.data.slice(0, 8) : [],
      evaluationStatus: null,
    });
  }
  async listMembers(
    userId: string,
  ): Promise<Result<readonly TeamMemberView[]>> {
    const a = await this.lead(userId);
    if (!a) return denied("Team Lead access is not currently effective.");
    const ids = [...a.employeeIds].filter((id) => id !== a.employeeId);
    const out = [];
    for (const id of ids) {
      const r = await this.employeeRow(id);
      if (!r) continue;
      const sum = (
        await this.rows(
          "SELECT * FROM daily_summaries WHERE employee_id=? AND work_date=?",
          [id, today()],
        )
      )[0];
      const deps = await this.rows(
        `SELECT dept.id,dept.name,d.id division_id,d.name division_name,d.division_key division_code,d.is_government division_restricted FROM employee_division_assignments ea JOIN departments dept ON dept.id=ea.department_id JOIN divisions d ON d.id=ea.division_id WHERE ea.employee_id=? AND ea.department_id IN (${[...(a.departmentIds ?? [])].map(() => "?").join(",") || "''"}) AND ea.is_active=TRUE AND ea.effective_from<=CURRENT_DATE AND (ea.effective_to IS NULL OR ea.effective_to>=CURRENT_DATE)`,
        [id, ...(a.departmentIds ?? [])],
      );
      out.push({
        employee: employee(r),
        divisions: [
          ...new Map(
            (await this.assignments(id))
              .filter((x) => x.isEffectiveToday)
              .map((x) => [x.division.id, x.division]),
          ).values(),
        ],
        departments: deps.map((x) => ({
          id: String(x.id),
          name: String(x.name),
          division: division(x),
        })),
        attendanceLabel: sum ? ATTENDANCE_LABEL.office : "No record",
        active: toDurationView(Number(sum?.active_minutes ?? 0)),
        status: toDayStatusView(
          String(sum?.classification ?? "missing") as Parameters<
            typeof toDayStatusView
          >[0],
        ),
        openRemarkCount: Number(
          (
            await this.rows(
              "SELECT COUNT(*) count FROM general_remarks WHERE employee_id=? AND status<>'resolved'",
              [id],
            )
          )[0]?.count ?? 0,
        ),
      });
    }
    return success(out);
  }
  async listTimesheets(userId: string) {
    const a = await this.lead(userId);
    if (!a) return denied();
    return this.time.teamTimesheets
      .listTeamDays({
        pagination: { page: 1, pageSize: 100 },
        filters: {
          employeeIds: [...a.employeeIds],
          dateRange: { from: today(), to: today() },
        },
      })
      .then((r) => (r.status === "success" ? success(r.data.items) : r));
  }
  async getTimesheet(userId: string, employeeId: string, on: string) {
    const a = await this.lead(userId);
    if (!a || !a.employeeIds.has(employeeId)) return absent("Timesheet");
    return this.time.teamTimesheets.getEmployeeDay({ employeeId, date: on });
  }
  async addRemark(input: Parameters<TeamLeadService["addRemark"]>[0]) {
    const a = await this.lead(input.userId);
    if (!a || !a.employeeIds.has(input.employeeId)) return absent("Employee");
    return this.time.remarks
      .create({
        employeeId: input.employeeId,
        message: input.message,
        relatedRecord: input.workLogId
          ? { type: "task", taskId: input.workLogId }
          : { type: "timesheet", workDate: input.date },
        isCorrectionRequest: Boolean(input.requestedChanges),
        requestedChanges: input.requestedChanges,
      })
      .then((r) =>
        r.status === "success"
          ? success({ id: r.data.id, state: r.data.state })
          : r,
      );
  }
  async resolveRemark(input: Parameters<TeamLeadService["resolveRemark"]>[0]) {
    if (!(await this.lead(input.userId))) return denied();
    return this.time.remarks
      .resolve({ remarkId: input.remarkId })
      .then((r) =>
        r.status === "success" ? success({ state: r.data.state }) : r,
      );
  }
  /**
   * Project reach, decided per row from live data.
   *
   * This replaces a filter on `actor.projectIds`, which only `scoped_grants`
   * fills and nothing writes — so every project list was empty, a project
   * vanished the moment it was saved, and every task under it was hidden.
   *
   * View: Super Administrator and HR (all), Management (all, read only), a
   * Team Lead over projects in the divisions they are placed in, the project's
   * manager, its active members, and anyone with a task on it.
   * Manage: Super Administrator, HR, a Team Lead in the project's division,
   * and the project's manager. A department appointment alone grants neither —
   * it is authority over people, never over a project.
   * Government projects additionally need `organization.government.view`.
   */
  private async projectAccess(a: ActorPolicyContext) {
    const me = a.employeeId ?? "";
    const on = today();
    const rows = await this.rows(
      `SELECT p.id,p.division_id,p.manager_employee_id,d.is_government,
        EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.employee_id=? AND pm.is_active=TRUE
          AND pm.effective_from<=? AND (pm.effective_to IS NULL OR pm.effective_to>=?)) is_member,
        EXISTS(SELECT 1 FROM tasks t WHERE t.project_id=p.id AND t.is_active=TRUE
          AND (t.assignee_employee_id=? OR EXISTS(SELECT 1 FROM task_members tm WHERE tm.task_id=t.id AND tm.employee_id=?))) has_task
       FROM projects p JOIN divisions d ON d.id=p.division_id`,
      [me, on, on, me, me],
    );
    const wide = isWideRole(a);
    const government = hasPermission(a, "organization.government.view");
    const access = new Map<string, { manage: boolean; divisionId: string }>();
    for (const r of rows) {
      if (r.is_government && !government) continue;
      const divisionId = String(r.division_id);
      const manage =
        wide ||
        (a.employeeId !== null && String(r.manager_employee_id) === a.employeeId) ||
        (a.roles.includes("team_lead") && a.divisionIds.has(divisionId));
      const view =
        manage ||
        a.roles.includes("management") ||
        a.projectIds.has(String(r.id)) ||
        Boolean(r.is_member) ||
        Boolean(r.has_task);
      if (view) access.set(String(r.id), { manage: manage && !isReadOnly(a), divisionId });
    }
    return access;
  }
  private async projectRows(ids: readonly string[]) {
    if (!ids.length) return [];
    return this.rows(
      `SELECT p.*,d.name division_name,d.division_key division_code,d.is_government division_restricted,e.id manager_id,e.employee_code manager_employee_code,e.display_name manager_display_name,e.job_title manager_job_title,u.image_url manager_image_url,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id=p.id AND pm.is_active=TRUE AND pm.effective_from<=CURRENT_DATE AND (pm.effective_to IS NULL OR pm.effective_to>=CURRENT_DATE)) member_count,
        (SELECT COALESCE(SUM(te.active_minutes),0) FROM time_entries te WHERE te.project_id=p.id AND te.is_active=TRUE AND te.status<>'draft') actual_minutes
       FROM projects p JOIN divisions d ON d.id=p.division_id JOIN employees e ON e.id=p.manager_employee_id JOIN users u ON u.id=e.user_id
       WHERE p.id IN (${ids.map(() => "?").join(",")}) ORDER BY p.name`,
      [...ids],
    );
  }
  /** Current members of each project, in one query. */
  private async projectMembers(ids: readonly string[]) {
    const members = new Map<string, EmployeeRef[]>();
    if (!ids.length) return members;
    const rows = await this.rows(
      `SELECT pm.project_id,e.id,e.employee_code,e.display_name,e.job_title,u.image_url
       FROM project_members pm JOIN employees e ON e.id=pm.employee_id JOIN users u ON u.id=e.user_id
       WHERE pm.project_id IN (${ids.map(() => "?").join(",")}) AND pm.is_active=TRUE
         AND pm.effective_from<=? AND (pm.effective_to IS NULL OR pm.effective_to>=?)
       ORDER BY e.display_name`,
      [...ids, today(), today()],
    );
    for (const r of rows) {
      const list = members.get(String(r.project_id)) ?? [];
      list.push(employee(r));
      members.set(String(r.project_id), list);
    }
    return members;
  }
  private async projectActivity(id: string): Promise<ProjectActivityView[]> {
    const rows = await this.rows(
      `SELECT a.event_id,a.action,a.after_protected,a.occurred_at,u.name actor_name FROM audit_events a
       LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.resource_type='project' AND a.resource_id=?
       ORDER BY a.occurred_at DESC,a.sequence_id DESC LIMIT 50`,
      [id],
    );
    return rows.map((r) => {
      const after = (typeof r.after_protected === "string" ? JSON.parse(r.after_protected) : r.after_protected) as { changedFields?: string[] } | null;
      const fields = (after?.changedFields ?? []).map((field) => PROJECT_FIELD_LABEL[field] ?? field);
      return {
        id: String(r.event_id),
        label: r.action === "project.created"
          ? "Project created"
          : fields.length ? `Updated ${fields.join(", ")}` : "Project saved with no changes",
        actorName: r.actor_name ? String(r.actor_name) : "System",
        atLabel: formatTimestamp(r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at)),
      };
    });
  }
  private mapProject(
    r: Row,
    manage: boolean,
    canSeeCost: boolean,
    members: readonly EmployeeRef[] = [],
    activity: readonly ProjectActivityView[] = [],
  ): TeamProjectView {
    const budget = r.budget_amount != null && r.currency ? storedMoney(String(r.budget_amount), String(r.currency)) : null;
    return {
      id: String(r.id),
      name: String(r.name),
      code: String(r.project_code),
      division: division(r),
      manager: employee(r, "manager_"),
      memberCount: Number(r.member_count),
      client: r.client_name ? String(r.client_name) : null,
      startDateLabel: r.start_date ? formatDate(date(r.start_date)) : "Not recorded",
      endDateLabel: r.end_date ? formatDate(date(r.end_date)) : null,
      priority: String(r.priority ?? "medium") as TeamProjectView["priority"],
      status: String(r.status) as TeamProjectView["status"],
      completionPercent: Number(r.completion_percent ?? 0),
      estimated: toDurationView(Number(r.estimated_minutes ?? 0)),
      actual: toDurationView(Number(r.actual_minutes ?? 0)),
      // Cost is a per-user grant: without it there is no amount in the view at all.
      budgetLabel: canSeeCost ? (budget ? formatMoney(budget) : null) : null,
      budgetRestricted: !canSeeCost,
      budgetAmount: canSeeCost && budget ? budget.amount : null,
      notes: r.notes ? String(r.notes) : null,
      startDate: r.start_date ? date(r.start_date) : null,
      endDate: r.end_date ? date(r.end_date) : null,
      members,
      canManage: manage,
      canAddTasks: manage && Boolean(r.is_active) && String(r.status) === "active" && Boolean(r.accepts_time_entries),
      activity,
    };
  }
  async listProjects(userId: string) {
    const a = await this.identity(userId);
    if (!a) return denied();
    const access = await this.projectAccess(a);
    const ids = [...access.keys()];
    const [rows, members] = await Promise.all([this.projectRows(ids), this.projectMembers(ids)]);
    const cost = hasPermission(a, "finance.cost.view");
    return success(rows.map((r) => this.mapProject(r, access.get(String(r.id))!.manage, cost, members.get(String(r.id)) ?? [])));
  }
  async getProject(userId: string, id: string) {
    const a = await this.identity(userId);
    if (!a) return absent("Project");
    const reach = (await this.projectAccess(a)).get(id);
    if (!reach) return absent("Project");
    const r = (await this.projectRows([id]))[0];
    if (!r) return absent("Project");
    const [members, activity] = await Promise.all([this.projectMembers([id]), this.projectActivity(id)]);
    return success(this.mapProject(r, reach.manage, hasPermission(a, "finance.cost.view"), members.get(id) ?? [], activity));
  }
  /** Active employees placed (today) in each division, for manager and member choices. */
  private async placedPeople() {
    const rows = await this.rows(
      `SELECT e.id,e.display_name,e.employee_code,GROUP_CONCAT(DISTINCT a.division_id) division_ids
       FROM employees e JOIN users u ON u.id=e.user_id
       JOIN employee_division_assignments a ON a.employee_id=e.id AND a.is_active=TRUE
         AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)
       WHERE e.status='active' AND u.status='active'
       GROUP BY e.id,e.display_name,e.employee_code ORDER BY e.display_name`,
      [today(), today()],
    );
    return rows.map((r) => ({
      value: String(r.id),
      label: `${String(r.display_name)} · ${String(r.employee_code)}`,
      divisionIds: String(r.division_ids ?? "").split(",").filter(Boolean),
    }));
  }
  private async creatableDivisions(a: ActorPolicyContext) {
    if (!canCreateProject(a)) return [];
    const government = hasPermission(a, "organization.government.view");
    const rows = await this.rows("SELECT id,name,is_government FROM divisions WHERE is_active=TRUE ORDER BY name");
    return rows
      .filter((r) => !r.is_government || government)
      .filter((r) => isWideRole(a) || a.divisionIds.has(String(r.id)))
      .map((r) => ({ value: String(r.id), label: String(r.name) }));
  }
  async getProjectFormOptions(userId: string): Promise<Result<ProjectFormOptionsView>> {
    const a = await this.identity(userId);
    if (!a) return denied();
    const [divisions, access, people] = await Promise.all([this.creatableDivisions(a), this.projectAccess(a), this.placedPeople()]);
    // Only people in divisions the viewer can create or manage work in: the
    // options are a working list, not a company directory.
    const reachable = new Set([...divisions.map((d) => d.value), ...[...access.values()].filter((p) => p.manage).map((p) => p.divisionId)]);
    return success({
      canCreate: canCreateProject(a) && divisions.length > 0,
      divisions,
      people: people.filter((person) => person.divisionIds.some((id) => reachable.has(id))),
      canEditBudget: hasPermission(a, "finance.cost.view") && !isReadOnly(a),
      currency: "BDT",
    });
  }
  async saveProject(
    userId: string,
    input: Parameters<TeamLeadService["saveProject"]>[1],
    id?: string,
  ) {
    const a = await this.identity(userId);
    if (!a) return denied();
    if (isReadOnly(a)) return denied("Management access is read-only.");
    const access = await this.projectAccess(a);
    let existing: Row | null = null;
    if (id) {
      const reach = access.get(id);
      if (!reach) return absent("Project");
      if (!reach.manage)
        return denied("Only the project manager, a Team Lead in its division, HR or a Super Administrator can change this project.");
      existing = (await this.rows("SELECT * FROM projects WHERE id=?", [id]))[0] ?? null;
      if (!existing) return absent("Project");
    } else if (!canCreateProject(a)) {
      return denied("Only a Team Lead, HR Manager or Super Administrator can create a project.");
    }

    // ---- validation -------------------------------------------------------
    const name = input.name.trim();
    if (!name || name.length > 200)
      return invalid("name", "Enter a project name of up to 200 characters.", "The project code is assigned automatically.");
    const divisionId = existing ? String(existing.division_id) : input.divisionId;
    if (existing && input.divisionId !== divisionId)
      return conflict("A project cannot move to another division.", "Create a new project in the other division.");
    if (!existing && !(await this.creatableDivisions(a)).some((d) => d.value === divisionId))
      return invalid("divisionId", "Choose a division you can create projects in.", "Only divisions in your scope are listed.");
    if (!ISO_DATE.test(input.startDate ?? ""))
      return invalid("startDate", "Enter a start date.", "Use the date picker.");
    if (input.endDate && (!ISO_DATE.test(input.endDate) || input.endDate < input.startDate))
      return invalid("endDate", "The end date cannot be before the start date.", "Choose an end date on or after the start date.");
    if (!PRIORITIES.includes(input.priority))
      return invalid("priority", "Choose a priority.", "Pick one of the listed priorities.");
    const status = existing ? (input.status ?? String(existing.status)) : "active";
    if (!PROJECT_STATUSES.includes(status as ProjectStatus))
      return invalid("status", "Choose a project status.", "Pick one of the listed statuses.");
    if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 0 || input.estimatedMinutes > 10_000_000)
      return invalid("estimatedMinutes", "Enter the estimate as whole minutes.", "Use 0 when there is no estimate yet.");
    if (!Number.isInteger(input.completionPercent) || input.completionPercent < 0 || input.completionPercent > 100)
      return invalid("completionPercent", "Progress must be a whole number from 0 to 100.", "Enter the percentage complete.");
    if (input.client.length > 200) return invalid("client", "Keep the client name under 200 characters.", "Shorten the name.");
    if (input.notes.length > 5000) return invalid("notes", "Keep notes under 5,000 characters.", "Move long material into a document.");
    const placed = (await this.placedPeople()).filter((person) => person.divisionIds.includes(divisionId));
    const placedIds = new Set(placed.map((person) => person.value));
    const keepsManager = existing && String(existing.manager_employee_id) === input.managerEmployeeId;
    if (!keepsManager && !placedIds.has(input.managerEmployeeId))
      return invalid("managerEmployeeId", "Choose an active employee placed in this division as manager.", "The list shows everyone currently placed there.");
    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length > 500) return invalid("memberIds", "A project can have at most 500 members.", "Remove some members.");
    // Existing members stay valid even if their placement has since ended.
    const currentMembers = existing
      ? (await this.rows(
          "SELECT employee_id FROM project_members WHERE project_id=? AND is_active=TRUE AND (effective_to IS NULL OR effective_to>=?)",
          [existing.id as string, today()],
        )).map((r) => String(r.employee_id))
      : [];
    if (memberIds.some((member) => !placedIds.has(member) && !currentMembers.includes(member)))
      return invalid("memberIds", "Every member must be an active employee placed in this division.", "Choose members from the list.");
    const canSeeCost = hasPermission(a, "finance.cost.view");
    let budget: string | null | undefined; // undefined = leave unchanged
    if (canSeeCost) {
      const raw = input.budgetAmount.trim().replaceAll(",", "");
      if (!raw) budget = null;
      else if (!/^\d{1,15}(\.\d{1,2})?$/.test(raw))
        return invalid("budgetAmount", "Enter the budget as an amount with up to two decimal places.", "For example 450000 or 450000.50.");
      else budget = money(raw, "BDT").amount;
    }

    // ---- write ------------------------------------------------------------
    const projectId = id ?? randomUUID();
    const on = today();
    const memberFrom = input.startDate > on ? input.startDate : on;
    const changedFields: string[] = [];
    if (existing) {
      const was = (key: string) => (existing![key] == null ? "" : existing![key] instanceof Date ? date(existing![key]) : String(existing![key]));
      const compare: [string, string, string][] = [
        ["name", was("name"), name], ["client", was("client_name"), input.client.trim()],
        ["startDate", was("start_date"), input.startDate], ["endDate", was("end_date"), input.endDate ?? ""],
        ["priority", was("priority"), input.priority], ["estimate", was("estimated_minutes"), String(input.estimatedMinutes)],
        ["progress", was("completion_percent"), String(input.completionPercent)], ["notes", was("notes"), input.notes.trim()],
        ["status", was("status"), status], ["manager", was("manager_employee_id"), input.managerEmployeeId],
      ];
      for (const [field, before, after] of compare) if (before !== after) changedFields.push(field);
      if (budget !== undefined && (existing.budget_amount == null ? null : storedMoney(String(existing.budget_amount), "BDT").amount) !== budget)
        changedFields.push("budget");
      const added = memberIds.filter((m) => !currentMembers.includes(m));
      const removed = currentMembers.filter((m) => !memberIds.includes(m));
      if (added.length || removed.length) changedFields.push("members");
    }
    let code: string | null = null;
    try {
      await this.transaction(async (connection) => {
        if (existing) {
          await connection.execute(
            `UPDATE projects SET name=?,manager_employee_id=?,client_name=?,start_date=?,end_date=?,priority=?,estimated_minutes=?,completion_percent=?,notes=?,status=?
              ${budget !== undefined ? ",budget_amount=?,currency=?" : ""},version=version+1 WHERE id=?`,
            [name, input.managerEmployeeId, input.client.trim() || null, input.startDate, input.endDate, input.priority,
              input.estimatedMinutes, input.completionPercent, input.notes.trim() || null, status,
              ...(budget !== undefined ? [budget, budget === null ? null : "BDT"] : []), projectId],
          );
        } else {
          code = await nextRecordCode(connection, "project");
          await connection.execute(
            "INSERT INTO projects(id,name,project_code,division_id,manager_employee_id,client_name,start_date,end_date,priority,estimated_minutes,completion_percent,notes,budget_amount,currency,status,is_active,accepts_time_entries) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',TRUE,TRUE)",
            [projectId, name, code, divisionId, input.managerEmployeeId, input.client.trim() || null, input.startDate, input.endDate,
              input.priority, input.estimatedMinutes, input.completionPercent, input.notes.trim() || null,
              budget ?? null, budget ? "BDT" : null],
          );
        }
        // Membership is effective-dated history, never rewritten: a removal
        // ends the row, an addition starts one. Time already logged by a
        // former member keeps its meaning.
        for (const member of currentMembers.filter((m) => !memberIds.includes(m)))
          await connection.execute(
            "UPDATE project_members SET is_active=FALSE,effective_to=GREATEST(effective_from,?),version=version+1 WHERE project_id=? AND employee_id=? AND is_active=TRUE",
            [on, projectId, member],
          );
        for (const member of memberIds.filter((m) => !currentMembers.includes(m)))
          await connection.execute(
            "INSERT INTO project_members(id,project_id,employee_id,effective_from) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE is_active=TRUE,effective_to=NULL,version=version+1",
            [randomUUID(), projectId, member, existing ? memberFrom : input.startDate],
          );
        await connection.execute(
          "INSERT INTO audit_events(event_id,actor_user_id,action,resource_type,resource_id,scope_json,correlation_id,before_protected,after_protected) VALUES(?,?,?,?,?,?,?,?,?)",
          [randomUUID(), a.userId, existing ? "project.updated" : "project.created", "project", projectId,
            JSON.stringify({ divisionId }), randomUUID(), JSON.stringify(null),
            JSON.stringify(existing ? { changedFields } : { name, code, memberCount: memberIds.length })],
        );
      });
    } catch (error) {
      if (isDuplicateKeyError(error))
        return conflict("Another project took that code at the same moment.", "Save again; a new project code is assigned automatically.");
      throw error;
    }
    return this.getProject(userId, projectId);
  }
  /**
   * Tasks in projects the viewer can see, plus — for a lead — tasks assigned
   * to the people they lead, so a Team Lead's board shows their team's work
   * wherever it sits. Government work still needs its permission.
   */
  private async taskRows(a: ActorPolicyContext, id?: string) {
    const projectIds = [...(await this.projectAccess(a)).keys()];
    const team = hasPermission(a, "time.team.read")
      ? [...a.employeeIds].filter((employeeId) => employeeId !== a.employeeId)
      : [];
    if (!projectIds.length && !team.length) return [];
    const scope = [
      projectIds.length ? `t.project_id IN (${projectIds.map(() => "?").join(",")})` : null,
      team.length ? `t.assignee_employee_id IN (${team.map(() => "?").join(",")})` : null,
    ].filter(Boolean).join(" OR ");
    const rows = await this.rows(
      `SELECT t.*,p.name project_name,p.project_code,p.division_id,d.name division_name,d.division_key division_code,d.is_government division_restricted,e.id assignee_id,e.employee_code assignee_employee_code,e.display_name assignee_display_name,e.job_title assignee_job_title,u.image_url assignee_image_url,(SELECT COALESCE(SUM(te.active_minutes),0) FROM time_entries te WHERE te.task_id=t.id AND te.is_active=TRUE AND te.status<>'draft') actual_minutes FROM tasks t JOIN projects p ON p.id=t.project_id JOIN divisions d ON d.id=p.division_id LEFT JOIN employees e ON e.id=t.assignee_employee_id LEFT JOIN users u ON u.id=e.user_id WHERE (${scope}) ${id ? "AND t.id=?" : ""} ORDER BY t.due_date,t.title`,
      [...projectIds, ...team, ...(id ? [id] : [])],
    );
    const government = hasPermission(a, "organization.government.view");
    return rows.filter((r) => !r.division_restricted || government);
  }
  private async mapTask(r: Row): Promise<TeamTaskView> {
    const id = String(r.id),
      actual = Number(r.actual_minutes),
      estimate = Number(r.estimated_minutes ?? 0),
      due = r.due_date ? date(r.due_date) : null;
    const [checklist, history, supporters] = await Promise.all([
      this.rows(
        "SELECT id,label,is_done FROM task_checklist_items WHERE task_id=? ORDER BY position",
        [id],
      ),
      this.rows(
        "SELECT id,work_date,active_minutes,completed_work FROM time_entries WHERE task_id=? AND is_active=TRUE AND status<>'draft' ORDER BY work_date DESC",
        [id],
      ),
      this.rows(
        `SELECT e.id,e.employee_code,e.display_name,e.job_title,u.image_url
         FROM task_members tm JOIN employees e ON e.id=tm.employee_id JOIN users u ON u.id=e.user_id
         WHERE tm.task_id=? ORDER BY e.display_name`,
        [id],
      ),
    ]);
    return {
      id,
      title: String(r.title),
      projectId: String(r.project_id),
      projectLabel: String(r.project_name),
      division: division(r),
      assignee: r.assignee_id ? employee(r, "assignee_") : null,
      supportingMembers: supporters.map((supporter) => employee(supporter)),
      status: String(r.status) as TaskStatus,
      priority: String(r.priority ?? "medium") as TeamTaskView["priority"],
      startDateLabel: r.start_date ? formatDate(date(r.start_date)) : null,
      startDate: r.start_date ? date(r.start_date) : null,
      dueDate: due,
      dueDateLabel: due ? formatDate(due) : null,
      estimated: toDurationView(estimate),
      actual: toDurationView(actual),
      variance: {
        minutes: actual - estimate,
        label: formatDurationDelta(actual - estimate),
      },
      isOverdue: Boolean(due && due < today() && r.status !== "completed"),
      review: {
        state: String(
          r.review_state ?? "not_required",
        ) as TeamTaskView["review"]["state"],
        label: "Review",
        detail: "Server-authoritative task review state.",
        blocksTimeEntry: ["pending_review", "rejected"].includes(
          String(r.review_state),
        ),
        reviewerName: null,
        reviewedAtLabel: null,
        note: r.review_note ? String(r.review_note) : null,
      },
      description: r.description ? String(r.description) : null,
      checklist: checklist.map((x) => ({
        id: String(x.id),
        label: String(x.label),
        isDone: Boolean(x.is_done),
      })),
      workHistory: history.map((x) => ({
        id: String(x.id),
        dateLabel: formatDate(date(x.work_date)),
        duration: toDurationView(Number(x.active_minutes)),
        completedWork: String(x.completed_work),
      })),
    };
  }
  async listTasks(userId: string) {
    const a = await this.identity(userId);
    if (!a) return denied();
    return success(
      await Promise.all((await this.taskRows(a)).map((r) => this.mapTask(r))),
    );
  }
  async getTask(userId: string, id: string) {
    const a = await this.identity(userId);
    if (!a) return absent("Task");
    const r = (await this.taskRows(a, id))[0];
    return r ? success(await this.mapTask(r)) : absent("Task");
  }
  async saveTask(
    userId: string,
    input: Parameters<TeamLeadService["saveTask"]>[1],
    id?: string,
  ) {
    const actor = await this.identity(userId);
    if (!actor?.employeeId) return denied();
    const reach = (await this.projectAccess(actor)).get(input.projectId);
    if (!reach) return absent("Project");
    if (!reach.manage)
      return denied("Only the project manager, a Team Lead in its division, HR or a Super Administrator can add or change its tasks.");
    const title = input.title.trim();
    if (!title || title.length > 240)
      return invalid("title", "Enter a task title of up to 240 characters.", "Name the outcome the task delivers.");
    if (input.startDate && !ISO_DATE.test(input.startDate))
      return invalid("startDate", "Enter a valid start date.", "Use the date picker or YYYY-MM-DD.");
    if (input.dueDate && !ISO_DATE.test(input.dueDate))
      return invalid("dueDate", "Enter a valid due date.", "Use the date picker or YYYY-MM-DD.");
    if (input.startDate && input.dueDate && input.dueDate < input.startDate)
      return invalid("dueDate", "The due date cannot be before the start date.", "Choose a due date on or after the start date.");
    if (!PRIORITIES.includes(input.priority))
      return invalid("priority", "Choose a valid priority.", "Pick one of the listed priorities.");
    if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 0 || input.estimatedMinutes > 10_000_000)
      return invalid("estimatedMinutes", "Enter the estimate as whole minutes.", "Use 0 when there is no estimate yet.");
    const description = input.description.trim();
    if (description.length > 5000)
      return invalid("description", "Keep the description under 5,000 characters.", "Move long supporting material into a document.");
    if (input.supportingMemberIds.length > 500)
      return invalid("supportingMemberIds", "A task can have at most 500 supporting members.", "Remove some supporting members.");
    if (input.checklist.length > 100)
      return invalid("checklist", "A task can have at most 100 checklist items.", "Keep only the actions needed to finish this task.");
    const checklist = input.checklist.map((label) => label.trim()).filter(Boolean);
    if (checklist.some((label) => label.length > 240))
      return invalid("checklist", "Keep each checklist item under 240 characters.", "Shorten the highlighted work steps.");
    if (new Set(checklist.map((label) => label.toLocaleLowerCase())).size !== checklist.length)
      return invalid("checklist", "Checklist items must be unique.", "Remove duplicate checklist items.");
    // Assignee and supporters must be able to log work in this division.
    const placed = new Set(
      (await this.placedPeople())
        .filter((person) => person.divisionIds.includes(reach.divisionId))
        .map((person) => person.value),
    );
    if (!placed.has(input.assigneeEmployeeId))
      return invalid(
        "assigneeEmployeeId",
        "Choose an active employee placed in this project's division.",
        "Only people who can record time in the division are listed.",
      );
    const selfAssigned = input.assigneeEmployeeId === actor.employeeId;
    const supportingMemberIds = selfAssigned ? [] : [...new Set(input.supportingMemberIds)];
    if (supportingMemberIds.includes(input.assigneeEmployeeId))
      return invalid("supportingMemberIds", "The assignee cannot also be a supporting member.", "Remove the assignee from supporting members.");
    if (supportingMemberIds.some((member) => !placed.has(member)))
      return invalid(
        "supportingMemberIds",
        "Every supporting member must be placed in this project's division.",
        "Choose supporting members from the list.",
      );
    const project = (
      await this.rows("SELECT division_id,is_active,status,accepts_time_entries FROM projects WHERE id=?", [
        input.projectId,
      ])
    )[0];
    if (!project) return absent("Project");
    const existing = id
      ? (await this.rows("SELECT project_id,assignee_employee_id,title,start_date,due_date,priority,estimated_minutes,description FROM tasks WHERE id=?", [id]))[0]
      : null;
    if (!existing && (!project.is_active || String(project.status) !== "active" || !project.accepts_time_entries))
      return invalid("projectId", "New tasks require an active project that accepts work.", "Choose another project or ask an administrator to activate this one.");
    if (existing && String(existing.project_id) !== input.projectId)
      return conflict(
        "A task cannot be moved between projects.",
        "Create a new task in the other project.",
      );
    const taskId = id ?? randomUUID();
    await this.transaction(async (connection) => {
      if (existing)
        await connection.execute(
          "UPDATE tasks SET title=?,assignee_employee_id=?,start_date=?,due_date=?,priority=?,estimated_minutes=?,description=?,version=version+1 WHERE id=?",
          [
            title,
            input.assigneeEmployeeId,
            input.startDate,
            input.dueDate,
            input.priority,
            input.estimatedMinutes,
            description || null,
            taskId,
          ],
        );
      else
        await connection.execute(
          "INSERT INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state,start_date,due_date,priority,estimated_minutes,description,is_active) VALUES(?,?,?,?,'pending',?,?,'team_lead','not_required',?,?,?,?,?,TRUE)",
          [
            taskId,
            input.projectId,
            String(project.division_id),
            title,
            input.assigneeEmployeeId,
            actor.employeeId,
            input.startDate,
            input.dueDate,
            input.priority,
            input.estimatedMinutes,
            description || null,
          ],
        );
      await connection.execute("DELETE FROM task_members WHERE task_id=?", [
        taskId,
      ]);
      for (const member of supportingMemberIds)
        await connection.execute(
          "INSERT INTO task_members(task_id,employee_id) VALUES(?,?)",
          [taskId, member],
        );
      await connection.execute(
        "DELETE FROM task_checklist_items WHERE task_id=?",
        [taskId],
      );
      for (const [position, label] of checklist.entries())
        await connection.execute(
          "INSERT INTO task_checklist_items(id,task_id,label,position) VALUES(?,?,?,?)",
          [randomUUID(), taskId, label, position],
        );
      await connection.execute(
        "INSERT INTO audit_events(event_id,actor_user_id,action,resource_type,resource_id,scope_json,correlation_id,before_protected,after_protected) VALUES(?,?,?,?,?,?,?,?,?)",
        [randomUUID(), actor.userId, existing ? "task.updated" : "task.created", "task", taskId,
          JSON.stringify({ divisionId: String(project.division_id), projectId: input.projectId }), randomUUID(),
          JSON.stringify(existing ?? null), JSON.stringify({ title, assigneeEmployeeId: input.assigneeEmployeeId, supportingMemberCount: supportingMemberIds.length })],
      );
      const previousAssignee = existing ? String(existing.assignee_employee_id) : null;
      if (input.assigneeEmployeeId !== actor.employeeId && input.assigneeEmployeeId !== previousAssignee) {
        await new NotificationService(connection).send({
          employeeIds: [input.assigneeEmployeeId],
          type: "task_assigned",
          resourceType: "task",
          resourceId: taskId,
          eventKey: `${existing ? "updated" : "created"}:${taskId}:${input.assigneeEmployeeId}`,
        });
      }
    });
    return this.getTask(userId, taskId);
  }
  async setTaskStatus(userId: string, id: string, status: TaskStatus) {
    const task = await this.getTask(userId, id);
    if (task.status !== "success") return task;
    if (task.data.status === status) return task;
    if (
      (task.data.status === "completed" && status === "in_progress") ||
      (task.data.status === "pending" && status === "completed")
    ) {
      return conflict(
        "This transition needs a note.",
        "Use the task board transition control and provide the required reason.",
      );
    }
    const row = (
      await this.rows("SELECT version FROM tasks WHERE id=?", [id])
    )[0];
    if (!row) return absent("Task");
    const changed = await this.time.tasks.transition({
      taskId: id,
      fromStatus: task.data.status,
      toStatus: status,
      actorRole: "team_lead",
      note: null,
      idempotencyKey: randomUUID(),
      expectedVersion: Number(row.version),
    });
    return changed.status === "success" ? this.getTask(userId, id) : changed;
  }
  async listRequests(
    userId: string,
  ): Promise<Result<readonly TeamRequestView[]>> {
    const a = await this.lead(userId);
    if (!a) return denied();
    const all = [];
    for (const kind of ["wfh", "leave"] as const) {
      const r = await this.hr.hr.listRequests(userId, kind);
      if (r.status === "success")
        all.push(
          ...r.data
            .filter((x) => a.employeeIds.has(x.employee.id))
            .map((x) => ({
              id: x.id,
              kind,
              employee: x.employee,
              division: x.division,
              dateLabel: x.dateLabel,
              portionLabel: x.portionLabel,
              reason: x.reason,
              details: x.plannedWork ?? x.leaveTypeLabel ?? "",
              state: x.state,
              decisionLabel: x.decisionLabel,
              overrideReason: x.overrideReason,
            })),
        );
    }
    return success(all);
  }
  async decideRequest(input: Parameters<TeamLeadService["decideRequest"]>[0]) {
    const a = await this.lead(input.userId);
    if (!a) return denied();
    const r = await this.hr.hr.decideRequest({
      userId: input.userId,
      kind: input.kind,
      id: input.id,
      outcome: input.outcome,
      comment: input.remark,
      overrideReason: null,
    });
    if (r.status !== "success") return r;
    return success({
      id: r.data.id,
      kind: r.data.kind,
      employee: r.data.employee,
      division: r.data.division,
      dateLabel: r.data.dateLabel,
      portionLabel: r.data.portionLabel,
      reason: r.data.reason,
      details: r.data.plannedWork ?? r.data.leaveTypeLabel ?? "",
      state: r.data.state,
      decisionLabel: r.data.decisionLabel,
      overrideReason: r.data.overrideReason,
    });
  }
  async listWorkload(
    userId: string,
  ): Promise<Result<readonly WorkloadMemberView[]>> {
    const members = await this.listMembers(userId);
    if (members.status !== "success") return members;
    return success(
      members.data.map((m) => ({
        employee: m.employee,
        capacity: toDurationView(2100),
        assigned: toDurationView(0),
        actual: m.active,
        remaining: toDurationView(Math.max(0, 2100 - m.active.minutes)),
        utilizationPercent: Math.round((m.active.minutes * 100) / 2100),
        warning: null,
        upcomingDeadlines: [],
        days: [],
      })),
    );
  }
  async listEvaluations(
    userId: string,
  ): Promise<Result<readonly TeamEvaluationView[]>> {
    const a = await this.lead(userId);
    if (!a) return denied();
    const rows = await this.rows(
      `SELECT ev.*,ep.label period_label,ep.end_date,e.id employee_id,e.employee_code,e.display_name,e.job_title,u.image_url FROM evaluations ev JOIN evaluation_periods ep ON ep.id=ev.period_id JOIN employees e ON e.id=ev.employee_id JOIN users u ON u.id=e.user_id WHERE ev.reviewer_employee_id=? ORDER BY ep.end_date DESC`,
      [a.employeeId ?? ""],
    );
    return success(
      rows.map((r) => ({
        id: String(r.id),
        employee: employee({ ...r, id: r.employee_id }),
        periodLabel: String(r.period_label),
        dueDateLabel: formatDate(date(r.end_date)),
        state: (String(r.status) === "draft"
          ? "reviewer_scoring"
          : String(r.status) === "review_submitted"
            ? "hr_review"
            : String(r.status)) as TeamEvaluationView["state"],
        weightedScore: r.final_score === null ? null : Number(r.final_score),
        facts: [],
        scores: {
          task_completion: 0,
          work_quality: 0,
          timeliness: 0,
          teamwork_communication: 0,
          responsibility: 0,
          learning_initiative: 0,
        },
        comments: {
          task_completion: "",
          work_quality: "",
          timeliness: "",
          teamwork_communication: "",
          responsibility: "",
          learning_initiative: "",
        },
        summary: "",
      })),
    );
  }
  async getEvaluation(userId: string, id: string) {
    const list = await this.listEvaluations(userId);
    if (list.status !== "success") return list;
    return list.data.find((x) => x.id === id)
      ? success(list.data.find((x) => x.id === id)!)
      : absent("Evaluation");
  }
  async saveEvaluation(
    input: Parameters<TeamLeadService["saveEvaluation"]>[0],
  ) {
    const actor = await this.lead(input.userId);
    if (!actor?.employeeId) return denied();
    const record = (
      await this.rows(
        "SELECT status FROM evaluations WHERE id=? AND reviewer_employee_id=?",
        [input.id, actor.employeeId],
      )
    )[0];
    if (!record) return absent("Evaluation");
    if (["review_submitted", "published"].includes(String(record.status)))
      return conflict(
        "This evaluation is read-only.",
        "Ask HR to return it before making changes.",
      );
    await this.transaction(async (connection) => {
      await connection.execute(
        "INSERT INTO evaluation_responses(id,evaluation_id,respondent_employee_id,response_type,answers,summary,submitted_at) VALUES(?,?,?,'reviewer',?,?,?) ON DUPLICATE KEY UPDATE answers=VALUES(answers),summary=VALUES(summary),submitted_at=VALUES(submitted_at),version=version+1",
        [
          randomUUID(),
          input.id,
          actor.employeeId,
          JSON.stringify({ scores: input.scores, comments: input.comments }),
          input.summary,
          input.submit ? new Date() : null,
        ],
      );
      if (input.submit)
        await connection.execute(
          "UPDATE evaluations SET status='review_submitted',version=version+1 WHERE id=?",
          [input.id],
        );
    });
    return this.getEvaluation(input.userId, input.id);
  }

  async getEmployeeDashboard(userId: string, on = today()) {
    const a = await this.identity(userId, on);
    if (!a?.employeeId) return absent("Dashboard");
    const day = await this.time.timesheets.getDay({
      employeeId: a.employeeId,
      date: on,
    });
    if (day.status !== "success") return day;
    const month = on.slice(0, 7),
      from = `${month}-01`,
      weekStart = new Date(`${on}T00:00:00Z`);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const weekFrom = weekStart.toISOString().slice(0, 10);
    const sums = await this.rows(
      "SELECT * FROM daily_summaries WHERE employee_id=? AND work_date BETWEEN ? AND ?",
      [a.employeeId, from, `${month}-31`],
    );
    const week = sums.filter(
      (r) => date(r.work_date) >= weekFrom && date(r.work_date) <= on,
    );
    const tasks = await this.rows(
      `SELECT t.id,t.title,t.status,t.priority,t.due_date,t.estimated_minutes,p.id project_id,p.name project_name,p.project_code,p.division_id,d.name division_name,d.division_key division_code,d.is_government division_restricted,COALESCE((SELECT SUM(te.active_minutes) FROM time_entries te WHERE te.task_id=t.id AND te.is_active=TRUE AND te.status<>'draft'),0) actual_minutes FROM tasks t JOIN projects p ON p.id=t.project_id JOIN divisions d ON d.id=p.division_id WHERE t.assignee_employee_id=? AND t.is_active=TRUE ORDER BY t.due_date`,
      [a.employeeId],
    );
    const summary = day.data.summary;
    return success({
      today: {
        date: on,
        dateLabel: formatDateWithWeekday(on),
        active: summary.active,
        break: summary.break,
        total: summary.total,
        requiredActive: summary.requiredActive,
        remainingActive: summary.remainingActive,
        scheduleProgressPercent:
          summary.requiredActive.minutes + day.data.breakEntry.duration.minutes
            ? Math.min(
                100,
                Math.round(
                  (summary.total.minutes * 100) /
                    (summary.requiredActive.minutes +
                      day.data.breakEntry.duration.minutes),
                ),
              )
            : 0,
        status: summary.status,
        attendance:
          day.data.exemption?.kind === "leave"
            ? "approved_leave"
            : day.data.entries.some((entry) => entry.workLocation === "wfh")
              ? "wfh"
              : "office",
        isLocked: Boolean(day.data.lockedReason),
        overtimeReason: summary.overtimeReason,
        criticalExplanation: summary.criticalExplanation,
      },
      todaysDivisions: day.data.divisionContributions,
      activeTasks: [],
      upcomingDeadlines: tasks
        .filter((r) => r.due_date && r.status !== "completed")
        .slice(0, 5)
        .map((r) => ({
          taskId: String(r.id),
          title: String(r.title),
          dueDate: date(r.due_date),
          dueDateLabel: formatDate(date(r.due_date)),
          daysRemaining: Math.round(
            (new Date(date(r.due_date)).getTime() - new Date(on).getTime()) /
              86400000,
          ),
          isOverdue: date(r.due_date) < on,
          href: `/tasks/${String(r.id)}`,
        })),
      weekly: periodTotals("This week", week),
      monthly: periodTotals(formatMonth(month), sums),
      missingDates: sums
        .filter((r) => r.classification === "missing")
        .map((r) => date(r.work_date)),
      recentRemarks: [],
      wfhStatus: null,
      leaveBalances: [],
      divisionContribution: day.data.divisionContributions,
      recentlyCompletedTasks: [],
      quickActions: [
        {
          key: "log_work",
          label: "Log work",
          href: `/timesheets/${on}`,
          enabled: true,
        },
        {
          key: "request_wfh",
          label: "Request WFH",
          href: "/wfh/new",
          enabled: true,
        },
        {
          key: "apply_leave",
          label: "Apply for leave",
          href: "/leave/new",
          enabled: true,
        },
      ],
    });
  }
  async getManagementDashboard(
    userId: string,
    periodId?: string,
  ): Promise<Result<ManagementDashboard>> {
    const a = await this.identity(userId);
    if (!a || !a.roles.includes("management")) return denied();
    const periods = await this.hr.requests.repository.time.periods();
    const p =
      periods.find((x) => x.id === periodId) ??
      periods.sort((x, y) => y.endDate.localeCompare(x.endDate))[0];
    if (!p) return absent("Period");
    const refs = periods.map((x) => ({
      id: x.id,
      label: x.label,
      rangeLabel: formatDateRange(x.startDate, x.endDate),
      startDate: x.startDate,
      endDate: x.endDate,
      isVerified: ["verified", "amended"].includes(x.status),
      timesheetPeriodId: x.id,
    }));
    const sums = await this.rows(
      "SELECT ds.*,e.display_name,e.employee_code,e.job_title,u.image_url FROM daily_summaries ds JOIN employees e ON e.id=ds.employee_id JOIN users u ON u.id=e.user_id WHERE ds.work_date BETWEEN ? AND ?",
      [p.startDate, p.endDate],
    );
    const active = sums.reduce((n, r) => n + Number(r.active_minutes), 0);
    const byEmployee = new Map<string, Row[]>();
    for (const r of sums)
      byEmployee.set(String(r.employee_id), [
        ...(byEmployee.get(String(r.employee_id)) ?? []),
        r,
      ]);
    const restricted = [
      {
        key: "labour-cost",
        label: "Labour cost",
        value: "Restricted",
        restricted: true,
      },
      { key: "salary", label: "Salary", value: "Restricted", restricted: true },
    ];
    return success({
      period: refs.find((x) => x.id === p.id)!,
      availablePeriods: refs,
      periodLabel: p.label,
      unverifiedWarning: ["verified", "amended"].includes(p.status)
        ? null
        : "This period is not verified.",
      companyMetrics: [
        {
          key: "active",
          label: "Active work",
          value: toDurationView(active).display,
        },
        {
          key: "employees",
          label: "Employees with time",
          value: String(byEmployee.size),
        },
      ],
      divisionSummaries: [],
      employeeSummaryCount: byEmployee.size,
      timeAllocation: [],
      projectProgress: [],
      employeeSummaries: [...byEmployee.entries()].map(([id, x]) => ({
        employee: employee({
          ...x[0],
          id,
          employee_code: x[0].employee_code,
          display_name: x[0].display_name,
        }),
        divisionCodes: [],
        active: toDurationView(
          x.reduce((n, r) => n + Number(r.active_minutes), 0),
        ),
        completeDayCount: x.filter((r) => r.classification === "complete")
          .length,
        exceptionCount: x.filter(
          (r) => !["complete"].includes(String(r.classification)),
        ).length,
      })),
      restrictedTiles: restricted,
      readOnlyNote: "This management view is read-only.",
    });
  }

  async listDivisions(userId: string): Promise<Result<readonly Division[]>> {
    if (!(await this.identity(userId))) return denied();
    const a = await this.actor();
    const rows = await this.rows(
      `SELECT * FROM divisions WHERE is_active=TRUE ORDER BY name`,
    );
    return success(
      rows
        .filter(
          (r) =>
            !Boolean(r.is_government) ||
            a?.permissions.has("organization.government.view"),
        )
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          code: String(r.division_key),
          description: r.description ? String(r.description) : null,
          teamLeadEmployeeId: r.team_lead_employee_id
            ? String(r.team_lead_employee_id)
            : null,
          isActive: true,
          isRestricted: Boolean(r.is_government),
          createdAt: "",
          updatedAt: "",
          createdBy: { userId: "", displayName: "" },
          updatedBy: { userId: "", displayName: "" },
        })),
    );
  }
  async getWorkEntryOptions(
    employeeId: string,
    workDate: string,
  ): Promise<Result<WorkEntryOptions>> {
    const actor = await this.actor(workDate);
    if (!actor) return denied();
    const mayRead =
      actor.employeeId === employeeId ||
      actor.roles.includes("hr_manager") ||
      actor.roles.includes("super_admin") ||
      actor.employeeIds.has(employeeId);
    if (!mayRead) return denied();

    const context = await this.time.application.repository.context(
      employeeId,
      workDate,
    );
    if (!context) return absent("Work options");

    const divisionIds = new Set(context.effectiveDivisionIds);
    const canReadGovernment = actor.permissions.has(
      "organization.government.view",
    );
    const divisions = context.divisions.filter(
      (item) =>
        divisionIds.has(item.id) &&
        item.isActive &&
        (!item.isRestricted || canReadGovernment),
    );
    const visibleDivisionIds = new Set(divisions.map((item) => item.id));
    const projects = context.projects.filter(
      (item) =>
        visibleDivisionIds.has(item.divisionId) &&
        item.isActive &&
        item.status === "active" &&
        item.acceptsTimeEntries,
    );
    const projectIds = new Set(projects.map((item) => item.id));
    const tasks = context.tasks.filter(
      (item) =>
        projectIds.has(item.projectId) &&
        item.status === "in_progress" &&
        ["not_required", "approved"].includes(item.reviewState),
    );
    return success({ divisions, projects, tasks });
  }
  async listProjectsForDivision(
    userId: string,
    divisionId: string,
  ): Promise<Result<readonly Project[]>> {
    const a = await this.identity(userId);
    if (!a) return denied();
    const rows = await this.rows(
      "SELECT * FROM projects WHERE division_id=? AND is_active=TRUE AND status='active' ORDER BY name",
      [divisionId],
    );
    const access = await this.projectAccess(a);
    return success(
      rows
        .filter((r) => access.has(String(r.id)))
        .map((r) => ({
          id: String(r.id),
          divisionId: String(r.division_id),
          name: String(r.name),
          code: String(r.project_code),
          description: r.description ? String(r.description) : null,
          client: r.client_name ? String(r.client_name) : null,
          managerEmployeeId: String(r.manager_employee_id ?? ""),
          memberEmployeeIds: [],
          startDate: r.start_date ? date(r.start_date) : date(r.created_at),
          endDate: r.end_date ? date(r.end_date) : null,
          priority: String(r.priority ?? "medium") as Project["priority"],
          status: "active",
          estimatedMinutes: Number(r.estimated_minutes ?? 0),
          budget: null,
          currency: null,
          completionPercent: Number(r.completion_percent ?? 0),
          acceptsTimeEntries: Boolean(r.accepts_time_entries),
          notes: r.notes ? String(r.notes) : null,
          isActive: true,
          createdAt: "",
          updatedAt: "",
          createdBy: { userId: "", displayName: "" },
          updatedBy: { userId: "", displayName: "" },
        })),
    );
  }
  async listTasksForProject(
    userId: string,
    projectId: string,
  ): Promise<Result<readonly Task[]>> {
    const a = await this.identity(userId);
    if (!a) return denied();
    if (!(await this.projectAccess(a)).has(projectId)) return success([]);
    const rows = await this.rows(
      "SELECT * FROM tasks WHERE project_id=? AND is_active=TRUE AND status='in_progress' AND review_state IN ('not_required','approved') ORDER BY title",
      [projectId],
    );
    return success(
      rows.map((r) => ({
        id: String(r.id),
        divisionId: String(r.division_id),
        projectId: String(r.project_id),
        title: String(r.title),
        description: r.description ? String(r.description) : null,
        status: String(r.status) as Task["status"],
        priority: String(r.priority ?? "medium") as Task["priority"],
        assigneeEmployeeId: r.assignee_employee_id
          ? String(r.assignee_employee_id)
          : null,
        supportingMemberIds: [],
        creatorEmployeeId: String(
          r.creator_employee_id ?? r.assignee_employee_id ?? "",
        ),
        estimatedMinutes: Number(r.estimated_minutes ?? 0),
        startDate: r.start_date ? date(r.start_date) : null,
        dueDate: r.due_date ? date(r.due_date) : null,
        completedDate: r.completed_at ? date(r.completed_at) : null,
        reviewState: String(
          r.review_state ?? "not_required",
        ) as Task["reviewState"],
        reviewerEmployeeId: r.reviewer_employee_id
          ? String(r.reviewer_employee_id)
          : null,
        reviewedAt: r.reviewed_at
          ? new Date(r.reviewed_at as Date).toISOString()
          : null,
        reviewNote: r.review_note ? String(r.review_note) : null,
        createdAt: "",
        updatedAt: "",
        createdBy: { userId: "", displayName: "" },
        updatedBy: { userId: "", displayName: "" },
      })),
    );
  }
}
