import type { TrueLayerAccount, TrueLayerTransaction } from '@/truelayer/types';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const mockFetch = jest.fn();
jest.mock('@/truelayer/client', () => ({ fetchTrueLayer: mockFetch }));

// Import the unit under test AFTER mocks are declared so the @/db/client mock
// factory doesn't read mockQuery before it is initialised (temporal dead zone).
import { syncAccounts, syncTransactions } from '@/truelayer/sync';

const ACCOUNT: TrueLayerAccount = {
  account_id: 'acc-001',
  account_type: 'TRANSACTION',
  display_name: 'NatWest Current',
  currency: 'GBP',
  provider: { display_name: 'NatWest', provider_id: 'uk-ob-natwest' },
};

const TRANSACTION: TrueLayerTransaction = {
  transaction_id: 'txn-001',
  timestamp: '2026-05-31T10:00:00Z',
  transaction_type: 'DEBIT',
  description: 'TESCO STORES',
  merchant_name: 'Tesco Superstore',
  amount: -67.42,
  currency: 'GBP',
};

beforeEach(() => { mockQuery.mockReset(); mockFetch.mockReset(); });

describe('syncAccounts', () => {
  it('upserts each account with connection_id', async () => {
    mockFetch.mockResolvedValueOnce({ results: [ACCOUNT], status: 'Succeeded' });
    mockQuery.mockResolvedValue({ rows: [] });

    await syncAccounts('user-1', 'conn-id-1', 'access-token');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      expect.arrayContaining(['acc-001', 'NatWest Current', 'conn-id-1']),
    );
  });
});

describe('syncTransactions', () => {
  it('upserts transactions with amount converted to pence', async () => {
    mockFetch.mockResolvedValueOnce({ results: [TRANSACTION], status: 'Succeeded' });
    mockQuery.mockResolvedValue({ rows: [] });

    await syncTransactions('user-1', 'linked-acc-id-1', 'acc-001', 'access-token');

    const upsertCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('ON CONFLICT'),
    );
    expect(upsertCall).toBeDefined();
    // amount_pence should be -6742 (£-67.42 × 100, rounded)
    expect(upsertCall![1]).toContain(-6742);
  });

  it('uses transaction_date from meta.transaction_time when available', async () => {
    const txnWithMeta: TrueLayerTransaction = {
      ...TRANSACTION,
      meta: { transaction_time: '2026-05-30T08:00:00Z' },
    };
    mockFetch.mockResolvedValueOnce({ results: [txnWithMeta], status: 'Succeeded' });
    mockQuery.mockResolvedValue({ rows: [] });

    await syncTransactions('user-1', 'linked-acc-id-1', 'acc-001', 'access-token');

    const upsertCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('ON CONFLICT'),
    )!;
    // transaction_date should be 2026-05-30 (from meta), posted_date 2026-05-31 (from timestamp)
    expect(upsertCall[1]).toContain('2026-05-30');
    expect(upsertCall[1]).toContain('2026-05-31');
  });

  it('fetches 180 days of transactions', async () => {
    mockFetch.mockResolvedValueOnce({ results: [], status: 'Succeeded' });
    mockQuery.mockResolvedValue({ rows: [] });

    await syncTransactions('user-1', 'linked-acc-id-1', 'acc-001', 'access-token');

    const [url] = mockFetch.mock.calls[0] as [string, string];
    const fromDate = new Date(url.match(/from=(\d{4}-\d{2}-\d{2})/)![1]);
    const daysDiff = Math.round((Date.now() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
    expect(daysDiff).toBeCloseTo(180, -1); // within a day
  });
});
