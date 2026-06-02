import request from 'supertest';
import { createApp } from '@/app';

jest.mock('@/lib/goals', () => ({ getOrCreateGoal: jest.fn() }));
jest.mock('@/lib/money', () => ({
  incomeForMonth: jest.fn(),
  bucketSpendForMonth: jest.fn(),
}));
jest.mock('@/db/client', () => ({ pool: { query: jest.fn() } }));

import { getOrCreateGoal } from '@/lib/goals';
import { incomeForMonth, bucketSpendForMonth } from '@/lib/money';
import { pool } from '@/db/client';

const mockGetOrCreateGoal = getOrCreateGoal as jest.MockedFunction<typeof getOrCreateGoal>;
const mockIncomeForMonth = incomeForMonth as jest.MockedFunction<typeof incomeForMonth>;
const mockBucketSpend = bucketSpendForMonth as jest.MockedFunction<typeof bucketSpendForMonth>;
// pg's query is heavily overloaded; cast to a plain jest.Mock so
// mockResolvedValueOnce accepts arbitrary row shapes (avoids 'never' param).
const mockQuery = pool.query as unknown as jest.Mock;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';
const goal = {
  id: 'g1',
  user_id: SEED_USER_ID,
  year: 2026,
  month: 6,
  needs_pct: 40,
  wants_pct: 20,
  savings_pct: 40,
};

// Pre-sorted descending — mirrors what the SQL `ORDER BY total_pence DESC`
// returns (the route passes the DB rows through without re-sorting).
const categoryBreakdownRows = [
  { name: 'Savings',    meta_bucket: 'savings',color_hex: '#4ade80', total_pence: 100000 },
  { name: 'Groceries',  meta_bucket: 'needs',  color_hex: '#60a5fa', total_pence: 55000 },
  { name: 'Eating Out', meta_bucket: 'wants',  color_hex: '#f472b6', total_pence: 40000 },
  { name: 'Transport',  meta_bucket: 'needs',  color_hex: '#bfdbfe', total_pence: 25000 },
];

const app = createApp();

beforeEach(() => {
  jest.resetAllMocks();
  mockGetOrCreateGoal.mockResolvedValue(goal);
  mockIncomeForMonth.mockResolvedValue(250000);
  mockBucketSpend
    .mockResolvedValueOnce(80000)
    .mockResolvedValueOnce(40000)
    .mockResolvedValueOnce(100000);
  mockQuery.mockResolvedValueOnce({ rows: categoryBreakdownRows } as any);
});

describe('GET /spending/:userId', () => {
  it('returns 200 with goal_bars array of length 3', async () => {
    const res = await request(app)
      .get(`/spending/${SEED_USER_ID}?year=2026&month=6`);
    expect(res.status).toBe(200);
    expect(res.body.goal_bars).toHaveLength(3);
  });

  it('each goal bar has bucket, spent_pence, goal_pence, status', async () => {
    const res = await request(app)
      .get(`/spending/${SEED_USER_ID}?year=2026&month=6`);
    for (const bar of res.body.goal_bars) {
      expect(bar).toHaveProperty('bucket');
      expect(bar).toHaveProperty('spent_pence');
      expect(bar).toHaveProperty('goal_pence');
      expect(bar).toHaveProperty('status');
    }
  });

  it('returns category_breakdown array ordered by total_pence descending', async () => {
    const res = await request(app)
      .get(`/spending/${SEED_USER_ID}?year=2026&month=6`);
    expect(Array.isArray(res.body.category_breakdown)).toBe(true);
    const totals: number[] = res.body.category_breakdown.map((c: any) => c.total_pence);
    for (let i = 0; i < totals.length - 1; i++) {
      expect(totals[i]).toBeGreaterThanOrEqual(totals[i + 1]);
    }
  });

  it('each category breakdown item has name, meta_bucket, color_hex, total_pence', async () => {
    const res = await request(app)
      .get(`/spending/${SEED_USER_ID}?year=2026&month=6`);
    for (const item of res.body.category_breakdown) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('meta_bucket');
      expect(item).toHaveProperty('color_hex');
      expect(item).toHaveProperty('total_pence');
    }
  });

  it('goal_bar spent_pence matches bucketSpendForMonth values', async () => {
    const res = await request(app)
      .get(`/spending/${SEED_USER_ID}?year=2026&month=6`);
    const needsBar = res.body.goal_bars.find((b: any) => b.bucket === 'needs');
    expect(needsBar.spent_pence).toBe(80000);
  });
});
