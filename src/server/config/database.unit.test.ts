import { describe, expect, it } from 'vitest';

import { parseDatabaseEnvironment } from './database';

describe('BE-0101 database configuration', () => {
  it('accepts a bounded MySQL pool configuration', () => {
    expect(parseDatabaseEnvironment({
      DATABASE_URL: 'mysql://office_app:secret@127.0.0.1:3306/office_management',
      DATABASE_POOL_LIMIT: '12',
    })).toEqual({
      DATABASE_URL: 'mysql://office_app:secret@127.0.0.1:3306/office_management',
      DATABASE_POOL_LIMIT: 12,
    });
  });

  it('rejects a non-MySQL URL and an unbounded pool', () => {
    expect(() => parseDatabaseEnvironment({
      DATABASE_URL: 'postgres://localhost/database',
      DATABASE_POOL_LIMIT: '1000',
    })).toThrow();
  });
});
