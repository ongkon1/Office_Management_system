import { createHash, randomUUID } from 'node:crypto';

export const IMPORT_MAPPING_VERSION = 'be-0911-v1';
export const IMPORT_SCHEMA_VERSION = '0015';

const DATASET_TYPES = new Set([
  'employees', 'divisions', 'assignments', 'holidays', 'leave_balances',
  'projects', 'tasks', 'cost_rates', 'opening_periods',
]);
const SENSITIVITIES = new Set(['internal', 'protected', 'restricted', 'financial', 'government']);
const TABLES = new Set([
  'users', 'employees', 'user_roles', 'divisions', 'departments',
  'employee_division_assignments', 'department_lead_assignments',
  'holiday_calendars', 'holidays', 'leave_types', 'leave_balances',
  'projects', 'project_members', 'tasks', 'task_members', 'cost_rates',
  'timesheet_periods', 'payroll_periods',
]);

const DATASET_SCHEMAS = {
  employees: {
    required: ['employee_code', 'display_name', 'work_email', 'hire_date', 'employment_type', 'status', 'role_key', 'role_effective_from'],
    optional: ['preferred_name', 'job_title', 'office_location', 'normal_work_mode', 'standard_daily_active_minutes', 'standard_weekly_active_minutes', 'role_effective_to'],
  },
  divisions: {
    required: ['division_key', 'name', 'is_government', 'is_active'],
    optional: ['description'],
  },
  assignments: {
    required: ['employee_code', 'division_key', 'department_code', 'department_name', 'effective_from', 'allocation_percent', 'expected_weekly_minutes', 'is_primary', 'is_temporary', 'is_active'],
    optional: ['department_description', 'department_is_active', 'effective_to', 'role_in_division', 'lead_employee_code', 'lead_effective_from', 'lead_effective_to', 'lead_reason'],
  },
  holidays: {
    required: ['calendar_key', 'calendar_name', 'calendar_effective_from', 'holiday_date', 'holiday_name', 'portion', 'is_active'],
    optional: ['division_key', 'calendar_effective_to', 'calendar_is_active'],
  },
  leave_balances: {
    required: ['employee_code', 'leave_type_key', 'leave_type_name', 'is_paid', 'requires_attachment', 'leave_type_is_active', 'year', 'entitled_minutes', 'used_minutes', 'reserved_minutes', 'unit_minutes', 'balance_cutoff_date'],
    optional: [],
  },
  projects: {
    required: ['project_code', 'division_key', 'name', 'status', 'priority', 'estimated_minutes', 'completion_percent', 'accepts_time_entries', 'is_active'],
    optional: ['manager_employee_code', 'start_date', 'end_date', 'description', 'budget_amount', 'currency', 'client_name', 'member_employee_codes'],
  },
  tasks: {
    required: ['source_task_key', 'project_code', 'title', 'creator_employee_code', 'creator_role', 'status', 'review_state', 'priority', 'estimated_minutes', 'is_active'],
    optional: ['parent_source_task_key', 'description', 'assignee_employee_code', 'supporting_member_codes', 'reviewer_employee_code', 'reviewed_at', 'review_note', 'start_date', 'due_date', 'completed_at'],
  },
  cost_rates: {
    required: ['source_rate_key', 'rate_amount', 'currency', 'rate_unit', 'effective_from', 'is_active'],
    optional: ['employee_code', 'division_key', 'project_code', 'effective_to'],
  },
  opening_periods: {
    required: ['timesheet_period_label', 'payroll_period_label', 'start_date', 'end_date', 'timesheet_status', 'payroll_status', 'policy_key', 'policy_version'],
    optional: [],
  },
};

const REQUIRED_APPROVALS = {
  employees: ['owner', 'hr', 'technical'],
  divisions: ['owner', 'technical'],
  assignments: ['owner', 'hr', 'technical'],
  holidays: ['owner', 'hr', 'technical'],
  leave_balances: ['owner', 'hr', 'technical'],
  projects: ['owner', 'division', 'technical'],
  tasks: ['owner', 'division', 'technical'],
  cost_rates: ['owner', 'financial', 'technical'],
  opening_periods: ['owner', 'hr', 'technical'],
};

const SNAPSHOT_SQL = {
  employees: [
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM users',
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM employees',
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(created_at) latest FROM user_roles',
  ],
  divisions: ['SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM divisions'],
  assignments: [
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM departments',
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM employee_division_assignments',
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM department_lead_assignments',
  ],
  holidays: [
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(created_at) latest FROM holiday_calendars',
    'SELECT COUNT(*) count,MAX(created_at) latest FROM holidays',
  ],
  leave_balances: [
    'SELECT COUNT(*) count FROM leave_types',
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions FROM leave_balances',
  ],
  projects: [
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM projects',
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(created_at) latest FROM project_members',
  ],
  tasks: [
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM tasks',
    'SELECT COUNT(*) count FROM task_members',
  ],
  cost_rates: ['SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(created_at) latest FROM cost_rates'],
  opening_periods: [
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(updated_at) latest FROM timesheet_periods',
    'SELECT COUNT(*) count,COALESCE(SUM(version),0) versions,MAX(created_at) latest FROM payroll_periods',
  ],
};

class RowProblem extends Error {
  constructor(code, field, message, guidance) {
    super(message);
    this.code = code;
    this.field = field;
    this.guidance = guidance;
  }
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function parseCsv(input) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  if (text.charCodeAt(0) === 0xfeff) throw new Error('UNSAFE_CONTENT: UTF-8 BOM is not allowed.');
  if (text.includes('\0')) throw new Error('UNSAFE_CONTENT: NUL bytes are not allowed.');
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n') { record.push(field.replace(/\r$/, '')); records.push(record); record = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('INVALID_FORMAT: CSV contains an unterminated quoted field.');
  if (field.length > 0 || record.length > 0) { record.push(field.replace(/\r$/, '')); records.push(record); }
  while (records.length > 0 && records.at(-1).every((value) => value === '')) records.pop();
  if (records.length === 0) throw new Error('INVALID_FORMAT: CSV has no header.');
  const headers = records[0].map((value) => value.trim());
  if (headers.some((value) => !value)) throw new Error('HEADER_UNSUPPORTED: Empty header names are not allowed.');
  if (new Set(headers).size !== headers.length) throw new Error('HEADER_UNSUPPORTED: Duplicate header names are not allowed.');
  const rows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`INVALID_FORMAT: Source row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
    if (values.some((value) => /^[=+\-@]/.test(value.trim()))) throw new Error(`UNSAFE_CONTENT: Source row ${index + 2} contains a formula-like value.`);
    return { rowNumber: index + 2, values: Object.fromEntries(headers.map((header, offset) => [header, values[offset].trim()])) };
  });
  return { headers, rows };
}

function required(row, field, max = 500) {
  const value = row[field]?.trim();
  if (!value) throw new RowProblem('REQUIRED', field, `${field} is required.`, `Provide ${field} in the canonical source file.`);
  if (value.length > max) throw new RowProblem('OUT_OF_RANGE', field, `${field} is too long.`, `Limit ${field} to ${max} characters.`);
  return value;
}

function optional(row, field, max = 500) {
  const value = row[field]?.trim();
  if (!value) return null;
  if (value.length > max) throw new RowProblem('OUT_OF_RANGE', field, `${field} is too long.`, `Limit ${field} to ${max} characters.`);
  return value;
}

function booleanValue(row, field, defaultValue) {
  const raw = row[field]?.trim().toLowerCase();
  if (!raw && defaultValue !== undefined) return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new RowProblem('INVALID_FORMAT', field, `${field} must be true or false.`, `Use exactly true or false for ${field}.`);
}

function integerValue(row, field, { min = 0, max = 4_294_967_295, defaultValue } = {}) {
  const raw = row[field]?.trim();
  if (!raw && defaultValue !== undefined) return defaultValue;
  if (!/^\d+$/.test(raw ?? '')) throw new RowProblem('INVALID_FORMAT', field, `${field} must be an integer.`, `Provide ${field} as whole minutes or a whole-number value.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RowProblem('OUT_OF_RANGE', field, `${field} is outside the allowed range.`, `Provide ${field} between ${min} and ${max}.`);
  return value;
}

function dateValue(row, field, nullable = false) {
  const raw = row[field]?.trim();
  if (!raw && nullable) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw ?? '')) throw new RowProblem('INVALID_FORMAT', field, `${field} must use YYYY-MM-DD.`, `Provide an ISO local date for ${field}.`);
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new RowProblem('INVALID_FORMAT', field, `${field} is not a real calendar date.`, `Correct the date in ${field}.`);
  return raw;
}

function instantValue(row, field, nullable = false) {
  const raw = row[field]?.trim();
  if (!raw && nullable) return null;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw ?? '') || Number.isNaN(Date.parse(raw))) throw new RowProblem('INVALID_FORMAT', field, `${field} must be an ISO-8601 instant with an offset.`, `Provide ${field} with Z or an explicit UTC offset.`);
  return new Date(raw);
}

function enumValue(row, field, allowed, nullable = false) {
  const raw = row[field]?.trim().toLowerCase();
  if (!raw && nullable) return null;
  if (!allowed.includes(raw)) throw new RowProblem('INVALID_ENUM', field, `${field} has an unsupported value.`, `Use one of: ${allowed.join(', ')}.`);
  return raw;
}

function decimalValue(row, field, nullable = false) {
  const raw = row[field]?.trim();
  if (!raw && nullable) return null;
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(raw ?? '')) throw new RowProblem('INVALID_FORMAT', field, `${field} must be a non-negative fixed-precision decimal.`, `Provide ${field} as a decimal string with at most four fractional digits.`);
  return raw;
}

function percentageBasisPoints(row, field) {
  const raw = row[field]?.trim();
  if (!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(raw ?? '')) throw new RowProblem('OUT_OF_RANGE', field, `${field} must be between 0 and 100 with at most two decimals.`, `Correct ${field}; values are percentages, not fractions.`);
  const [whole, fraction = ''] = raw.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function listValue(row, field) {
  const raw = row[field]?.trim();
  if (!raw) return [];
  const values = raw.split(';').map((value) => value.trim()).filter(Boolean);
  if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) throw new RowProblem('DUPLICATE_CONFLICT', field, `${field} contains a repeated identifier.`, `Remove duplicate values from ${field}.`);
  return values;
}

