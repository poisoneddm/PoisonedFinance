import request from 'supertest';
import { createApp } from '@/app';

jest.mock('@/lib/goals', () => ({ getOrCreateGoal: jest.fn() }));
jest.mock('@/db/client', () => ({ pool: { query: jest.fn() } }));

import { getOrCreateGoal } from '@/lib/goals';
import { pool } from '@/db/client';

const mockGetOrCreateGoal = getOrCreateGoal as jest.MockedFunction<typeof getOrCreateGoal>;
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
});

describe('GET /goals/:userId', () => {
  it('returns 200 with goal object including all pct fields', async () => {
    const res = await request(app)
      .get(`/goals/${SEED_USER_ID}?year=2026&month=6`);
    expect(res.status).toBe(200);
    expect(res.body.needs_pct).toBe(40);
    expect(res.body.wants_pct).toBe(20);
    expect(res.body.savings_pct).toBe(40);
  });

  it('calls getOrCreateGoal with userId, year, month', async () => {
    await request(app).get(`/goals/${SEED_USER_ID}?year=2026&month=6`);
    expect(mockGetOrCreateGoal).toHaveBeenCalledWith(SEED_USER_ID, 2026, 6);
  });
});

describe('PUT /goals/:userId', () => {
  it('returns 200 and updated goal when pcts sum to 100', async () => {
    const updated = { ...goal, needs_pct: 50, wants_pct: 10, savings_pct: 40 };
    mockQuery.mockResolvedValueOnce({ rows: [updated] } as any);
    const res = await request(app)
      .put(`/goals/${SEED_USER_ID}`)
      .send({ year: 2026, month: 6, needs_pct: 50, wants_pct: 10, savings_pct: 40 });
    expect(res.status).toBe(200);
    expect(res.body.needs_pct).toBe(50);
  });

  it('returns 400 when needs_pct+wants_pct+savings_pct !== 100', async () => {
    const res = await request(app)
      .put(`/goals/${SEED_USER_ID}`)
      .send({ year: 2026, month: 6, needs_pct: 50, wants_pct: 30, savings_pct: 30 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must sum to 100/i);
  });

  it('returns 400 when needs_pct+wants_pct+savings_pct sums to 99', async () => {
    const res = await request(app)
      .put(`/goals/${SEED_USER_ID}`)
      .send({ year: 2026, month: 6, needs_pct: 39, wants_pct: 20, savings_pct: 40 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when needs_pct+wants_pct+savings_pct sums to 101', async () => {
    const res = await request(app)
      .put(`/goals/${SEED_USER_ID}`)
      .send({ year: 2026, month: 6, needs_pct: 41, wants_pct: 20, savings_pct: 40 });
    expect(res.status).toBe(400);
  });

  it('upserts the goal row in monthly_goals', async () => {
    const updated = { ...goal, needs_pct: 50, wants_pct: 10, savings_pct: 40 };
    mockQuery.mockResolvedValueOnce({ rows: [updated] } as any);
    await request(app)
      .put(`/goals/${SEED_USER_ID}`)
      .send({ year: 2026, month: 6, needs_pct: 50, wants_pct: 10, savings_pct: 40 });
    const sql: string = (mockQuery.mock.calls[0] as [string, ...unknown[]])[0];
    expect(sql).toContain('INSERT INTO monthly_goals');
    expect(sql).toContain('ON CONFLICT');
  });
});
