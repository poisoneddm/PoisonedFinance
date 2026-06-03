import type { TxnForCategorisation } from '@/categorisation/types';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

import { applyRules, normaliseMerchant } from '@/categorisation/rules';

const TXN = (merchant: string | null, description = 'desc'): TxnForCategorisation => ({
  id: 'txn-1',
  merchant_name: merchant,
  description,
});

describe('normaliseMerchant', () => {
  it('uppercases and trims', () => {
    expect(normaliseMerchant('  tesco stores  ')).toBe('TESCO STORES');
  });

  it('falls back to description when merchant is null', () => {
    expect(normaliseMerchant(null, 'DIRECT DEBIT BT')).toBe('DIRECT DEBIT BT');
  });
});

describe('applyRules', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns result with category_name when rule matches', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ merchant_pattern: 'TESCO STORES', category_name: 'Groceries' }],
    });

    const results = await applyRules('user-1', [TXN('Tesco Stores')]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: 'txn-1', category_name: 'Groceries', source: 'rule' });
  });

  it('returns empty array when no rules match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const results = await applyRules('user-1', [TXN('Unknown Merchant')]);
    expect(results).toHaveLength(0);
  });

  it('queries using the normalised merchant name (as an array of patterns)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await applyRules('user-1', [TXN('  amazon mktplace  ')]);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('user-1');
    expect(params[1]).toEqual(['AMAZON MKTPLACE']);
  });

  it('matches multiple transactions in a SINGLE query (no N+1)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { merchant_pattern: 'TESCO', category_name: 'Groceries' },
        { merchant_pattern: 'AMAZON', category_name: 'Shopping' },
      ],
    });
    const results = await applyRules('user-1', [
      { id: 'a', merchant_name: 'Tesco', description: 'x' },
      { id: 'b', merchant_name: 'Amazon', description: 'y' },
      { id: 'c', merchant_name: 'Unknown', description: 'z' },
    ]);
    expect(mockQuery).toHaveBeenCalledTimes(1); // one query for all txns
    expect(results).toEqual([
      { id: 'a', category_name: 'Groceries', source: 'rule' },
      { id: 'b', category_name: 'Shopping', source: 'rule' },
    ]);
  });

  it('returns empty array (and issues no query) for an empty transaction list', async () => {
    const results = await applyRules('user-1', []);
    expect(results).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