function assertRange(from, to, field = 'effective_to') {
  if (to && to < from) throw new RowProblem('OUT_OF_RANGE', field, `${field} is before the effective start.`, `Make ${field} equal to or later than the start date.`);
}

function normalize(dataset, row) {
  switch (dataset) {
    case 'employees': {
      const roleFrom = dateValue(row, 'role_effective_from');
      const roleTo = dateValue(row, 'role_effective_to', true); assertRange(roleFrom, roleTo, 'role_effective_to');
      const daily = integerValue(row, 'standard_daily_active_minutes', { min: 1, max: 1440, defaultValue: 420 });
      const weekly = integerValue(row, 'standard_weekly_active_minutes', { min: daily, max: 10080, defaultValue: 2100 });
      return { employeeCode: required(row, 'employee_code', 64), displayName: required(row, 'display_name', 160), preferredName: optional(row, 'preferred_name', 160), workEmail: required(row, 'work_email', 254).toLowerCase(), jobTitle: optional(row, 'job_title', 160), hireDate: dateValue(row, 'hire_date'), employmentType: enumValue(row, 'employment_type', ['full_time', 'part_time', 'contract', 'intern', 'consultant']), status: enumValue(row, 'status', ['active', 'inactive']), roleKey: enumValue(row, 'role_key', ['super_admin', 'team_lead', 'employee', 'hr_manager', 'management']), roleFrom, roleTo, officeLocation: optional(row, 'office_location', 160), normalWorkMode: enumValue(row, 'normal_work_mode', ['office', 'wfh', 'hybrid'], true) ?? 'office', daily, weekly };
    }
    case 'divisions': return { divisionKey: required(row, 'division_key', 64).toLowerCase(), name: required(row, 'name', 160), description: optional(row, 'description', 4000), isGovernment: booleanValue(row, 'is_government'), isActive: booleanValue(row, 'is_active') };
    case 'assignments': {
      const from = dateValue(row, 'effective_from'); const to = dateValue(row, 'effective_to', true); assertRange(from, to);
      const temporary = booleanValue(row, 'is_temporary'); if (temporary && !to) throw new RowProblem('REQUIRED', 'effective_to', 'Temporary assignments require an end date.', 'Provide effective_to for the temporary assignment.');
      const leadFrom = dateValue(row, 'lead_effective_from', true); const leadTo = dateValue(row, 'lead_effective_to', true); if (leadFrom) assertRange(leadFrom, leadTo, 'lead_effective_to');
      if (optional(row, 'lead_employee_code', 64) && !leadFrom) throw new RowProblem('REQUIRED', 'lead_effective_from', 'A department lead requires an effective start date.', 'Provide lead_effective_from.');
      return { employeeCode: required(row, 'employee_code', 64), divisionKey: required(row, 'division_key', 64).toLowerCase(), departmentCode: required(row, 'department_code', 32), departmentName: required(row, 'department_name', 160), departmentDescription: optional(row, 'department_description', 4000), departmentIsActive: booleanValue(row, 'department_is_active', true), from, to, allocationBasisPoints: percentageBasisPoints(row, 'allocation_percent'), expectedWeeklyMinutes: integerValue(row, 'expected_weekly_minutes', { max: 10080 }), isPrimary: booleanValue(row, 'is_primary'), roleInDivision: optional(row, 'role_in_division', 160), temporary, isActive: booleanValue(row, 'is_active'), leadEmployeeCode: optional(row, 'lead_employee_code', 64), leadFrom, leadTo, leadReason: optional(row, 'lead_reason', 200) };
    }
    case 'holidays': {
      const calendarFrom = dateValue(row, 'calendar_effective_from'); const calendarTo = dateValue(row, 'calendar_effective_to', true); assertRange(calendarFrom, calendarTo, 'calendar_effective_to');
      const holidayDate = dateValue(row, 'holiday_date'); if (holidayDate < calendarFrom || (calendarTo && holidayDate > calendarTo)) throw new RowProblem('OUT_OF_RANGE', 'holiday_date', 'Holiday date is outside the calendar effective range.', 'Correct the holiday or calendar effective dates.');
      return { calendarKey: required(row, 'calendar_key', 64).toLowerCase(), calendarName: required(row, 'calendar_name', 160), divisionKey: optional(row, 'division_key', 64)?.toLowerCase() ?? null, calendarFrom, calendarTo, calendarIsActive: booleanValue(row, 'calendar_is_active', true), holidayDate, holidayName: required(row, 'holiday_name', 160), portion: enumValue(row, 'portion', ['full_day', 'first_half', 'second_half']), isActive: booleanValue(row, 'is_active') };
    }
    case 'leave_balances': {
      const entitled = integerValue(row, 'entitled_minutes'); const used = integerValue(row, 'used_minutes'); const reserved = integerValue(row, 'reserved_minutes');
      if (used + reserved > entitled) throw new RowProblem('OUT_OF_RANGE', 'used_minutes', 'Used plus reserved leave exceeds entitlement.', 'Correct the opening leave totals.');
      return { employeeCode: required(row, 'employee_code', 64), leaveTypeKey: required(row, 'leave_type_key', 64).toLowerCase(), leaveTypeName: required(row, 'leave_type_name', 120), isPaid: booleanValue(row, 'is_paid'), requiresAttachment: booleanValue(row, 'requires_attachment'), leaveTypeIsActive: booleanValue(row, 'leave_type_is_active'), year: integerValue(row, 'year', { min: 2000, max: 2200 }), entitled, used, reserved, unitMinutes: integerValue(row, 'unit_minutes', { min: 1, max: 1440 }), cutoff: dateValue(row, 'balance_cutoff_date') };
    }
    case 'projects': {
      const start = dateValue(row, 'start_date', true); const end = dateValue(row, 'end_date', true); if (start) assertRange(start, end, 'end_date');
      const budget = decimalValue(row, 'budget_amount', true); const currency = optional(row, 'currency', 3)?.toUpperCase() ?? null; if ((budget === null) !== (currency === null)) throw new RowProblem('REQUIRED', budget === null ? 'budget_amount' : 'currency', 'Budget amount and currency must be supplied together.', 'Provide both budget_amount and currency, or leave both blank.');
      return { projectCode: required(row, 'project_code', 64), divisionKey: required(row, 'division_key', 64).toLowerCase(), name: required(row, 'name', 200), status: enumValue(row, 'status', ['planned', 'active', 'on_hold', 'completed', 'closed']), managerEmployeeCode: optional(row, 'manager_employee_code', 64), start, end, priority: required(row, 'priority', 32).toLowerCase(), estimatedMinutes: integerValue(row, 'estimated_minutes'), description: optional(row, 'description', 10000), completionPercent: integerValue(row, 'completion_percent', { min: 0, max: 100 }), acceptsTimeEntries: booleanValue(row, 'accepts_time_entries'), isActive: booleanValue(row, 'is_active'), budget, currency, clientName: optional(row, 'client_name', 200), memberCodes: listValue(row, 'member_employee_codes') };
    }
    case 'tasks': {
      const creatorRole = enumValue(row, 'creator_role', ['team_lead', 'employee']); const status = enumValue(row, 'status', ['pending', 'in_progress', 'completed']); const reviewState = enumValue(row, 'review_state', ['not_required', 'pending_review', 'approved', 'rejected']);
      const reviewedAt = instantValue(row, 'reviewed_at', true); const reviewer = optional(row, 'reviewer_employee_code', 64); const completedAt = instantValue(row, 'completed_at', true);
      if (creatorRole === 'employee' && reviewState === 'not_required') throw new RowProblem('INVALID_ENUM', 'review_state', 'Employee-created tasks require review.', 'Use pending_review, approved, or rejected.');
      if (['approved', 'rejected'].includes(reviewState) && (!reviewer || !reviewedAt)) throw new RowProblem('REQUIRED', 'reviewer_employee_code', 'A decided review needs reviewer and reviewed_at.', 'Provide both review fields.');
      if (!['approved', 'rejected'].includes(reviewState) && (reviewer || reviewedAt)) throw new RowProblem('INVALID_FORMAT', 'reviewer_employee_code', 'Undecided review state cannot contain decision facts.', 'Remove reviewer/reviewed_at or use a decided state.');
      if (reviewState === 'rejected' && !optional(row, 'review_note', 10000)) throw new RowProblem('REQUIRED', 'review_note', 'Rejected tasks require a review note.', 'Provide review_note.');
      if (status === 'completed' && !completedAt) throw new RowProblem('REQUIRED', 'completed_at', 'Completed tasks require completed_at.', 'Provide the completion instant.');
      if (status !== 'completed' && completedAt) throw new RowProblem('INVALID_FORMAT', 'completed_at', 'Only Completed tasks may have completed_at.', 'Remove completed_at or set status to completed.');
      return { sourceTaskKey: required(row, 'source_task_key', 191), projectCode: required(row, 'project_code', 64), parentSourceTaskKey: optional(row, 'parent_source_task_key', 191), title: required(row, 'title', 240), description: optional(row, 'description', 10000), creatorEmployeeCode: required(row, 'creator_employee_code', 64), creatorRole, assigneeEmployeeCode: optional(row, 'assignee_employee_code', 64), memberCodes: listValue(row, 'supporting_member_codes'), status, reviewState, reviewerEmployeeCode: reviewer, reviewedAt, reviewNote: optional(row, 'review_note', 10000), priority: enumValue(row, 'priority', ['low', 'medium', 'high', 'urgent']), estimatedMinutes: integerValue(row, 'estimated_minutes'), startDate: dateValue(row, 'start_date', true), dueDate: dateValue(row, 'due_date', true), completedAt, isActive: booleanValue(row, 'is_active') };
    }
    case 'cost_rates': {
      const employeeCode = optional(row, 'employee_code', 64); const divisionKey = optional(row, 'division_key', 64)?.toLowerCase() ?? null; const projectCode = optional(row, 'project_code', 64);
      if (!employeeCode && !divisionKey && !projectCode) throw new RowProblem('REQUIRED', 'employee_code', 'A cost rate requires at least one scope.', 'Provide employee_code, division_key, or project_code.');
      const from = dateValue(row, 'effective_from'); const to = dateValue(row, 'effective_to', true); assertRange(from, to);
      return { sourceRateKey: required(row, 'source_rate_key', 191), employeeCode, divisionKey, projectCode, rateAmount: decimalValue(row, 'rate_amount'), currency: required(row, 'currency', 3).toUpperCase(), rateUnit: enumValue(row, 'rate_unit', ['hour', 'day', 'month']), from, to, isActive: booleanValue(row, 'is_active') };
    }
    case 'opening_periods': {
      const start = dateValue(row, 'start_date'); const end = dateValue(row, 'end_date'); assertRange(start, end, 'end_date');
      return { timesheetLabel: required(row, 'timesheet_period_label', 120), payrollLabel: required(row, 'payroll_period_label', 120), start, end, timesheetStatus: enumValue(row, 'timesheet_status', ['open']), payrollStatus: enumValue(row, 'payroll_status', ['open']), policyKey: required(row, 'policy_key', 64), policyVersion: integerValue(row, 'policy_version', { min: 1, max: 1_000_000 }) };
    }
    default: throw new Error(`Unsupported dataset ${dataset}`);
  }
}

