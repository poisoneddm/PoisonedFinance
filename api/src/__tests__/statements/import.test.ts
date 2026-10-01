import type { ParsedStatement } from '@/statements/common';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const mockEncrypt = jest.fn((s: string) => `enc:${s}`);
jest.mock('@/lib/crypto', () => ({ encrypt: mockEncrypt }));

const mockRunPipeline = jest.fn();
jest.mock('@/categorisation/pipeline', () => ({ runPipeline: mockRunPipeline }));

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

// Import the unit under test AFTER mocks are declared (avoid mock-factory TDZ).
import { importStatement } from '@/statements/import';

const USER_ID = '00000000-0000-0000-0000-000000000001';

const STATEMENT: ParsedStatement = {
  account: { externalId: '600000-12345678', name: 'Account ending 5678' },
  transactions: [
    { date: '2026-03-12', description: 'TESCO STORES 3471', amount_pence: -4567 },
    { date: '2026-03-25', description: 'SALARY BACS PAYMENT', amount_pence: 150000 },
  ],
};

// Existing connection + linked account, then one INSERT result per transaction.
function mockExisting(...insertResults: Array<{ id: string } | null>) {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-1' }] });
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-1' }] });
  for (const r of insertResults) mockQuery.mockResolvedValueOnce({ rows: r ? [r] : [] });
}

function insertedExternalIds(): string[] {
  return mockQuery.mock.calls
    .filter(([sql]) => String(sql).includes('INSERT INTO transactions'))
    .map(([, params]) => params[2]);
}

beforeEach(() => {
  mockQuery.mockReset();
  mockRunPipeline.mockReset();
  mockEncrypt.mockClear();
});

describe('importStatement', () => {
  it('returns 0 without touching the database for an empty statement', async () => {
    expect(await importStatement(USER_ID, { account: null, transactions: [] })).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('find-or-creates the statement bank_connection', async () => {
    mockExisting({ id: 'txn-1' }, null);
    await importStatement(USER_ID, STATEMENT);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('bank_connections');
    expect(sql).toContain("provider = 'statement'");
    expect(params).toContain(USER_ID);
  });

  it('creates the connection with encrypted empty tokens when none exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-new' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-new' }] });
    mockQuery.mockResolvedValue({ rows: [] });

    await importStatement(USER_ID, STATEMENT);

    expect(mockEncrypt).toHaveBeenCalledWith('');
    const [laSql, laParams] = mockQuery.mock.calls[3];
    expect(laSql).toContain('INSERT INTO linked_accounts');
    expect(laParams).toEqual([USER_ID, 'conn-new', 'statement:600000-12345678', 'Account ending 5678']);
  });

  it('looks up the linked account by the statement account number', async () => {
    mockExisting(null, null);
    await importStatement(USER_ID, STATEMENT);

    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toContain('linked_accounts');
    expect(params).toEqual([USER_ID, 'statement:600000-12345678']);
  });

  it('uses a fallback linked account when the statement has no account number', async () => {
    mockExisting(null, null);
    await importStatement(USER_ID, { ...STATEMENT, account: null });

    expect(mockQuery.mock.calls[1][1]).toEqual([USER_ID, 'statement:unknown']);
  });

  it('inserts each txn with needs_review=TRUE, both dates set to parsed date, merchant_name null', async () => {
    mockExisting({ id: 'txn-1' }, { id: 'txn-2' });
    await importStatement(USER_ID, STATEMENT);

    const [sql, params] = mockQuery.mock.calls[2];
    expect(sql).toContain('needs_review');
    expect(params).toEqual(['la-1', USER_ID, expect.stringMatching(/^[0-9a-f]{64}$/), null, 'TESCO STORES 3471', -4567, '2026-03-12', '2026-03-12']);
  });

  it('dedupes on date + amount so the same payment matches across PDF, CSV and OFX descriptions', async () => {
    mockExisting(null);
    await importStatement(USER_ID, { account: null, transactions: [{ date: '2026-09-14', description: 'B & Q 1152', amount_pence: -2797 }] });
    mockExisting(null);
    await importStatement(USER_ID, { account: null, transactions: [{ date: '2026-09-14', description: 'B AND Q 1152', amount_pence: -2797 }] });

    const [first, second] = insertedExternalIds();
    expect(first).toBe(second);
  });

  it('keeps repeated same-day, same-amount payments as separate transactions', async () => {
    const txn = { date: '2026-09-29', description: 'GREATER ANGLIA', amount_pence: -4940 };
    mockExisting({ id: 'txn-1' }, { id: 'txn-2' });
    await importStatement(USER_ID, { account: null, transactions: [txn, { ...txn }] });

    const [first, second] = insertedExternalIds();
    expect(first).not.toBe(second);
  });

  it('calls runPipeline with only the ids of newly inserted rows', async () => {
    mockExisting({ id: 'txn-1' }, null);
    const result = await importStatement(USER_ID, STATEMENT);

    expect(mockRunPipeline).toHaveBeenCalledWith(USER_ID, ['txn-1']);
    expect(result).toBe(1);
  });

  it('skips runPipeline when no new rows were inserted', async () => {
    mockExisting(null, null);
    const result = await importStatement(USER_ID, STATEMENT);

    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });
});
