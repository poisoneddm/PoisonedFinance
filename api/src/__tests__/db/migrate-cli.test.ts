// migrate-cli.test.ts
// Tests the release-command entrypoint for Fly.io (contracts §11).
// Mocks runMigrations and process.exit to assert correct behaviour
// without actually connecting to a database or exiting the test process.

const mockRunMigrations = jest.fn();
jest.mock('@/db/migrate', () => ({ runMigrations: mockRunMigrations }));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((_code?: string | number | null | undefined) => {
  // Prevent actual process exit during tests
  return undefined as never;
});

// Suppress console output during tests for clean output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

// migrate-cli.ts kicks off runMigrations().then(...).catch(...) at import time.
// The rejection path settles one microtask deeper than the success path, so a
// single `await require()` isn't enough — drain all microtasks via a macrotask.
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('migrate-cli', () => {
  beforeEach(() => {
    jest.resetModules();
    mockRunMigrations.mockReset();
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  afterAll(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('calls runMigrations() exactly once', async () => {
    mockRunMigrations.mockResolvedValueOnce(undefined);

    await require('@/db/migrate-cli');
    await flush();

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
  });

  it('exits with code 0 when runMigrations resolves', async () => {
    mockRunMigrations.mockResolvedValueOnce(undefined);

    await require('@/db/migrate-cli');
    await flush();

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits with code 1 when runMigrations rejects', async () => {
    mockRunMigrations.mockRejectedValueOnce(new Error('migration failed: syntax error'));

    await require('@/db/migrate-cli');
    await flush();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('logs the error to console.error when runMigrations rejects', async () => {
    const err = new Error('migration failed: syntax error');
    mockRunMigrations.mockRejectedValueOnce(err);

    await require('@/db/migrate-cli');
    await flush();

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('[migrate-cli]'),
      err,
    );
  });
});