function sourceKey(dataset, payload) {
  switch (dataset) {
    case 'employees': return payload.employeeCode.toLowerCase();
    case 'divisions': return payload.divisionKey;
    case 'assignments': return `${payload.employeeCode.toLowerCase()}|${payload.divisionKey}|${payload.from}`;
    case 'holidays': return `${payload.calendarKey}|${payload.holidayDate}`;
    case 'leave_balances': return `${payload.employeeCode.toLowerCase()}|${payload.leaveTypeKey}|${payload.year}`;
    case 'projects': return payload.projectCode.toLowerCase();
    case 'tasks': return payload.sourceTaskKey;
    case 'cost_rates': return payload.sourceRateKey;
    case 'opening_periods': return `${payload.start}|${payload.end}`;
    default: throw new Error(`Unsupported dataset ${dataset}`);
  }
}

async function rows(connection, sql, params = []) { const [result] = await connection.execute(sql, params); return result; }
async function one(connection, sql, params = []) { return (await rows(connection, sql, params))[0] ?? null; }

async function actorContext(connection, actorUserId) {
  const user = await one(connection, 'SELECT id,status FROM users WHERE id=?', [actorUserId]);
  if (!user || user.status !== 'active') throw new Error('PROTECTED_SCOPE_DENIED: Import actor is missing or inactive.');
  const roleRows = await rows(connection, `SELECT r.role_key FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.is_active=TRUE AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)`, [actorUserId]);
  const permissionRows = await rows(connection, `SELECT DISTINCT p.permission_key FROM permissions p LEFT JOIN role_permissions rp ON rp.permission_id=p.id LEFT JOIN user_roles ur ON ur.role_id=rp.role_id AND ur.user_id=? AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE) LEFT JOIN scoped_grants sg ON sg.permission_id=p.id AND sg.user_id=? AND sg.effective_from<=CURRENT_DATE AND (sg.effective_to IS NULL OR sg.effective_to>=CURRENT_DATE) WHERE ur.id IS NOT NULL OR sg.id IS NOT NULL`, [actorUserId, actorUserId]);
  return { id: actorUserId, roles: roleRows.map((row) => row.role_key), permissions: permissionRows.map((row) => row.permission_key) };
}

function authorizeApproval(actor, scope) {
  const roles = new Set(actor.roles);
  if (scope === 'owner') return;
  if (scope === 'technical' && !roles.has('super_admin')) throw new Error('PROTECTED_SCOPE_DENIED: Technical approval requires Super Administrator.');
  if (scope === 'hr' && !roles.has('super_admin') && !roles.has('hr_manager')) throw new Error('PROTECTED_SCOPE_DENIED: HR approval requires HR Manager or Super Administrator.');
  if (scope === 'financial' && !roles.has('super_admin') && !actor.permissions.includes('finance.cost.view')) throw new Error('PROTECTED_SCOPE_DENIED: Financial approval requires finance.cost.view.');
  if (scope === 'division' && !roles.has('super_admin') && !roles.has('team_lead') && !roles.has('management')) throw new Error('PROTECTED_SCOPE_DENIED: Division approval requires an authorized division owner.');
}

function validateHeaders(dataset, headers) {
  const schema = DATASET_SCHEMAS[dataset];
  const allowed = new Set([...schema.required, ...schema.optional]);
  const missing = schema.required.filter((field) => !headers.includes(field));
  const unknown = headers.filter((field) => !allowed.has(field));
  if (missing.length) throw new Error(`HEADER_UNSUPPORTED: Missing required headers: ${missing.join(', ')}.`);
  if (unknown.length) throw new Error(`HEADER_UNSUPPORTED: Unknown headers: ${unknown.join(', ')}.`);
}

export function validateManifest(manifest, sourceBuffer) {
  const requiredFields = ['releaseId', 'dataset', 'sourceSystem', 'sourceFileName', 'sourceCutoffDate', 'declaredRowCount', 'sha256', 'sensitivity', 'actorUserId', 'owner', 'ownerUserId', 'steward'];
  for (const field of requiredFields) if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') throw new Error(`MANIFEST_INVALID: ${field} is required.`);
  if (!DATASET_TYPES.has(manifest.dataset)) throw new Error('MANIFEST_INVALID: Unsupported dataset type.');
  if ((manifest.mappingVersion ?? IMPORT_MAPPING_VERSION) !== IMPORT_MAPPING_VERSION) throw new Error(`MANIFEST_INVALID: mappingVersion must be ${IMPORT_MAPPING_VERSION}.`);
  if (!SENSITIVITIES.has(manifest.sensitivity)) throw new Error('MANIFEST_INVALID: Unsupported sensitivity.');
  if (/[\\/]/.test(manifest.sourceFileName) || manifest.sourceFileName.length > 255) throw new Error('MANIFEST_INVALID: sourceFileName must be a file name without a path.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.sourceCutoffDate)) throw new Error('MANIFEST_INVALID: sourceCutoffDate must use YYYY-MM-DD.');
  if (!Number.isInteger(manifest.declaredRowCount) || manifest.declaredRowCount < 0) throw new Error('MANIFEST_INVALID: declaredRowCount must be a non-negative integer.');
  if (manifest.dataset === 'cost_rates' && !manifest.costPrecedence?.trim()) throw new Error('MANIFEST_INVALID: costPrecedence is required for cost rates.');
  const actual = sha256(sourceBuffer);
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.sha256 !== actual) throw new Error('CHECKSUM_MISMATCH: Source SHA-256 does not match the manifest.');
  return { ...manifest, mappingVersion: IMPORT_MAPPING_VERSION };
}

async function targetSnapshot(connection, dataset) {
  const parts = [];
  for (const sql of SNAPSHOT_SQL[dataset]) parts.push(await rows(connection, sql));
  return sha256(stableJson(parts));
}

function rejection(rowNumber, rawKey, fingerprint, problem) {
  return { rowNumber, sourceKey: rawKey, sourceKeyHash: sha256(rawKey), fingerprint, outcome: 'rejected', errorCode: problem.code ?? 'INVALID_FORMAT', errorField: problem.field ?? null, safeMessage: problem.message, guidance: problem.guidance ?? 'Correct the source row and submit a new batch.', payload: null, target: null };
}

function countBy(items, value) {
  return items.reduce((result, item) => { const key = value(item) ?? 'not_recorded'; result[key] = (result[key] ?? 0) + 1; return result; }, {});
}

