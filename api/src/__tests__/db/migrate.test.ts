import path from 'path';

const mockQuery = jest.fn();
const mockRelease = jest.fn();
// Each migration runs on a single checked-out client (pool.connect()); the
// client delegates to the same mockQuery so existing call-based assertions hold.
const mockConnect = jest.fn(async () => ({ query: mockQuery, release: mockRelease }));
jest.mock('@/db/client', () => ({ pool: { query: mockQuery, connect: mockConnect } }));

// Provide two fake migration files
jest.mock('fs', () => ({
  readdirSync: jest.fn(() => ['002_second.sql', '001_first.sql']),
  readFileSync: jest.fn((p: string) => `-- content of ${path.basename(p)}`),
}));

import { runMigrations } from '@/db/migrate';

beforeEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  mockConnect.mockClear();
  // Default: _migrations table already exists, files not yet run
  mockQuery.mockResolvedValue({ rows: [] });
  // Clear fs mock call counts between tests (implementations are preserved)
  // so per-test assertions like "readFileSync not called" aren't polluted
  // by calls from earlier tests.
  const fs = require('fs');
  fs.readFileSync.mockClear();
  fs.readdirSync.mockClear();
});

it('creates _migrations tracking table', async () => {
  await runMigrations();
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS _migrations'),
  );
});

it('runs migrations in sorted (alphabetical) order', async () => {
  const executed: string[] = [];
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (Array.isArray(params) && typeof params[0] === 'string' && sql.includes('INSERT INTO _migrations')) {
      executed.push(params[0] as string);
    }
    return { rows: [] };
  });

  await runMigrations();

  expect(executed).toEqual(['001_first.sql', '002_second.sql']);
});

it('skips migrations already recorded in _migrations', async () => {
  mockQuery.mockImplementation(async (sql: string) => {
    // Return a row when checking if migration is already run
    if (sql.includes('SELECT 1 FROM _migrations')) return { rows: [{ exists: true }] };
    return { rows: [] };
  });

  await runMigrations();

  // readFileSync should never be called because both files are skipped
  const fs = require('fs');
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

it('issues BEGIN before running each migration', async () => {
  await runMigrations();
  const calls = (mockQuery.mock.calls as [string, ...unknown[]][]).map(c => c[0]);
  expect(calls).toContain('BEGIN');
});

it('runs each migration on a single checked-out client and releases it', async () => {
  await runMigrations();
  // Two migration files → one connect()/release() per file (atomic per file).
  expect(mockConnect).toHaveBeenCalledTimes(2);
  expect(mockRelease).toHaveBeenCalledTimes(2);
  const calls = (mockQuery.mock.calls as [string, ...unknown[]][]).map(c => c[0]);
  // BEGIN and COMMIT both issued (on the pinned client).
  expect(calls).toContain('BEGIN');
  expect(calls).toContain('COMMIT');
});

it('releases the client even when a migration fails', async () => {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('-- content of')) throw new Error('boom');
    return { rows: [] };
  });
  await expect(runMigrations()).rejects.toThrow('boom');
  expect(mockRelease).toHaveBeenCalled();
});

it('rolls back and rethrows when a migration SQL errors', async () => {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('-- content of')) throw new Error('syntax error');
    return { rows: [] };
  });

  await expect(runMigrations()).rejects.toThrow('syntax error');
  const calls = (mockQuery.mock.calls as [string, ...unknown[]][]).map(c => c[0]);
  expect(calls).toContain('ROLLBACK');
  // COMMIT must not have been issued
  expect(calls).not.toContain('COMMIT');
});
