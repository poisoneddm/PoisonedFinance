const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn(async () => ({ query: mockQuery, release: mockRelease }));
jest.mock('@/db/client', () => ({ pool: { query: mockQuery, connect: mockConnect } }));

const mockRefresh = jest.fn();
jest.mock('@/truelayer/oauth', () => ({ refreshAccessToken: mockRefresh }));

jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn((s: string) => `enc:${s}`),
  decrypt: jest.fn((s: string) => s.replace('enc:', '')),
}));

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

// Import the unit under test AFTER mocks are declared so the @/db/client mock
// factory doesn't read mockQuery before it is initialised (temporal dead zone).
import { getValidAccessToken } from '@/truelayer/tokens';

/**
 * Build a mockQuery implementation that returns the given bank_connections row
 * for the SELECT and an empty result for BEGIN/UPDATE/COMMIT/ROLLBACK.
 */
function withConnectionRow(row: Record<string, unknown> | null) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/SELECT/i.test(sql) && /bank_connections/.test(sql)) {
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  mockConnect.mockClear();
  mockRefresh.mockReset();
});

it('returns decrypted access token when not near expiry (no refresh)', async () => {
  const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
  withConnectionRow({
    id: 'conn-1',
    access_token_enc: 'enc:valid-access-token',
    refresh_token_enc: 'enc:some-refresh',
    token_expires_at: futureExpiry,
  });

  const token = await getValidAccessToken('conn-1');

  expect(mockRefresh).not.toHaveBeenCalled();
  expect(token).toBe('valid-access-token');
  expect(mockRelease).toHaveBeenCalled();
});

it('locks the row with SELECT ... FOR UPDATE inside a transaction', async () => {
  const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
  withConnectionRow({
    id: 'conn-1',
    access_token_enc: 'enc:valid-access-token',
    refresh_token_enc: 'enc:some-refresh',
    token_expires_at: futureExpiry,
  });

  await getValidAccessToken('conn-1');

  const calls = mockQuery.mock.calls.map(c => String(c[0]));
  expect(calls).toContain('BEGIN');
  expect(calls.some(s => /SELECT[\s\S]*FOR UPDATE/i.test(s))).toBe(true);
  expect(calls).toContain('COMMIT');
});

it('refreshes and persists new tokens when within 60s of expiry', async () => {
  const nearExpiry = new Date(Date.now() + 30 * 1000).toISOString(); // 30s away
  withConnectionRow({
    id: 'conn-1',
    access_token_enc: 'enc:old-access',
    refresh_token_enc: 'enc:old-refresh',
    token_expires_at: nearExpiry,
  });

  mockRefresh.mockResolvedValueOnce({
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
    expires_in: 3600,
  });

  const token = await getValidAccessToken('conn-1');

  expect(mockRefresh).toHaveBeenCalledWith('old-refresh');
  expect(token).toBe('new-access-token');

  const updateCall = mockQuery.mock.calls.find(
    c => typeof c[0] === 'string' && c[0].includes('UPDATE bank_connections'),
  );
  expect(updateCall).toBeDefined();
  expect(updateCall![1]).toContain('enc:new-access-token');
  expect(updateCall![1]).toContain('enc:new-refresh-token');
  expect(mockRelease).toHaveBeenCalled();
});

it('throws (and rolls back + releases) when connection is not found', async () => {
  withConnectionRow(null);
  await expect(getValidAccessToken('missing-conn')).rejects.toThrow('Bank connection not found');
  const calls = mockQuery.mock.calls.map(c => String(c[0]));
  expect(calls).toContain('ROLLBACK');
  expect(mockRelease).toHaveBeenCalled();
});