function addDecimal4(current, value) {
  const [whole, fraction = ''] = value.split('.');
  return current + BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

function formatDecimal4(value) {
  const whole = value / 10_000n; const fraction = String(value % 10_000n).padStart(4, '0');
  return `${whole}.${fraction}`;
}

function reconciliation(dataset, analyzed) {
  const payloads = analyzed.filter((row) => row.outcome !== 'rejected' && row.payload).map((row) => row.payload);
  const base = { acceptedOrUnchangedRows: payloads.length };
  if (dataset === 'employees') return { ...base, byStatus: countBy(payloads, (row) => row.status), byRole: countBy(payloads, (row) => row.roleKey) };
  if (dataset === 'divisions') return { ...base, active: payloads.filter((row) => row.isActive).length, government: payloads.filter((row) => row.isGovernment).length };
  if (dataset === 'assignments') return { ...base, byDivision: countBy(payloads, (row) => row.divisionKey), byDepartment: countBy(payloads, (row) => `${row.divisionKey}/${row.departmentCode.toLowerCase()}`), primary: payloads.filter((row) => row.isPrimary).length, allocationBasisPoints: payloads.reduce((sum, row) => sum + row.allocationBasisPoints, 0) };
  if (dataset === 'holidays') return { ...base, byCalendar: countBy(payloads, (row) => row.calendarKey), byPortion: countBy(payloads, (row) => row.portion) };
  if (dataset === 'leave_balances') return { ...base, byLeaveType: countBy(payloads, (row) => row.leaveTypeKey), entitledMinutes: payloads.reduce((sum, row) => sum + row.entitled, 0), usedMinutes: payloads.reduce((sum, row) => sum + row.used, 0), reservedMinutes: payloads.reduce((sum, row) => sum + row.reserved, 0), remainingMinutes: payloads.reduce((sum, row) => sum + row.entitled - row.used - row.reserved, 0) };
  if (dataset === 'projects') { const budget = {}; for (const row of payloads) if (row.budget && row.currency) budget[row.currency] = addDecimal4(budget[row.currency] ?? 0n, row.budget); return { ...base, byDivision: countBy(payloads, (row) => row.divisionKey), byStatus: countBy(payloads, (row) => row.status), memberships: payloads.reduce((sum, row) => sum + row.memberCodes.length, 0), protectedBudgetByCurrency: Object.fromEntries(Object.entries(budget).map(([currency, value]) => [currency, formatDecimal4(value)])) }; }
  if (dataset === 'tasks') return { ...base, byStatus: countBy(payloads, (row) => row.status), byReviewState: countBy(payloads, (row) => row.reviewState), assigned: payloads.filter((row) => row.assigneeEmployeeCode).length, supportingMemberships: payloads.reduce((sum, row) => sum + row.memberCodes.length, 0) };
  if (dataset === 'cost_rates') return { ...base, byCurrency: countBy(payloads, (row) => row.currency), byUnit: countBy(payloads, (row) => row.rateUnit), byScope: countBy(payloads, (row) => row.projectCode ? 'project' : row.divisionKey ? 'division' : 'employee') };
  if (dataset === 'opening_periods') return { ...base, ranges: payloads.map((row) => ({ startDate: row.start, endDate: row.end, timesheetStatus: row.timesheetStatus, payrollStatus: row.payrollStatus, policy: `${row.policyKey}@${row.policyVersion}` })) };
  return base;
}

async function resolveEmployee(connection, code) { return one(connection, 'SELECT id FROM employees WHERE LOWER(employee_code)=LOWER(?)', [code]); }
async function resolveDivision(connection, key) { return one(connection, 'SELECT id,is_active,is_government FROM divisions WHERE division_key=?', [key]); }
async function resolveProject(connection, code) { return one(connection, 'SELECT id,division_id,manager_employee_id,status,is_active FROM projects WHERE LOWER(project_code)=LOWER(?)', [code]); }
async function effectiveAssignment(connection, employeeId, divisionId, date) { return one(connection, `SELECT id FROM employee_division_assignments WHERE employee_id=? AND division_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`, [employeeId, divisionId, date, date]); }
async function projectParticipant(connection, project, employeeId, date) {
  if (project.manager_employee_id === employeeId) return true;
  return Boolean(await one(connection, `SELECT id FROM project_members WHERE project_id=? AND employee_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`, [project.id, employeeId, date, date]));
}

async function validateCandidate(connection, manifest, payload, key, allPayloads) {
  const crosswalk = await one(connection, `SELECT target_table,target_record_id,normalized_fingerprint FROM import_crosswalks WHERE source_system=? AND dataset_type=? AND source_key_hash=? AND rolled_back_at IS NULL`, [manifest.sourceSystem, manifest.dataset, sha256(key)]);
  const fingerprint = sha256(stableJson(payload));
  if (crosswalk) {
    if (crosswalk.normalized_fingerprint === fingerprint) return { outcome: 'unchanged', target: { table: crosswalk.target_table, id: crosswalk.target_record_id } };
    throw new RowProblem('EXISTING_CONFLICT', null, 'The source key was previously imported with different values.', 'Use the normal correction/effective-date workflow or provide a new approved source key.');
  }
  switch (manifest.dataset) {
    case 'employees': {
      const existing = await one(connection, `SELECT e.id,e.employee_code,e.display_name,e.preferred_name,e.job_title,e.hire_date,e.status,e.employment_type,e.office_location,e.normal_work_mode,e.standard_daily_active_minutes,e.standard_weekly_active_minutes,u.email_normalized FROM employees e JOIN users u ON u.id=e.user_id WHERE LOWER(e.employee_code)=LOWER(?) OR u.email_normalized=?`, [payload.employeeCode, payload.workEmail]);
      if (existing) throw new RowProblem('EXISTING_CONFLICT', 'employee_code', 'Employee code or work email already exists without this import crosswalk.', 'Confirm the existing record or use a new stable employee code/email.');
      if (!await one(connection, 'SELECT id FROM roles WHERE role_key=? AND is_active=TRUE', [payload.roleKey])) throw new RowProblem('REFERENCE_NOT_FOUND', 'role_key', 'Role key does not exist or is inactive.', 'Use an active assignable role key.');
      return { outcome: 'candidate', target: null };
    }
    case 'divisions': {
      const existing = await one(connection, 'SELECT id,name,description,is_government,is_active FROM divisions WHERE division_key=?', [payload.divisionKey]);
      if (!existing) return { outcome: 'candidate', target: null };
      const same = existing.name === payload.name && (existing.description ?? null) === payload.description && Boolean(existing.is_government) === payload.isGovernment && Boolean(existing.is_active) === payload.isActive;
      if (same) return { outcome: 'unchanged', target: { table: 'divisions', id: existing.id } };
      throw new RowProblem('EXISTING_CONFLICT', 'division_key', 'Division key exists with different values.', 'Use the audited division update workflow or correct the source.');
    }
    case 'assignments': {
      const employee = await resolveEmployee(connection, payload.employeeCode); const division = await resolveDivision(connection, payload.divisionKey);
      if (!employee) throw new RowProblem('REFERENCE_NOT_FOUND', 'employee_code', 'Employee was not found.', 'Import/activate the employee first.');
      if (!division) throw new RowProblem('REFERENCE_NOT_FOUND', 'division_key', 'Division was not found.', 'Import the division first.');
      if (payload.isActive && !division.is_active) throw new RowProblem('REFERENCE_INELIGIBLE', 'division_key', 'Active assignment references an inactive division.', 'Activate the division or make the assignment inactive.');
      const lead = payload.leadEmployeeCode ? await resolveEmployee(connection, payload.leadEmployeeCode) : null;
      if (payload.leadEmployeeCode && !lead) throw new RowProblem('REFERENCE_NOT_FOUND', 'lead_employee_code', 'Department lead employee was not found.', 'Import the lead employee first.');
      if (lead) {
        const pendingEligibility = allPayloads.some((candidate) => candidate.employeeCode?.toLowerCase() === payload.leadEmployeeCode.toLowerCase() && candidate.divisionKey === payload.divisionKey && candidate.isActive && candidate.from <= payload.leadFrom && (!candidate.to || candidate.to >= payload.leadFrom));
        if (!pendingEligibility && !await effectiveAssignment(connection, lead.id, division.id, payload.leadFrom)) throw new RowProblem('REFERENCE_INELIGIBLE', 'lead_employee_code', 'Department lead is not effectively assigned to this division.', 'Import an effective division assignment for the lead first.');
      }
      const existing = await one(connection, 'SELECT id FROM employee_division_assignments WHERE employee_id=? AND division_id=? AND effective_from=?', [employee.id, division.id, payload.from]);
      if (existing) throw new RowProblem('EXISTING_CONFLICT', 'effective_from', 'Assignment natural key already exists without this import crosswalk.', 'Confirm the existing assignment or correct the effective date.');
      const primary = payload.isPrimary ? await one(connection, `SELECT id FROM employee_division_assignments WHERE employee_id=? AND is_primary=TRUE AND is_active=TRUE AND effective_from<=COALESCE(?, '9999-12-31') AND (effective_to IS NULL OR effective_to>=?)`, [employee.id, payload.to, payload.from]) : null;
      if (primary) throw new RowProblem('DATE_OVERLAP', 'is_primary', 'Employee already has an overlapping primary assignment.', 'Close the earlier primary range or remove the primary flag.');
      const existingAllocation = await one(connection, `SELECT COALESCE(SUM(allocation_percent_basis_points),0) total FROM employee_division_assignments WHERE employee_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`, [employee.id, payload.from, payload.from]);
      const pendingAllocation = allPayloads.filter((candidate) => candidate.employeeCode?.toLowerCase() === payload.employeeCode.toLowerCase() && candidate.isActive && candidate.from <= payload.from && (!candidate.to || candidate.to >= payload.from)).reduce((sum, candidate) => sum + candidate.allocationBasisPoints, 0);
      if (Number(existingAllocation.total) + pendingAllocation > 10000) throw new RowProblem('OUT_OF_RANGE', 'allocation_percent', 'Concurrent division allocation exceeds 100 percent.', 'Correct the overlapping allocation percentages before import.');
      return { outcome: 'candidate', target: null };
    }
    case 'holidays': {
      if (payload.divisionKey && !await resolveDivision(connection, payload.divisionKey)) throw new RowProblem('REFERENCE_NOT_FOUND', 'division_key', 'Division was not found.', 'Import the division first.');
      return { outcome: 'candidate', target: null };
    }
    case 'leave_balances': {
      const employee = await resolveEmployee(connection, payload.employeeCode); if (!employee) throw new RowProblem('REFERENCE_NOT_FOUND', 'employee_code', 'Employee was not found.', 'Import the employee first.');
      const type = await one(connection, 'SELECT id FROM leave_types WHERE type_key=?', [payload.leaveTypeKey]);
      if (type && await one(connection, 'SELECT id FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=?', [employee.id, type.id, payload.year])) throw new RowProblem('EXISTING_CONFLICT', 'year', 'Opening leave balance already exists without this import crosswalk.', 'Confirm the existing opening balance or correct the year.');
      return { outcome: 'candidate', target: null };
    }
    case 'projects': {
      const division = await resolveDivision(connection, payload.divisionKey); if (!division) throw new RowProblem('REFERENCE_NOT_FOUND', 'division_key', 'Division was not found.', 'Import the division first.');
      const effectiveDate = payload.start ?? manifest.sourceCutoffDate;
      if (payload.managerEmployeeCode) { const manager = await resolveEmployee(connection, payload.managerEmployeeCode); if (!manager) throw new RowProblem('REFERENCE_NOT_FOUND', 'manager_employee_code', 'Project manager was not found.', 'Import the manager employee first.'); if (!await effectiveAssignment(connection, manager.id, division.id, effectiveDate)) throw new RowProblem('REFERENCE_INELIGIBLE', 'manager_employee_code', 'Project manager is not assigned to the project division.', 'Import an effective division assignment for the manager first.'); }
      for (const member of payload.memberCodes) { const employee = await resolveEmployee(connection, member); if (!employee) throw new RowProblem('REFERENCE_NOT_FOUND', 'member_employee_codes', 'A project member was not found.', `Import employee ${member} first.`); if (!await effectiveAssignment(connection, employee.id, division.id, effectiveDate)) throw new RowProblem('REFERENCE_INELIGIBLE', 'member_employee_codes', 'A project member is not assigned to the project division.', `Import an effective division assignment for ${member} first.`); }
      if (await one(connection, 'SELECT id FROM projects WHERE LOWER(project_code)=LOWER(?)', [payload.projectCode])) throw new RowProblem('EXISTING_CONFLICT', 'project_code', 'Project code already exists without this import crosswalk.', 'Confirm the existing project or use its normal update workflow.');
      return { outcome: 'candidate', target: null };
    }
    case 'tasks': {
      const project = await resolveProject(connection, payload.projectCode); if (!project) throw new RowProblem('REFERENCE_NOT_FOUND', 'project_code', 'Project was not found.', 'Import the project first.');
      if (!project.is_active) throw new RowProblem('REFERENCE_INELIGIBLE', 'project_code', 'Task references an inactive project.', 'Activate the project or exclude the task.');
      const effectiveDate = payload.startDate ?? manifest.sourceCutoffDate;
      for (const [field, code] of [['creator_employee_code', payload.creatorEmployeeCode], ['assignee_employee_code', payload.assigneeEmployeeCode], ['reviewer_employee_code', payload.reviewerEmployeeCode]]) {
        if (!code) continue;
        const employee = await resolveEmployee(connection, code); if (!employee) throw new RowProblem('REFERENCE_NOT_FOUND', field, `${field} was not found.`, `Import employee ${code} first.`);
        if (field !== 'reviewer_employee_code' && !await effectiveAssignment(connection, employee.id, project.division_id, effectiveDate)) throw new RowProblem('REFERENCE_INELIGIBLE', field, `${field} is not assigned to the project division.`, `Create an effective division assignment for ${code}.`);
        if (field !== 'reviewer_employee_code' && !await projectParticipant(connection, project, employee.id, effectiveDate)) throw new RowProblem('REFERENCE_INELIGIBLE', field, `${field} is not a project manager or member.`, `Add ${code} to the project before importing the task.`);
      }
      for (const member of payload.memberCodes) { const employee = await resolveEmployee(connection, member); if (!employee) throw new RowProblem('REFERENCE_NOT_FOUND', 'supporting_member_codes', 'A supporting member was not found.', `Import employee ${member} first.`); if (!await projectParticipant(connection, project, employee.id, effectiveDate)) throw new RowProblem('REFERENCE_INELIGIBLE', 'supporting_member_codes', 'A supporting member is not a project member.', `Add ${member} to the project first.`); }
      if (payload.parentSourceTaskKey && !allPayloads.some((candidate) => candidate.sourceTaskKey === payload.parentSourceTaskKey) && !await one(connection, `SELECT target_record_id FROM import_crosswalks WHERE source_system=? AND dataset_type='tasks' AND source_key_hash=? AND rolled_back_at IS NULL`, [manifest.sourceSystem, sha256(payload.parentSourceTaskKey)])) throw new RowProblem('REFERENCE_NOT_FOUND', 'parent_source_task_key', 'Parent task source key was not found.', 'Include the parent in this batch or import it first.');
      return { outcome: 'candidate', target: null };
    }
    case 'cost_rates': {
      const employee = payload.employeeCode ? await resolveEmployee(connection, payload.employeeCode) : null; const division = payload.divisionKey ? await resolveDivision(connection, payload.divisionKey) : null; const project = payload.projectCode ? await resolveProject(connection, payload.projectCode) : null;
      if (payload.employeeCode && !employee) throw new RowProblem('REFERENCE_NOT_FOUND', 'employee_code', 'Employee was not found.', 'Import the employee first.');
      if (payload.divisionKey && !division) throw new RowProblem('REFERENCE_NOT_FOUND', 'division_key', 'Division was not found.', 'Import the division first.');
      if (payload.projectCode && !project) throw new RowProblem('REFERENCE_NOT_FOUND', 'project_code', 'Project was not found.', 'Import the project first.');
      if (project && division && project.division_id !== division.id) throw new RowProblem('REFERENCE_INELIGIBLE', 'project_code', 'Project does not belong to the supplied division.', 'Correct the project/division scope.');
      const overlap = await one(connection, `SELECT id FROM cost_rates WHERE employee_id <=> ? AND division_id <=> ? AND project_id <=> ? AND effective_from<=COALESCE(?, '9999-12-31') AND (effective_to IS NULL OR effective_to>=?)`, [employee?.id ?? null, division?.id ?? null, project?.id ?? null, payload.to, payload.from]);
      if (overlap) throw new RowProblem('DATE_OVERLAP', 'effective_from', 'Cost rate overlaps an existing rate at the same scope.', 'Close or supersede the existing effective rate through the approved financial workflow.');
      return { outcome: 'candidate', target: null };
    }
    case 'opening_periods': {
      if (!await one(connection, 'SELECT id FROM policy_versions WHERE policy_key=? AND version_number=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)', [payload.policyKey, payload.policyVersion, payload.start, payload.end])) throw new RowProblem('REFERENCE_NOT_FOUND', 'policy_version', 'Policy version does not cover the complete opening period.', 'Select an approved policy version effective for the full range.');
      const overlap = await one(connection, 'SELECT id FROM timesheet_periods WHERE start_date<=? AND end_date>=?', [payload.end, payload.start]);
      if (overlap) throw new RowProblem('DATE_OVERLAP', 'start_date', 'Opening period overlaps an existing timesheet period.', 'Choose a non-overlapping opening range.');
      return { outcome: 'candidate', target: null };
    }
    default: throw new Error(`Unsupported dataset ${manifest.dataset}`);
  }
}

async function analyze(connection, manifest, parsed) {
  validateHeaders(manifest.dataset, parsed.headers);
  const preliminary = parsed.rows.map(({ rowNumber, values }) => {
    try {
      const payload = normalize(manifest.dataset, values); const key = sourceKey(manifest.dataset, payload); const fingerprint = sha256(stableJson(payload));
      return { rowNumber, values, payload, key, fingerprint };
    } catch (error) {
      const problem = error instanceof RowProblem ? error : new RowProblem('INVALID_FORMAT', null, 'Source row could not be normalized.', 'Correct the source row.');
      return rejection(rowNumber, `invalid-row:${rowNumber}`, sha256(stableJson(values)), problem);
    }
  });
  const groups = new Map();
  for (const row of preliminary.filter((item) => item.payload)) groups.set(row.key, [...(groups.get(row.key) ?? []), row]);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const fingerprints = new Set(group.map((item) => item.fingerprint));
    if (fingerprints.size > 1) for (const item of group) Object.assign(item, rejection(item.rowNumber, item.key, item.fingerprint, new RowProblem('DUPLICATE_CONFLICT', null, 'Natural key has conflicting rows in this batch.', 'Keep exactly one authoritative row for this key.')));
    else for (const item of group.slice(1)) Object.assign(item, { outcome: 'unchanged', errorCode: 'DUPLICATE_IDENTICAL', errorField: null, safeMessage: 'Identical duplicate row was ignored.', guidance: 'Remove the duplicate from the next extract.', target: null });
  }
  const allPayloads = preliminary.filter((item) => item.payload && item.outcome !== 'rejected').map((item) => item.payload);
  const output = [];
  for (const item of preliminary) {
    if (!item.payload || item.outcome === 'rejected' || item.outcome === 'unchanged') { output.push(item); continue; }
    try {
      const decision = await validateCandidate(connection, manifest, item.payload, item.key, allPayloads);
      output.push({ ...item, ...decision, sourceKey: item.key, sourceKeyHash: sha256(item.key), errorCode: decision.outcome === 'unchanged' ? 'EXISTING_UNCHANGED' : null, errorField: null, safeMessage: decision.outcome === 'unchanged' ? 'Existing record is unchanged.' : null, guidance: null });
    } catch (error) {
      output.push(rejection(item.rowNumber, item.key, item.fingerprint, error instanceof RowProblem ? error : new RowProblem('INVALID_FORMAT', null, 'Candidate validation failed.', 'Correct the source row.')));
    }
  }
  return output;
}

