import type { ParsedTxn } from '@/pdf/parse';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const mockEncrypt = jest.fn((s: string) => `enc:${s}`);
jest.mock('@/lib/crypto', () => ({ encrypt: mockEncrypt }));

const mockRunPipeline = jest.fn();
jest.mock('@/categorisation/pipeline', () => ({ runPipeline: mockRunPipeline }));

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

// Import the unit under test AFTER mocks are declared (avoid mock-factory TDZ).
import { importStatement } from '@/pdf/import';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const LABEL = 'NatWest PDF';

const PARSED: ParsedTxn[] = [
  { date: '2026-03-12', description: 'TESCO STORES 3471', amount_pence: -4567 },
  { date: '2026-03-25', description: 'SALARY BACS PAYMENT', amount_pence: 150000 },
];

beforeEach(() => {
  mockQuery.mockReset();
  mockRunPipeline.mockReset();
  mockEncrypt.mockClear();
});

describe('importStatement', () => {
  it('find-or-creates the pdf bank_connection with provider=pdf', async () => {
    // find-or-create connection — returns existing row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    // find-or-create linked_account — returns existing row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    // INSERT txn 1 — new row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    // INSERT txn 2 — duplicate (DO NOTHING returns no row)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // runPipeline — no DB call (mocked)

    await importStatement(USER_ID, LABEL, PARSED);

    // First query must select (or upsert) bank_connections with provider='pdf'.
    // 'pdf' is a literal in the SQL WHERE clause; userId is the bound param.
    const connCall = mockQuery.mock.calls[0];
    expect(connCall[0]).toContain('bank_connections');
    expect(connCall[0]).toContain('pdf');
    expect(connCall[1]).toContain(USER_ID);
  });

  it('find-or-creates a linked_account with connection_id from the pdf connection', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await importStatement(USER_ID, LABEL, PARSED);

    const laCall = mockQuery.mock.calls[1];
    expect(laCall[0]).toContain('linked_accounts');
    expect(laCall[1]).toContain('conn-pdf-1');
  });

  it('inserts each txn with needs_review=TRUE, both dates set to parsed date, merchant_name null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-2' }] });

    await importStatement(USER_ID, LABEL, PARSED);

    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('needs_review');
    expect(insertCall[0]).toContain('transaction_date');
    expect(insertCall[0]).toContain('posted_date');
    // Both date params should equal the parsed date
    expect(insertCall[1]).toContain('2026-03-12');
    // merchant_name should be null
    expect(insertCall[1]).toContain(null);
  });

  it('uses a sha256 external_id for deduplication', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await importStatement(USER_ID, LABEL, PARSED);

    const insertCall = mockQuery.mock.calls[2];
    // external_id should be a hex string (SHA-256 = 64 hex chars)
    const externalId = insertCall[1].find(
      (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v),
    );
    expect(externalId).toBeDefined();
  });

  it('calls runPipeline with only the ids of newly inserted rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    // txn-1 is new
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    // txn-2 is a duplicate (ON CONFLICT DO NOTHING returns no rows)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await importStatement(USER_ID, LABEL, PARSED);

    expect(mockRunPipeline).toHaveBeenCalledWith(USER_ID, ['txn-uuid-1']);
    expect(result).toBe(1);
  });

  it('skips runPipeline when no new rows were inserted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    // both duplicates
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await importStatement(USER_ID, LABEL, PARSED);

    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });
});
