import request from 'supertest';

jest.mock('@/lib/income', () => ({
  expectedIncomeForMonth: jest.fn(),
  setExpectedIncome: jest.fn(),
}));
jest.mock('@/db/client', () => ({ pool: { query: jest.fn() } }));

import { createApp } from '@/app';
import { expectedIncomeForMonth, setExpectedIncome } from '@/lib/income';

const mockExpected = expectedIncomeForMonth as jest.MockedFunction<typeof expectedIncomeForMonth>;
const mockSet = setExpectedIncome as jest.MockedFunction<typeof setExpectedIncome>;

const USER = '00000000-0000-0000-0000-000000000001';
const PAYLOAD = { expected_pence: 320000, source: 'suggested' as const, suggested_pence: 320000, actual_pence: 120000 };
const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockExpected.mockResolvedValue(PAYLOAD);
  mockSet.mockResolvedValue();
});

describe('GET /income/:userId', () => {
  it('returns expected/suggested/actual income', async () => {
    const res = await request(app).get(`/income/${USER}?year=2026&month=6`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(PAYLOAD);
  });

  it('returns 400 for an out-of-range month', async () => {
    const res = await request(app).get(`/income/${USER}?year=2026&month=13`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /income/:userId', () => {
  it('stores the override and returns the refreshed payload', async () => {
    const res = await request(app)
      .put(`/income/${USER}`)
      .send({ year: 2026, month: 6, expected_pence: 500000 });
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(USER, 2026, 6, 500000);
  });

  it('accepts null to clear the override', async () => {
    const res = await request(app)
      .put(`/income/${USER}`)
      .send({ year: 2026, month: 6, expected_pence: null });
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(USER, 2026, 6, null);
  });

  it('rejects a negative expected_pence', async () => {
    const res = await request(app)
      .put(`/income/${USER}`)
      .send({ year: 2026, month: 6, expected_pence: -1 });
    expect(res.status).toBe(400);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range month', async () => {
    const res = await request(app)
      .put(`/income/${USER}`)
      .send({ year: 2026, month: 0, expected_pence: 1000 });
    expect(res.status).toBe(400);
  });
});