async function appendAudit(connection, actorUserId, action, batch, reason, beforeProtected, afterProtected) {
  await connection.execute(`INSERT INTO audit_events(event_id,actor_user_id,action,resource_type,resource_id,scope_json,reason,correlation_id,before_protected,after_protected,occurred_at) VALUES(?,?,?,'import_batch',?,CAST(? AS JSON),?,?,CAST(? AS JSON),CAST(? AS JSON),?)`, [randomUUID(), actorUserId, action, batch.id, JSON.stringify({ dataset: batch.dataset_type, releaseId: batch.release_id }), reason ?? null, randomUUID(), JSON.stringify(beforeProtected ?? null), JSON.stringify(afterProtected ?? null), new Date()]);
}

function safeManifest(manifest) {
  return { releaseId: manifest.releaseId, dataset: manifest.dataset, mappingVersion: manifest.mappingVersion, sourceSystem: manifest.sourceSystem, sourceFileName: manifest.sourceFileName, sourceCutoffDate: manifest.sourceCutoffDate, declaredRowCount: manifest.declaredRowCount, sha256: manifest.sha256, sensitivity: manifest.sensitivity, actorUserId: manifest.actorUserId, owner: manifest.owner, ownerUserId: manifest.ownerUserId, steward: manifest.steward, zeroRow: Boolean(manifest.zeroRow), costPrecedence: manifest.dataset === 'cost_rates' ? manifest.costPrecedence : undefined };
}

