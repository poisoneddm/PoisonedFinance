import request from 'supertest';
import { createApp } from '@/app';

jest.mock('@/lib/goals', () => ({
  getOrCreateGoal: jest.fn(),
}));
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

const app = createApp();

beforeEach(() => {
  jest.resetAllMocks();
  mockGetOrCreateGoal.mockResolvedValue(goal);
  mockIncomeForMonth.mockResolvedValue(250000);
  // needs=80000 (32%), wants=40000 (16%), savings=100000 (40%)
  mockBucketSpend
    .mockResolvedValueOnce(80000)   // needs
    .mockResolvedValueOnce(40000)   // wants
    .mockResolvedValueOnce(100000); // savings
  // review_count
  mockQuery.mockResolvedValueOnce({ rows: [{ review_count: '3' }] } as any);
  // recent transactions (5)
  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        id: 'tx1',
        merchant_name: 'Tesco',
        description: 'TESCO STORES',
        amount_pence: -3450,
        transaction_date: '2026-06-10',
        category_name: 'Groceries',
        meta_bucket: 'needs',
        color_hex: '#60a5fa',
      },
    ],
  } as any);
});

describe('GET /dashboard/:userId', () => {
  it('returns 200 with income_pence, pills array, review_count, recent', async () => {
    const res = await request(app)
      .get(`/dashboard/${SEED_USER_ID}?year=2026&month=6`);
    expect(res.status).toBe(200);
    expect(res.body.income_pence).toBe(250000);
    expect(res.body.pills).toHaveLength(3);
    expect(res.body.review_count).toBe(3);
    expect(Array.isArray(res.body.recent)).toBe(true);
  });

  it('pill for needs has correct structure with goal_pence, spent_pence, status', async () => {
    const res = await request(app)
      .get(`/dashboard/${SEED_USER_ID}?year=2026&month=6`);
    const needsPill = res.body.pills.find((p: any) => p.bucket === 'needs');
    expect(needsPill).toBeDefined();
    expect(needsPill.spent_pence).toBe(80000);
    expect(needsPill.goal_pence).toBe(100000); // ROUND(250000 * 40 / 100)
    expect(needsPill.status).toBe('amber'); // 80000/100000 = 0.8 → ≥ 0.5 and < 1.0 → amber
  });

  it('pill status is computed by pillStatus helper', async () => {
    const res = await request(app)
      .get(`/dashboard/${SEED_USER_ID}?year=2026&month=6`);
    const wantsPill = res.body.pills.find((p: any) => p.bucket === 'wants');
    // wants: spent=40000, goal=ROUND(250000*20/100)=50000, ratio=0.8 → amber
    expect(wantsPill.status).toBe('amber');
  });

  it('savings pill shows green when spent equals goal (ratio=1.0, ≥0.9)', async () => {
    const res = await request(app)
      .get(`/dashboard/${SEED_USER_ID}?year=2026&month=6`);
    const savingsPill = res.body.pills.find((p: any) => p.bucket === 'savings');
    // savings: spent=100000, goal=ROUND(250000*40/100)=100000, ratio=1.0 → green
    expect(savingsPill.status).toBe('green');
  });

  it('recent transactions are capped at 5', async () => {
    const res = await request(app)
      .get(`/dashboard/${SEED_USER_ID}?year=2026&month=6`);
    expect(res.body.recent.length).toBeLessThanOrEqual(5);
  });

  it('defaults year and month to current date when query params absent', async () => {
    const res = await request(app).get(`/dashboard/${SEED_USER_ID}`);
    expect(res.status).toBe(200);
  });
});
