import type {
  DepartmentConflictView,
  DepartmentValidationView,
} from '@/contracts/organization-hierarchy';

/**
 * Department hierarchy rules shared by every implementation.
 *
 * The mock service and the MySQL application service both answer the same
 * questions — is this name usable, may an appointment start on this date, what
 * does a referenced department mean — and a user is entitled to the same answer
 * from both. Two copies of this wording is how a refusal and the guidance for
 * fixing it drift apart, and how a screen built against the mock starts showing
 * a different message once the backend is connected.
 *
 * What is *not* here: anything that needs data. Uniqueness inside a division,
 * eligibility of a lead, and overlap of appointment periods all require rows,
 * so each implementation does its own lookup and then uses the wording below.
 */

export const DEPARTMENT_NAME_MAX = 60;
export const DEPARTMENT_CODE_PATTERN = /^[A-Za-z0-9-]{2,12}$/;
export const DEPARTMENT_DESCRIPTION_MAX = 240;
export const DEPARTMENT_REASON_MAX = 200;

/** Lower-cased and trimmed, matching the generated column in migration 0013. */
export function normalizeDepartmentText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The conflicts the hierarchy can raise, written once.
 *
 * `subject` is the division for a duplicate (because uniqueness is scoped to a
 * division and a message that does not say so reads as company-wide) and the
 * department for the others.
 */
export function describeDepartmentConflict(
  code: DepartmentConflictView['code'],
  subject: string,
): DepartmentConflictView {
  switch (code) {
    case 'duplicate_name':
      return {
        code,
        message: `${subject} already has a department with this name.`,
        guidance: 'Use a name that is unique inside this division.',
      };
    case 'duplicate_code':
      return {
        code,
        message: `${subject} already has a department with this code.`,
        guidance: 'Use a code that is unique inside this division.',
      };
    case 'lead_period_overlap':
      return {
        code,
        message: `${subject} already has an appointment starting on or after that date.`,
        guidance:
          'Choose a later effective date, or leave the existing appointment in place. Leadership history is never rewritten.',
      };
    case 'referenced':
      return {
        code,
        message: `${subject} is referenced by employee placements or leadership history.`,
        guidance:
          'Deactivate it instead. Deactivating blocks new placements while keeping historical records readable.',
      };
  }
}

/** The duplicate a lookup found, as a field failure on the field that clashed. */
export function duplicateDepartmentFailure(
  field: 'name' | 'code',
  divisionName: string,
): DepartmentValidationView {
  const view = describeDepartmentConflict(
    field === 'name' ? 'duplicate_name' : 'duplicate_code',
    divisionName,
  );
  return { field, message: view.message, guidance: view.guidance };
}

export interface DepartmentShapeInput {
  readonly name: string;
  readonly code: string;
  readonly description: string;
}

/**
 * Field checks that need no data, in field order so a form's summary reads
 * top-down. Length limits are stated in words rather than enforced with
 * `maxLength`, because a cap silently truncates pasted text and makes the
 * over-length refusal unreachable.
 */
export function validateDepartmentShape(
  input: DepartmentShapeInput,
): readonly DepartmentValidationView[] {
  const failures: DepartmentValidationView[] = [];
  const name = input.name.trim();
  const code = input.code.trim();

  if (name.length === 0) {
    failures.push({
      field: 'name',
      message: 'Enter a department name.',
      guidance: 'Use the name employees in this division recognize, such as Technical.',
    });
  } else if (name.length > DEPARTMENT_NAME_MAX) {
    failures.push({
      field: 'name',
      message: `The name is longer than ${DEPARTMENT_NAME_MAX} characters.`,
      guidance: `Shorten it to ${DEPARTMENT_NAME_MAX} characters or fewer.`,
    });
  }

  if (code.length === 0) {
    failures.push({
      field: 'code',
      message: 'Enter a department code.',
      guidance: 'Use a short code such as TECH: 2 to 12 letters, numbers or hyphens.',
    });
  } else if (!DEPARTMENT_CODE_PATTERN.test(code)) {
    failures.push({
      field: 'code',
      message: 'The code may use 2 to 12 letters, numbers or hyphens.',
      guidance: 'Remove spaces and punctuation, for example PROMPT or CLIENT-SVC.',
    });
  }

  if (input.description.trim().length > DEPARTMENT_DESCRIPTION_MAX) {
    failures.push({
      field: 'description',
      message: `The description is longer than ${DEPARTMENT_DESCRIPTION_MAX} characters.`,
      guidance: `Shorten it to ${DEPARTMENT_DESCRIPTION_MAX} characters or fewer.`,
    });
  }

  return failures;
}