export async function dryRunImport(connection, rawManifest, sourceBuffer) {
  const manifest = validateManifest(rawManifest, sourceBuffer);
  await actorContext(connection, manifest.actorUserId);
  await actorContext(connection, manifest.ownerUserId);
  const parsed = parseCsv(sourceBuffer);
  if (parsed.rows.length !== manifest.declaredRowCount) throw new Error(`MANIFEST_INVALID: declaredRowCount is ${manifest.declaredRowCount}, but CSV contains ${parsed.rows.length} rows.`);
  if (parsed.rows.length === 0 && !manifest.zeroRow) throw new Error('MANIFEST_INVALID: Empty source requires zeroRow=true and owner evidence.');
  const snapshot = await targetSnapshot(connection, manifest.dataset);
  const analyzed = await analyze(connection, manifest, parsed);
  const rejected = analyzed.filter((row) => row.outcome === 'rejected').length;
  const candidates = analyzed.filter((row) => row.outcome === 'candidate').length;
  const unchanged = analyzed.filter((row) => row.outcome === 'unchanged').length;
  const evidence = sha256(stableJson(analyzed.map((row) => ({ rowNumber: row.rowNumber, sourceKeyHash: row.sourceKeyHash ?? sha256(row.key ?? `row:${row.rowNumber}`), fingerprint: row.fingerprint, outcome: row.outcome, errorCode: row.errorCode ?? null, target: row.target ?? null }))));
  const totals = reconciliation(manifest.dataset, analyzed);
  await connection.beginTransaction();
  try {
    const existing = await one(connection, 'SELECT id,state FROM import_batches WHERE release_id=? AND source_system=? AND dataset_type=? AND source_sha256=? FOR UPDATE', [manifest.releaseId, manifest.sourceSystem, manifest.dataset, manifest.sha256]);
    const batchId = existing?.id ?? randomUUID();
    if (existing?.state === 'committed') { await connection.rollback(); return { batchId, state: 'committed', counts: { received: parsed.rows.length, accepted: candidates, unchanged, rejected }, evidenceSha256: evidence, targetSnapshotSha256: snapshot, idempotent: true }; }
    if (!existing) await connection.execute(`INSERT INTO import_batches(id,release_id,dataset_type,mapping_version,source_system,source_file_name,source_cutoff_date,source_row_count,source_sha256,sensitivity,state,schema_version,target_snapshot_sha256,dry_run_evidence_sha256,manifest_json,reconciliation_json,received_count,accepted_count,unchanged_count,rejected_count,created_by_user_id,validated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON),CAST(? AS JSON),?,?,?,?,?,?)`, [batchId, manifest.releaseId, manifest.dataset, manifest.mappingVersion, manifest.sourceSystem, manifest.sourceFileName, manifest.sourceCutoffDate, manifest.declaredRowCount, manifest.sha256, manifest.sensitivity, rejected ? 'dry_run_failed' : 'ready_for_approval', IMPORT_SCHEMA_VERSION, snapshot, evidence, JSON.stringify(safeManifest(manifest)), JSON.stringify(totals), parsed.rows.length, candidates, unchanged, rejected, manifest.actorUserId, new Date()]);
    else {
      await connection.execute('UPDATE import_approvals SET revoked_at=? WHERE batch_id=? AND revoked_at IS NULL', [new Date(), batchId]);
      await connection.execute('DELETE FROM import_rows WHERE batch_id=?', [batchId]);
      await connection.execute(`UPDATE import_batches SET release_id=?,mapping_version=?,source_file_name=?,source_cutoff_date=?,source_row_count=?,sensitivity=?,state=?,schema_version=?,target_snapshot_sha256=?,dry_run_evidence_sha256=?,manifest_json=CAST(? AS JSON),reconciliation_json=CAST(? AS JSON),received_count=?,accepted_count=?,unchanged_count=?,rejected_count=?,committed_count=0,validated_at=?,version=version+1 WHERE id=?`, [manifest.releaseId, manifest.mappingVersion, manifest.sourceFileName, manifest.sourceCutoffDate, manifest.declaredRowCount, manifest.sensitivity, rejected ? 'dry_run_failed' : 'ready_for_approval', IMPORT_SCHEMA_VERSION, snapshot, evidence, JSON.stringify(safeManifest(manifest)), JSON.stringify(totals), parsed.rows.length, candidates, unchanged, rejected, new Date(), batchId]);
    }
    for (const row of analyzed) await connection.execute(`INSERT INTO import_rows(batch_id,source_row_number,source_key_hash,normalized_fingerprint,outcome,target_type,target_id,error_code,error_field,safe_message,corrective_guidance) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [batchId, row.rowNumber, row.sourceKeyHash ?? sha256(row.key ?? `row:${row.rowNumber}`), row.fingerprint, row.outcome, row.target?.table ?? null, row.target?.id ?? null, row.errorCode ?? null, row.errorField ?? null, row.safeMessage ?? null, row.guidance ?? null]);
    const batch = { id: batchId, dataset_type: manifest.dataset, release_id: manifest.releaseId };
    await appendAudit(connection, manifest.actorUserId, 'import.batch.dry_run', batch, rejected ? 'Dry run found rejected rows.' : 'Dry run passed.', null, { received: parsed.rows.length, accepted: candidates, unchanged, rejected, sourceSha256: manifest.sha256, evidenceSha256: evidence, reconciliationSha256: sha256(stableJson(totals)) });
    await connection.commit();
    return { batchId, state: rejected ? 'dry_run_failed' : 'ready_for_approval', counts: { received: parsed.rows.length, accepted: candidates, unchanged, rejected }, reconciliation: totals, evidenceSha256: evidence, targetSnapshotSha256: snapshot, idempotent: Boolean(existing) };
  } catch (error) { await connection.rollback(); throw error; }
}

export async function approveImport(connection, { batchId, scope, actorUserId, reason }) {
  if (!['owner', 'hr', 'financial', 'division', 'technical'].includes(scope)) throw new Error('INVALID_ENUM: Unsupported approval scope.');
  if (!reason?.trim()) throw new Error('REQUIRED: Approval reason is required.');
  const actor = await actorContext(connection, actorUserId); authorizeApproval(actor, scope);
  await connection.beginTransaction();
  try {
    const batch = await one(connection, 'SELECT * FROM import_batches WHERE id=? FOR UPDATE', [batchId]);
    if (!batch) throw new Error('NOT_FOUND: Import batch was not found.');
    if (!['ready_for_approval', 'approved'].includes(batch.state)) throw new Error(`CONFLICT: Batch state ${batch.state} cannot be approved.`);
    if (!REQUIRED_APPROVALS[batch.dataset_type].includes(scope)) throw new Error('INVALID_ENUM: Approval scope is not required for this dataset.');
    const batchManifest = typeof batch.manifest_json === 'string' ? JSON.parse(batch.manifest_json) : batch.manifest_json;
    if (scope === 'owner' && batchManifest.ownerUserId !== actorUserId) throw new Error('PROTECTED_SCOPE_DENIED: Owner approval must be recorded by the manifest owner.');
    await connection.execute(`INSERT INTO import_approvals(id,batch_id,approval_scope,actor_user_id,reason,permission_snapshot,source_sha256,evidence_sha256,target_snapshot_sha256,mapping_version) VALUES(?,?,?,?,?,CAST(? AS JSON),?,?,?,?)`, [randomUUID(), batchId, scope, actorUserId, reason.trim(), JSON.stringify({ roles: actor.roles, permissions: actor.permissions }), batch.source_sha256, batch.dry_run_evidence_sha256, batch.target_snapshot_sha256, batch.mapping_version]);
    const approvals = (await rows(connection, 'SELECT approval_scope FROM import_approvals WHERE batch_id=? AND revoked_at IS NULL', [batchId])).map((row) => row.approval_scope);
    const complete = REQUIRED_APPROVALS[batch.dataset_type].every((requiredScope) => approvals.includes(requiredScope));
    if (complete) await connection.execute("UPDATE import_batches SET state='approved',version=version+1 WHERE id=?", [batchId]);
    await appendAudit(connection, actorUserId, 'import.batch.approved', batch, reason.trim(), null, { scope, approvalsComplete: complete });
    await connection.commit();
    return { batchId, scope, state: complete ? 'approved' : 'ready_for_approval', remainingScopes: REQUIRED_APPROVALS[batch.dataset_type].filter((requiredScope) => !approvals.includes(requiredScope)) };
  } catch (error) { await connection.rollback(); throw error; }
}

async function trackInserted(connection, batchId, sequence, table, primaryKey) {
  if (!TABLES.has(table)) throw new Error(`Unsafe import target table ${table}.`);
  const entries = Object.entries(primaryKey);
  if (entries.some(([key]) => !/^[a-z_]+$/.test(key))) throw new Error('Unsafe import primary key.');
  const current = await one(connection, `SELECT * FROM \`${table}\` WHERE ${entries.map(([key]) => `\`${key}\`=?`).join(' AND ')}`, entries.map(([, value]) => value));
  if (!current) throw new Error(`Imported row missing from ${table}.`);
  await connection.execute('INSERT INTO import_mutations(batch_id,mutation_order,target_table,primary_key_json,committed_row_sha256) VALUES(?,?,?,CAST(? AS JSON),?)', [batchId, sequence, table, JSON.stringify(primaryKey), sha256(stableJson(current))]);
  return sequence + 1;
}

async function insertPayload(connection, manifest, payload, actorUserId, batchId, sequence, localTargets) {
  let target;
  if (manifest.dataset === 'employees') {
    const userId = randomUUID(); const employeeId = randomUUID(); const role = await one(connection, 'SELECT id FROM roles WHERE role_key=?', [payload.roleKey]);
    await connection.execute('INSERT INTO users(id,name,email,email_normalized,employee_identifier,status,email_verified) VALUES(?,?,?,?,?,?,FALSE)', [userId, payload.displayName, payload.workEmail, payload.workEmail, payload.employeeCode, payload.status]); sequence = await trackInserted(connection, batchId, sequence, 'users', { id: userId });
    await connection.execute(`INSERT INTO employees(id,user_id,employee_code,display_name,preferred_name,job_title,hire_date,status,employment_type,office_location,normal_work_mode,standard_daily_active_minutes,standard_weekly_active_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [employeeId, userId, payload.employeeCode, payload.displayName, payload.preferredName, payload.jobTitle, payload.hireDate, payload.status, payload.employmentType, payload.officeLocation, payload.normalWorkMode, payload.daily, payload.weekly]); sequence = await trackInserted(connection, batchId, sequence, 'employees', { id: employeeId });
    const userRoleId = randomUUID(); await connection.execute('INSERT INTO user_roles(id,user_id,role_id,effective_from,effective_to) VALUES(?,?,?,?,?)', [userRoleId, userId, role.id, payload.roleFrom, payload.roleTo]); sequence = await trackInserted(connection, batchId, sequence, 'user_roles', { id: userRoleId }); target = { table: 'employees', id: employeeId };
  } else if (manifest.dataset === 'divisions') {
    const id = randomUUID(); await connection.execute('INSERT INTO divisions(id,division_key,name,description,is_government,is_active) VALUES(?,?,?,?,?,?)', [id, payload.divisionKey, payload.name, payload.description, payload.isGovernment, payload.isActive]); sequence = await trackInserted(connection, batchId, sequence, 'divisions', { id }); target = { table: 'divisions', id };
  } else if (manifest.dataset === 'assignments') {
    const employee = await resolveEmployee(connection, payload.employeeCode); const division = await resolveDivision(connection, payload.divisionKey);
    let department = await one(connection, 'SELECT id,name,is_active FROM departments WHERE division_id=? AND normalized_code=LOWER(TRIM(?))', [division.id, payload.departmentCode]);
    if (!department) { const id = randomUUID(); await connection.execute('INSERT INTO departments(id,division_id,name,code,description,is_active,created_by_user_id,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?)', [id, division.id, payload.departmentName, payload.departmentCode, payload.departmentDescription, payload.departmentIsActive, actorUserId, actorUserId]); sequence = await trackInserted(connection, batchId, sequence, 'departments', { id }); department = { id }; }
    const id = randomUUID(); await connection.execute(`INSERT INTO employee_division_assignments(id,employee_id,division_id,department_id,effective_from,effective_to,allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active,role_in_division,is_temporary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [id, employee.id, division.id, department.id, payload.from, payload.to, payload.allocationBasisPoints, payload.expectedWeeklyMinutes, payload.isPrimary, payload.isActive, payload.roleInDivision, payload.temporary]); sequence = await trackInserted(connection, batchId, sequence, 'employee_division_assignments', { id });
    if (payload.leadEmployeeCode) { const lead = await resolveEmployee(connection, payload.leadEmployeeCode); const leadId = randomUUID(); await connection.execute('INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,effective_to,reason,created_by_user_id,updated_by_user_id) VALUES(?,?,?,?,?,?,?,?)', [leadId, department.id, lead.id, payload.leadFrom, payload.leadTo, payload.leadReason, actorUserId, actorUserId]); sequence = await trackInserted(connection, batchId, sequence, 'department_lead_assignments', { id: leadId }); }
    target = { table: 'employee_division_assignments', id };
  } else if (manifest.dataset === 'holidays') {
    const division = payload.divisionKey ? await resolveDivision(connection, payload.divisionKey) : null; const calendarLocalKey = payload.calendarKey;
    let calendar = localTargets.calendars.get(calendarLocalKey) ?? await one(connection, 'SELECT id FROM holiday_calendars WHERE division_id <=> ? AND name=? AND effective_from=?', [division?.id ?? null, payload.calendarName, payload.calendarFrom]);
    if (!calendar) { const id = randomUUID(); await connection.execute('INSERT INTO holiday_calendars(id,division_id,name,effective_from,effective_to,is_active) VALUES(?,?,?,?,?,?)', [id, division?.id ?? null, payload.calendarName, payload.calendarFrom, payload.calendarTo, payload.calendarIsActive]); sequence = await trackInserted(connection, batchId, sequence, 'holiday_calendars', { id }); calendar = { id }; localTargets.calendars.set(calendarLocalKey, calendar); }
    const id = randomUUID(); await connection.execute('INSERT INTO holidays(id,calendar_id,holiday_date,name,portion,is_active) VALUES(?,?,?,?,?,?)', [id, calendar.id, payload.holidayDate, payload.holidayName, payload.portion, payload.isActive]); sequence = await trackInserted(connection, batchId, sequence, 'holidays', { id }); target = { table: 'holidays', id };
  } else if (manifest.dataset === 'leave_balances') {
    const employee = await resolveEmployee(connection, payload.employeeCode); let type = await one(connection, 'SELECT id FROM leave_types WHERE type_key=?', [payload.leaveTypeKey]);
    if (!type) { const id = randomUUID(); await connection.execute('INSERT INTO leave_types(id,type_key,name,is_paid,requires_attachment,is_active) VALUES(?,?,?,?,?,?)', [id, payload.leaveTypeKey, payload.leaveTypeName, payload.isPaid, payload.requiresAttachment, payload.leaveTypeIsActive]); sequence = await trackInserted(connection, batchId, sequence, 'leave_types', { id }); type = { id }; }
    const id = randomUUID(); await connection.execute('INSERT INTO leave_balances(id,employee_id,leave_type_id,year,entitled_minutes,used_minutes,reserved_minutes,unit_minutes) VALUES(?,?,?,?,?,?,?,?)', [id, employee.id, type.id, payload.year, payload.entitled, payload.used, payload.reserved, payload.unitMinutes]); sequence = await trackInserted(connection, batchId, sequence, 'leave_balances', { id }); target = { table: 'leave_balances', id };
  } else if (manifest.dataset === 'projects') {
    const division = await resolveDivision(connection, payload.divisionKey); const manager = payload.managerEmployeeCode ? await resolveEmployee(connection, payload.managerEmployeeCode) : null; const id = randomUUID();
    await connection.execute(`INSERT INTO projects(id,division_id,project_code,name,status,manager_employee_id,start_date,end_date,priority,estimated_minutes,description,completion_percent,accepts_time_entries,budget_amount,currency,client_name,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, division.id, payload.projectCode, payload.name, payload.status, manager?.id ?? null, payload.start, payload.end, payload.priority, payload.estimatedMinutes, payload.description, payload.completionPercent, payload.acceptsTimeEntries, payload.budget, payload.currency, payload.clientName, payload.isActive]); sequence = await trackInserted(connection, batchId, sequence, 'projects', { id });
    for (const code of payload.memberCodes) { const employee = await resolveEmployee(connection, code); const membershipId = randomUUID(); await connection.execute('INSERT INTO project_members(id,project_id,employee_id,effective_from,is_active) VALUES(?,?,?,?,TRUE)', [membershipId, id, employee.id, payload.start ?? manifest.sourceCutoffDate]); sequence = await trackInserted(connection, batchId, sequence, 'project_members', { id: membershipId }); }
    target = { table: 'projects', id };
  } else if (manifest.dataset === 'tasks') {
    const project = await resolveProject(connection, payload.projectCode); const creator = await resolveEmployee(connection, payload.creatorEmployeeCode); const assignee = payload.assigneeEmployeeCode ? await resolveEmployee(connection, payload.assigneeEmployeeCode) : null; const reviewer = payload.reviewerEmployeeCode ? await resolveEmployee(connection, payload.reviewerEmployeeCode) : null;
    let parentId = null; if (payload.parentSourceTaskKey) parentId = localTargets.tasks.get(payload.parentSourceTaskKey)?.id ?? (await one(connection, `SELECT target_record_id id FROM import_crosswalks WHERE source_system=? AND dataset_type='tasks' AND source_key_hash=? AND rolled_back_at IS NULL`, [manifest.sourceSystem, sha256(payload.parentSourceTaskKey)]))?.id ?? null;
    const id = randomUUID(); await connection.execute(`INSERT INTO tasks(id,project_id,parent_task_id,division_id,title,description,status,priority,assignee_employee_id,creator_employee_id,creator_role,review_state,reviewer_employee_id,reviewed_at,review_note,estimated_minutes,start_date,due_date,completed_at,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, project.id, parentId, project.division_id, payload.title, payload.description, payload.status, payload.priority, assignee?.id ?? null, creator.id, payload.creatorRole, payload.reviewState, reviewer?.id ?? null, payload.reviewedAt, payload.reviewNote, payload.estimatedMinutes, payload.startDate, payload.dueDate, payload.completedAt, payload.isActive]); sequence = await trackInserted(connection, batchId, sequence, 'tasks', { id }); localTargets.tasks.set(payload.sourceTaskKey, { id });
    for (const code of payload.memberCodes) { const employee = await resolveEmployee(connection, code); await connection.execute('INSERT INTO task_members(task_id,employee_id) VALUES(?,?)', [id, employee.id]); sequence = await trackInserted(connection, batchId, sequence, 'task_members', { task_id: id, employee_id: employee.id }); }
    target = { table: 'tasks', id };
  } else if (manifest.dataset === 'cost_rates') {
    const employee = payload.employeeCode ? await resolveEmployee(connection, payload.employeeCode) : null; const division = payload.divisionKey ? await resolveDivision(connection, payload.divisionKey) : null; const project = payload.projectCode ? await resolveProject(connection, payload.projectCode) : null; const id = randomUUID();
    await connection.execute('INSERT INTO cost_rates(id,employee_id,division_id,project_id,rate_amount,currency,rate_unit,effective_from,effective_to,is_active) VALUES(?,?,?,?,?,?,?,?,?,?)', [id, employee?.id ?? null, division?.id ?? null, project?.id ?? null, payload.rateAmount, payload.currency, payload.rateUnit, payload.from, payload.to, payload.isActive]); sequence = await trackInserted(connection, batchId, sequence, 'cost_rates', { id }); target = { table: 'cost_rates', id };
  } else if (manifest.dataset === 'opening_periods') {
    const policy = await one(connection, 'SELECT id FROM policy_versions WHERE policy_key=? AND version_number=?', [payload.policyKey, payload.policyVersion]); const timesheetId = randomUUID(); const payrollId = randomUUID();
    await connection.execute('INSERT INTO timesheet_periods(id,label,start_date,end_date,status,policy_version_id) VALUES(?,?,?,?,?,?)', [timesheetId, payload.timesheetLabel, payload.start, payload.end, payload.timesheetStatus, policy.id]); sequence = await trackInserted(connection, batchId, sequence, 'timesheet_periods', { id: timesheetId });
    await connection.execute('INSERT INTO payroll_periods(id,label,start_date,end_date,timesheet_period_id,status) VALUES(?,?,?,?,?,?)', [payrollId, payload.payrollLabel, payload.start, payload.end, timesheetId, payload.payrollStatus]); sequence = await trackInserted(connection, batchId, sequence, 'payroll_periods', { id: payrollId }); target = { table: 'payroll_periods', id: payrollId };
  }
  return { target, sequence };
}

function taskOrder(items) {
  if (items.length === 0) return items;
  const byKey = new Map(items.map((item) => [item.payload.sourceTaskKey, item])); const output = []; const visiting = new Set(); const visited = new Set();
  function visit(item) { if (visited.has(item.payload.sourceTaskKey)) return; if (visiting.has(item.payload.sourceTaskKey)) throw new Error('INVALID_FORMAT: Task parent relationships contain a cycle.'); visiting.add(item.payload.sourceTaskKey); const parent = item.payload.parentSourceTaskKey ? byKey.get(item.payload.parentSourceTaskKey) : null; if (parent) visit(parent); visiting.delete(item.payload.sourceTaskKey); visited.add(item.payload.sourceTaskKey); output.push(item); }
  for (const item of items) visit(item); return output;
}

export async function commitImport(connection, rawManifest, sourceBuffer, actorUserId) {
  const manifest = validateManifest(rawManifest, sourceBuffer); const actor = await actorContext(connection, actorUserId); if (!actor.roles.includes('super_admin')) throw new Error('PROTECTED_SCOPE_DENIED: Import commit requires Super Administrator.');
  const [[lock]] = await connection.query("SELECT GET_LOCK('office_management_import_commit',10) acquired"); if (lock.acquired !== 1) throw new Error('CONFLICT: Could not acquire import commit lock.');
  try {
    const parsed = parseCsv(sourceBuffer); const snapshot = await targetSnapshot(connection, manifest.dataset); const analyzed = await analyze(connection, manifest, parsed);
    const evidence = sha256(stableJson(analyzed.map((row) => ({ rowNumber: row.rowNumber, sourceKeyHash: row.sourceKeyHash ?? sha256(row.key ?? `row:${row.rowNumber}`), fingerprint: row.fingerprint, outcome: row.outcome, errorCode: row.errorCode ?? null, target: row.target ?? null }))));
    const totals = reconciliation(manifest.dataset, analyzed);
    await connection.beginTransaction();
    try {
      const batch = await one(connection, 'SELECT * FROM import_batches WHERE release_id=? AND source_system=? AND dataset_type=? AND source_sha256=? FOR UPDATE', [manifest.releaseId, manifest.sourceSystem, manifest.dataset, manifest.sha256]);
      if (!batch) throw new Error('NOT_FOUND: Run dry-run before commit.');
      if (batch.state === 'committed') { await connection.rollback(); return { batchId: batch.id, state: 'committed', committed: batch.committed_count, idempotent: true }; }
      if (batch.state !== 'approved') throw new Error(`CONFLICT: Batch state ${batch.state} is not approved.`);
      if (batch.target_snapshot_sha256 !== snapshot || batch.dry_run_evidence_sha256 !== evidence || batch.schema_version !== IMPORT_SCHEMA_VERSION) throw new Error('STALE_DRY_RUN: Source, target snapshot, schema, or evidence changed; run dry-run and approvals again.');
      const approvedTotals = typeof batch.reconciliation_json === 'string' ? JSON.parse(batch.reconciliation_json) : batch.reconciliation_json;
      if (stableJson(approvedTotals) !== stableJson(totals)) throw new Error('STALE_DRY_RUN: Reconciliation totals changed; run dry-run and approvals again.');
      const approvals = await rows(connection, `SELECT approval_scope,source_sha256,evidence_sha256,target_snapshot_sha256,mapping_version FROM import_approvals WHERE batch_id=? AND revoked_at IS NULL`, [batch.id]);
      for (const requiredScope of REQUIRED_APPROVALS[manifest.dataset]) { const approval = approvals.find((item) => item.approval_scope === requiredScope); if (!approval || approval.source_sha256 !== manifest.sha256 || approval.evidence_sha256 !== evidence || approval.target_snapshot_sha256 !== snapshot || approval.mapping_version !== IMPORT_MAPPING_VERSION) throw new Error(`STALE_DRY_RUN: Missing current ${requiredScope} approval.`); }
      if (analyzed.some((row) => row.outcome === 'rejected')) throw new Error('CONFLICT: Rejected rows prevent commit.');
      await connection.execute("UPDATE import_batches SET state='committing',committed_by_user_id=?,version=version+1 WHERE id=?", [actorUserId, batch.id]);
      let sequence = 1; let committed = 0; const resultByKey = new Map(); const localTargets = { calendars: new Map(), tasks: new Map() };
      let candidates = analyzed.filter((row) => row.outcome === 'candidate'); if (manifest.dataset === 'tasks') candidates = taskOrder(candidates);
      for (const row of candidates) {
        const result = await insertPayload(connection, manifest, row.payload, actorUserId, batch.id, sequence, localTargets); sequence = result.sequence; committed += 1; resultByKey.set(row.key, result.target);
        await connection.execute(`INSERT INTO import_crosswalks(id,source_system,dataset_type,source_key_hash,target_table,target_record_id,normalized_fingerprint,batch_id) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE target_table=VALUES(target_table),target_record_id=VALUES(target_record_id),normalized_fingerprint=VALUES(normalized_fingerprint),batch_id=VALUES(batch_id),rolled_back_at=NULL`, [randomUUID(), manifest.sourceSystem, manifest.dataset, sha256(row.key), result.target.table, result.target.id, row.fingerprint, batch.id]);
        await connection.execute("UPDATE import_rows SET outcome='committed',target_type=?,target_id=? WHERE batch_id=? AND source_row_number=?", [result.target.table, result.target.id, batch.id, row.rowNumber]);
      }
      for (const row of analyzed.filter((item) => item.outcome === 'unchanged')) { const target = row.target ?? resultByKey.get(row.key); if (target) { await connection.execute(`INSERT INTO import_crosswalks(id,source_system,dataset_type,source_key_hash,target_table,target_record_id,normalized_fingerprint,batch_id) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE target_table=VALUES(target_table),target_record_id=VALUES(target_record_id),normalized_fingerprint=VALUES(normalized_fingerprint),batch_id=VALUES(batch_id),rolled_back_at=NULL`, [randomUUID(), manifest.sourceSystem, manifest.dataset, sha256(row.key), target.table, target.id, row.fingerprint, batch.id]); await connection.execute('UPDATE import_rows SET target_type=?,target_id=? WHERE batch_id=? AND source_row_number=?', [target.table, target.id, batch.id, row.rowNumber]); } }
      await connection.execute("UPDATE import_batches SET state='committed',committed_count=?,committed_at=?,version=version+1 WHERE id=?", [committed, new Date(), batch.id]);
      await appendAudit(connection, actorUserId, 'import.batch.committed', batch, 'Approved production data import.', { state: 'approved' }, { state: 'committed', committed, unchanged: batch.unchanged_count, evidenceSha256: evidence, reconciliationSha256: sha256(stableJson(totals)) });
      await connection.commit(); return { batchId: batch.id, state: 'committed', committed, unchanged: analyzed.filter((row) => row.outcome === 'unchanged').length, reconciliation: totals, idempotent: false };
    } catch (error) { await connection.rollback(); throw error; }
  } finally { await connection.query("SELECT RELEASE_LOCK('office_management_import_commit')"); }
}

export async function rollbackImport(connection, { batchId, actorUserId, reason, confirmation }) {
  if (confirmation !== batchId) throw new Error('CONFIRMATION_REQUIRED: confirmation must equal the batch id.');
  if (!reason?.trim()) throw new Error('REQUIRED: Rollback reason is required.');
  const actor = await actorContext(connection, actorUserId); if (!actor.roles.includes('super_admin')) throw new Error('PROTECTED_SCOPE_DENIED: Import rollback requires Super Administrator.');
  const [[lock]] = await connection.query("SELECT GET_LOCK('office_management_import_commit',10) acquired"); if (lock.acquired !== 1) throw new Error('CONFLICT: Could not acquire import rollback lock.');
  try {
    await connection.beginTransaction();
    try {
      const batch = await one(connection, 'SELECT * FROM import_batches WHERE id=? FOR UPDATE', [batchId]); if (!batch) throw new Error('NOT_FOUND: Import batch was not found.'); if (batch.state !== 'committed') throw new Error(`CONFLICT: Batch state ${batch.state} cannot be rolled back.`);
      const mutations = await rows(connection, 'SELECT * FROM import_mutations WHERE batch_id=? ORDER BY mutation_order DESC', [batchId]);
      for (const mutation of mutations) {
        if (!TABLES.has(mutation.target_table)) throw new Error('CONFLICT: Mutation contains an unsafe target table.'); const primaryKey = typeof mutation.primary_key_json === 'string' ? JSON.parse(mutation.primary_key_json) : mutation.primary_key_json; const entries = Object.entries(primaryKey);
        const where = entries.map(([key]) => { if (!/^[a-z_]+$/.test(key)) throw new Error('CONFLICT: Mutation contains an unsafe key.'); return `\`${key}\`=?`; }).join(' AND '); const values = entries.map(([, value]) => value);
        const current = await one(connection, `SELECT * FROM \`${mutation.target_table}\` WHERE ${where}`, values); if (!current) throw new Error(`CONFLICT: Imported ${mutation.target_table} row is missing.`); if (sha256(stableJson(current)) !== mutation.committed_row_sha256) throw new Error(`CONFLICT: Imported ${mutation.target_table} row changed after commit; use domain recovery instead.`);
        await connection.execute(`DELETE FROM \`${mutation.target_table}\` WHERE ${where}`, values);
      }
      await connection.execute('UPDATE import_crosswalks SET rolled_back_at=? WHERE batch_id=? AND rolled_back_at IS NULL', [new Date(), batchId]);
      await connection.execute("UPDATE import_rows SET outcome='rolled_back' WHERE batch_id=? AND outcome='committed'", [batchId]);
      await connection.execute("UPDATE import_batches SET state='rolled_back',rolled_back_by_user_id=?,rollback_reason=?,rolled_back_at=?,version=version+1 WHERE id=?", [actorUserId, reason.trim(), new Date(), batchId]);
      await appendAudit(connection, actorUserId, 'import.batch.rolled_back', batch, reason.trim(), { state: 'committed' }, { state: 'rolled_back', removedMutationCount: mutations.length });
      await connection.commit(); return { batchId, state: 'rolled_back', removedMutationCount: mutations.length };
    } catch (error) { await connection.rollback(); throw error; }
  } finally { await connection.query("SELECT RELEASE_LOCK('office_management_import_commit')"); }
}

