import { describe, expect, it } from 'vitest';

import {
  DEPARTMENT_NAME_MAX,
  describeDepartmentConflict,
  duplicateDepartmentFailure,
  normalizeDepartmentText,
  validateAppointmentShape,
  validateDepartmentShape,
  validateStatusReason,
} from './department-hierarchy';

/**
 * The hierarchy rules both implementations share.
 *
 * The mock service and the MySQL application service import this module, so
 * these cases are what guarantees a user gets the same refusal and the same
 * correction from the demo dataset and from the database.
 */

const shape = (overrides: Partial<Parameters<typeof validateDepartmentShape>[0]> = {}) =>
  validateDepartmentShape({ name: 'Technical', code: 'TECH', description: '', ...overrides });

describe('department shape', () => {
  it('accepts a usable name and code', () => {
    expect(shape()).toEqual([]);
  });

  it('reports each field once, in field order, with a correction', () => {
    const failures = shape({ name: '', code: 'a b', description: 'x'.repeat(241) });
    expect(failures.map((failure) => failure.field)).toEqual(['name', 'code', 'description']);
    for (const failure of failures) expect(failure.guidance.length).toBeGreaterThan(0);
  });

  it('states an over-long name rather than truncating it', () => {
    const failures = shape({ name: 'N'.repeat(DEPARTMENT_NAME_MAX + 1) });
    expect(failures[0]?.message).toContain(`longer than ${DEPARTMENT_NAME_MAX}`);
  });

  it('normalizes the way the stored generated column does', () => {
    expect(normalizeDepartmentText('  Technical ')).toBe('technical');
  });
});

describe('conflict wording', () => {
  it('names the division a duplicate was checked against', () => {
    expect(describeDepartmentConflict('duplicate_name', 'WesternCF').message).toContain('WesternCF');
    expect(duplicateDepartmentFailure('code', 'WesternCF')).toMatchObject({ field: 'code' });
  });

  it('tells an administrator to deactivate a referenced department', () => {
    const view = describeDepartmentConflict('referenced', 'Technical');
    expect(view.message).toContain('Technical');
    expect(view.guidance).toContain('Deactivate it instead');
  });

  it('explains why an overlapping appointment is refused rather than resolved', () => {
    expect(describeDepartmentConflict('lead_period_overlap', 'Technical').guidance).toContain(
      'never rewritten',
    );
  });
});

describe('appointment shape', () => {
  const base = { reason: '', today: '2026-09-02', todayLabel: '2 Sep 2026' };

  it('accepts today and a later date', () => {
    expect(validateAppointmentShape({ ...base, effectiveFrom: '2026-09-02' })).toEqual([]);
    expect(validateAppointmentShape({ ...base, effectiveFrom: '2026-12-01' })).toEqual([]);
  });

  it('refuses a past date and an unusable one, both with guidance', () => {
    const past = validateAppointmentShape({ ...base, effectiveFrom: '2026-09-01' });
    expect(past[0]).toMatchObject({ field: 'effectiveFrom' });
    expect(past[0]?.guidance).toContain('2 Sep 2026');
    expect(validateAppointmentShape({ ...base, effectiveFrom: 'soon' })[0]?.field).toBe('effectiveFrom');
  });

  it('refuses an over-long reason', () => {
    expect(
      validateAppointmentShape({ ...base, effectiveFrom: '2026-09-02', reason: 'r'.repeat(201) })[0],
    ).toMatchObject({ field: 'reason' });
  });
});

describe('status reason', () => {
  it('requires a reason to deactivate and none to reactivate', () => {
    expect(validateStatusReason({ isActive: false, reason: '   ' })).toMatchObject({ field: 'reason' });
    expect(validateStatusReason({ isActive: false, reason: 'Folded in.' })).toBeNull();
    expect(validateStatusReason({ isActive: true, reason: '' })).toBeNull();
  });
});