export interface AppointmentShapeInput {
  readonly effectiveFrom: string;
  readonly reason: string;
  /** The business date the appointment is judged against. */
  readonly today: string;
  /** How the date is rendered in guidance, so both sides say the same thing. */
  readonly todayLabel: string;
}

/**
 * The appointment rules that need no data.
 *
 * An appointment may start today — in force now — or later — scheduled — and
 * never in the past, because past leadership is what a historical
 * authorization decision is reproduced from.
 */
export function validateAppointmentShape(
  input: AppointmentShapeInput,
): readonly DepartmentValidationView[] {
  const failures: DepartmentValidationView[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    failures.push({
      field: 'effectiveFrom',
      message: 'Choose the date the appointment takes effect.',
      guidance: `Use today, ${input.todayLabel}, for an appointment in force now, or a later date to schedule it.`,
    });
  } else if (input.effectiveFrom < input.today) {
    failures.push({
      field: 'effectiveFrom',
      message: 'An appointment cannot start in the past.',
      guidance: `Choose ${input.todayLabel} or later. Past leadership is never rewritten.`,
    });
  }

  if (input.reason.trim().length > DEPARTMENT_REASON_MAX) {
    failures.push({
      field: 'reason',
      message: `The reason is longer than ${DEPARTMENT_REASON_MAX} characters.`,
      guidance: `Shorten it to ${DEPARTMENT_REASON_MAX} characters or fewer.`,
    });
  }

  return failures;
}

export function ineligibleLeadFailure(): DepartmentValidationView {
  return {
    field: 'leadEmployeeId',
    message: 'The employee is not assigned to this division.',
    guidance:
      'Choose an active employee with an effective assignment in the department division.',
  };
}

export function alreadyLeadsFailure(leadName: string, fromLabel: string, departmentName: string): DepartmentValidationView {
  return {
    field: 'leadEmployeeId',
    message: `${leadName} already leads ${departmentName} from ${fromLabel}.`,
    guidance: 'Choose a different employee to change who leads this department.',
  };
}

export function inactiveDepartmentFailure(departmentName: string): DepartmentValidationView {
  return {
    field: 'departmentId',
    message: `${departmentName} is inactive, so it cannot be given a lead.`,
    guidance: 'Reactivate the department first, then appoint its lead.',
  };
}

/** Deactivation is explainable or it does not happen. */
export function validateStatusReason(input: {
  readonly isActive: boolean;
  readonly reason: string;
}): DepartmentValidationView | null {
  const reason = input.reason.trim();
  if (!input.isActive && reason.length === 0) {
    return {
      field: 'reason',
      message: 'Say why the department is being deactivated.',
      guidance: 'A short reason is kept with the department so the change stays explainable.',
    };
  }
  if (reason.length > DEPARTMENT_REASON_MAX) {
    return {
      field: 'reason',
      message: `The reason is longer than ${DEPARTMENT_REASON_MAX} characters.`,
      guidance: `Shorten it to ${DEPARTMENT_REASON_MAX} characters or fewer.`,
    };
  }
  return null;
}

/** The warning a deactivation carries when people are still placed there. */
export function membersRemainWarning(departmentName: string, remaining: number): string {
  return `${remaining} employee${remaining === 1 ? '' : 's'} keep their placement in ${departmentName}. No new placement can be made into it while it is inactive.`;
}

export function scheduledAppointmentWarning(
  leadName: string,
  fromLabel: string,
  currentLeadName: string | null,
): string {
  return `${leadName} takes over on ${fromLabel}. Until then ${currentLeadName ?? 'nobody'} remains the effective lead.`;
}
