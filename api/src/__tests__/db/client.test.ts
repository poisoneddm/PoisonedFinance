jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({})),
}));

describe('db client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://test:test@localhost/testdb' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a Pool with DATABASE_URL and max:10', () => {
    // Require pg INSIDE the test so it resolves to the same mock instance
    // client.ts uses after jest.resetModules() — a top-level import would
    // bind to a stale instance and never see the call.
    const { Pool } = require('pg');
    require('@/db/client');
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://test:test@localhost/testdb',
      max: 10,
    });
  });
});
