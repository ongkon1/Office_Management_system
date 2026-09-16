import { describe, expect, expectTypeOf, it } from 'vitest';
import type { MeetingMinuteListView } from '@/contracts/meeting-minutes';
import type { Failure } from '@/contracts/results';
import { frameOf, resolveMinuteListState, type MinuteListViewState } from './list-view-state';

function listView(totalItems: number): MeetingMinuteListView {
  return {
    page: {
      items: [],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / 25)),
        hasPreviousPage: false,
        hasNextPage: false,
      },
    },
    appliedFilters: {},
    clientOptions: [{ id: 'cli-meghna', name: 'Meghna Group' }],
    projectOptions: [],
    canCreate: true,
  };
}

const NONE = { failure: null, settled: null, previous: null, filtersActive: false };

const denied: Failure = { status: 'permission_denied', code: 'FORBIDDEN', message: 'No access' };
const signedOut: Failure = {
  status: 'unauthenticated',
  code: 'UNAUTHENTICATED',
  message: 'Sign in',
  reason: 'session_expired',
};
const temporary: Failure = {
  status: 'error',
  code: 'DEPENDENCY_FAILED',
  message: 'Down',
  reference: 'MM-1',
  retryable: true,
};
const fatal: Failure = { status: 'error', code: 'INTERNAL_ERROR', message: 'Broken', retryable: false };
const invalid: Failure = {
  status: 'validation_failure',
  code: 'VALIDATION_FAILED',
  message: 'Bad page',
  fieldErrors: [],
};

describe('Meeting Minutes list state (FE-1112)', () => {
  it('is loading before the first answer, and refreshing after one', () => {
    expect(resolveMinuteListState(NONE)).toEqual({ kind: 'loading' });
    const previous = listView(3);
    expect(resolveMinuteListState({ ...NONE, previous })).toEqual({ kind: 'refreshing', frame: previous });
  });

  it('tells populated, empty and no-results apart', () => {
    expect(resolveMinuteListState({ ...NONE, settled: listView(2) }).kind).toBe('populated');
    expect(resolveMinuteListState({ ...NONE, settled: listView(0) }).kind).toBe('empty');
    expect(resolveMinuteListState({ ...NONE, settled: listView(0), filtersActive: true }).kind).toBe('no-results');
  });

  it('lets a failure win over any earlier answer', () => {
    const previous = listView(4);
    expect(resolveMinuteListState({ ...NONE, failure: denied, previous }).kind).toBe('denied');
    expect(resolveMinuteListState({ ...NONE, failure: signedOut, previous }).kind).toBe('signed-out');
  });

  it('keeps the viewer’s own last answer for a recoverable error, with its reference', () => {
    const previous = listView(4);
    expect(resolveMinuteListState({ ...NONE, failure: temporary, previous })).toEqual({
      kind: 'error',
      retryable: true,
      reference: 'MM-1',
      frame: previous,
    });
    expect(resolveMinuteListState({ ...NONE, failure: fatal })).toEqual({
      kind: 'error',
      retryable: false,
      reference: null,
      frame: null,
    });
  });

  it('treats rejected list settings as invalid, which a reset recovers', () => {
    expect(resolveMinuteListState({ ...NONE, failure: invalid })).toEqual({ kind: 'invalid', frame: null });
  });

  it('gives denied and signed-out no list data at all', () => {
    const previous = listView(9);
    for (const failure of [denied, signedOut]) {
      const state = resolveMinuteListState({ ...NONE, failure, previous });
      expect(frameOf(state)).toBeNull();
      expect(JSON.stringify(state)).not.toMatch(/Meghna|totalItems|9/);
    }
    type Denied = Extract<MinuteListViewState, { kind: 'denied' }>;
    type SignedOut = Extract<MinuteListViewState, { kind: 'signed-out' }>;
    expectTypeOf<Denied>().toEqualTypeOf<{ readonly kind: 'denied' }>();
    expectTypeOf<SignedOut>().toEqualTypeOf<{ readonly kind: 'signed-out' }>();
  });
});
