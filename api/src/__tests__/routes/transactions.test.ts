import request from 'supertest';
import { createApp } from '@/app';

jest.mock('@/db/client', () => ({ pool: { query: jest.fn() } }));

import { pool } from '@/db/client';
// pg's query is heavily overloaded; cast to a plain jest.Mock so
// mockResolvedValueOnce accepts arbitrary row shapes (avoids 'never' param).
const mockQuery = pool.query as unknown as jest.Mock;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const txnRows = [
  {
    id: 'tx1',
    merchant_name: 'Tesco',
    description: 'TESCO STORES',
    amount_pence: -3450,
    transaction_date: '2026-06-10',
    category_name: 'Groceries',
    meta_bucket: 'needs',
    color_hex: '#60a5fa',
    account_name: 'Current Account',
  },
  {
    id: 'tx2',
    merchant_name: 'Netflix',
    description: 'NETFLIX.COM',
    amount_pence: -1599,
    transaction_date: '2026-06-05',
    category_name: 'Subscriptions',
    meta_bucket: 'wants',
    color_hex: '#fbcfe8',
    account_name: 'Current Account',
  },
];

const app = createApp();

beforeEach(() => {
  jest.resetAllMocks();
  mockQuery.mockResolvedValueOnce({ rows: txnRows } as any);
});

describe('GET /transactions/:userId', () => {
  it('returns 200 with array of transactions', async () => {
    const res = await request(app)
      .get(`/transactions/${SEED_USER_ID}?year=2026&month=6`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('each transaction has required money and metadata fields', async () => {
    const res = await request(app)
      .get(`/transactions/${SEED_USER_ID}?year=2026&month=6`);
    const tx = res.body[0];
    expect(tx).toHaveProperty('id');
    expect(tx).toHaveProperty('amount_pence');
    expect(tx).toHaveProperty('transaction_date');
    expect(tx).toHaveProperty('category_name');
    expect(tx).toHaveProperty('meta_bucket');
  });

  it('passes bucket filter as query param and is included in SQL call', async () => {
    await request(app)
      .get(`/transactions/${SEED_USER_ID}?year=2026&month=6&bucket=needs`);
    const sqlCalls = (mockQuery.mock.calls as [string, ...unknown[]][]);
    const sql = sqlCalls[0][0];
    expect(sql).toContain('meta_bucket');
  });

  it('passes q (search) filter as query param', async () => {
    await request(app)
      .get(`/transactions/${SEED_USER_ID}?year=2026&month=6&q=tesco`);
    const sqlCalls = (mockQuery.mock.calls as [string, ...unknown[]][]);
    const params: unknown[] = sqlCalls[0][1] as unknown[];
    // q filter should appear in params (ILIKE %tesco%)
    const hasSearch = params.some(
      p => typeof p === 'string' && p.toLowerCase().includes('tesco'),
    );
    expect(hasSearch).toBe(true);
  });

  it('passes account filter as query param', async () => {
    await request(app)
      .get(`/transactions/${SEED_USER_ID}?year=2026&month=6&account=acc-uuid-1`);
    const sqlCalls = (mockQuery.mock.calls as [string, ...unknown[]][]);
    const params: unknown[] = sqlCalls[0][1] as unknown[];
    expect(params).toContain('acc-uuid-1');
  });

  it('filters by transaction_date (not posted_date)', async () => {
    await request(app)
      .get(`/transactions/${SEED_USER_ID}?year=2026&month=6`);
    const sql: string = (mockQuery.mock.calls[0] as [string, ...unknown[]])[0];
    expect(sql).toContain('transaction_date');
    expect(sql).not.toContain('posted_date');
  });
});
