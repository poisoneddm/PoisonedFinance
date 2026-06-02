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

  it('queries using the normalised merchant name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await applyRules('user-1', [TXN('  amazon mktplace  ')]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['user-1', 'AMAZON MKTPLACE']),
    );
  });
});