export async function importStatus(connection, batchId, actorUserId) {
  const actor = await actorContext(connection, actorUserId);
  if (!actor.roles.includes('super_admin')) throw new Error('PROTECTED_SCOPE_DENIED: Import status requires Super Administrator.');
  const batch = await one(connection, `SELECT id,release_id,dataset_type,mapping_version,source_system,source_file_name,source_cutoff_date,source_row_count,source_sha256,sensitivity,state,schema_version,target_snapshot_sha256,dry_run_evidence_sha256,reconciliation_json,received_count,accepted_count,unchanged_count,rejected_count,committed_count,created_at,validated_at,committed_at,rolled_back_at,rollback_reason FROM import_batches WHERE id=?`, [batchId]);
  if (!batch) throw new Error('NOT_FOUND: Import batch was not found.'); const approvals = await rows(connection, 'SELECT approval_scope,actor_user_id,reason,approved_at FROM import_approvals WHERE batch_id=? AND revoked_at IS NULL ORDER BY approval_scope', [batchId]); return { ...batch, approvals };
}

export async function importRejections(connection, batchId, actorUserId) {
  const actor = await actorContext(connection, actorUserId);
  if (!actor.roles.includes('super_admin')) throw new Error('PROTECTED_SCOPE_DENIED: Import rejection evidence requires Super Administrator.');
  return rows(connection, `SELECT source_row_number,source_key_hash,error_code,error_field,safe_message,corrective_guidance FROM import_rows WHERE batch_id=? AND outcome='rejected' ORDER BY source_row_number`, [batchId]);
}
