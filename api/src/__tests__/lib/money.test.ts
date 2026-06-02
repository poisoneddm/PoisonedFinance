import { MetaBucket } from '@/types/index';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

import { incomeForMonth, bucketSpendForMonth } from '@/lib/money';

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

beforeEach(() => mockQuery.mockReset());

describe('incomeForMonth', () => {
  it('returns the summed income pence from the query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ income_pence: 250000 }] });
    const result = await incomeForMonth(SEED_USER_ID, 2026, 6);
    expect(result).toBe(250000);
  });

  it('returns 0 when no income rows exist (NULL sum)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ income_pence: null }] });
    const result = await incomeForMonth(SEED_USER_ID, 2026, 6);
    expect(result).toBe(0);
  });

  it('queries WHERE amount_pence > 0 and correct year/month on transaction_date', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ income_pence: 0 }] });
    await incomeForMonth(SEED_USER_ID, 2026, 6);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('amount_pence > 0');
    expect(sql).toContain('transaction_date');
    expect(sql).not.toContain('posted_date');
    const params: unknown[] = mockQuery.mock.calls[0][1];
    expect(params).toContain(2026);
    expect(params).toContain(6);
  });

  it('excludes savings meta_bucket credits', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ income_pence: 0 }] });
    await incomeForMonth(SEED_USER_ID, 2026, 6);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain("meta_bucket <> 'savings'");
  });
});

describe('bucketSpendForMonth', () => {
  it('returns summed spend pence (absolute value of debits) for needs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spend_pence: 95000 }] });
    const result = await bucketSpendForMonth(SEED_USER_ID, 'needs', 2026, 6);
    expect(result).toBe(95000);
  });

  it('returns 0 when NULL (no spend in bucket)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spend_pence: null }] });
    const result = await bucketSpendForMonth(SEED_USER_ID, 'wants', 2026, 6);
    expect(result).toBe(0);
  });

  it('queries WHERE amount_pence < 0 and uses -amount_pence SUM', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spend_pence: 0 }] });
    await bucketSpendForMonth(SEED_USER_ID, 'needs', 2026, 6);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('amount_pence < 0');
    expect(sql).toMatch(/-t\.amount_pence/);
    expect(sql).toContain('transaction_date');
    expect(sql).not.toContain('posted_date');
  });

  it('filters by the correct meta_bucket', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ spend_pence: 0 }] });
    await bucketSpendForMonth(SEED_USER_ID, 'savings', 2026, 6);
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('meta_bucket');
    const params: unknown[] = mockQuery.mock.calls[0][1];
    expect(params).toContain('savings');
  });

  it('accepts all three MetaBucket values without error', async () => {
    const buckets: MetaBucket[] = ['needs', 'wants', 'savings'];
    for (const bucket of buckets) {
      mockQuery.mockResolvedValueOnce({ rows: [{ spend_pence: 0 }] });
      await expect(bucketSpendForMonth(SEED_USER_ID, bucket, 2026, 6)).resolves.toBe(0);
    }
  });
});
