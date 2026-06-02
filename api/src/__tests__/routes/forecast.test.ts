import request from 'supertest';
import { createApp } from '@/app';

// Mock the three forecast modules so the route test is isolated from DB
jest.mock('@/forecast/forecast', () => ({
  computeForecast: jest.fn(),
}));
jest.mock('@/forecast/insights', () => ({
  spendingTrends: jest.fn(),
}));
// Pool must be mocked so app.ts import of db/client doesn't open a real connection
jest.mock('@/db/client', () => ({ pool: { query: jest.fn() } }));

import { computeForecast } from '@/forecast/forecast';
import { spendingTrends } from '@/forecast/insights';

const mockedComputeForecast = computeForecast as jest.MockedFunction<typeof computeForecast>;
const mockedSpendingTrends  = spendingTrends  as jest.MockedFunction<typeof spendingTrends>;

const USER = '00000000-0000-0000-0000-000000000001';

const MOCK_TIERS = [
  { name: 'Goal',      monthly_pence: 120000, annual_pence: 1440000, badge: 'on-track' },
  { name: 'Realistic', monthly_pence: 140000, annual_pence: 1680000, badge: 'on-track' },
  { name: 'Stretch',   monthly_pence: 158000, annual_pence: 1896000, badge: 'stretch'  },
  { name: 'Actual',    monthly_pence: 90000,  annual_pence: 1080000, badge: 'behind'   },
];

const MOCK_TRENDS = [
  { kind: 'consistent', text: 'Your Groceries spend has been consistent at £500/month.', category: 'Groceries' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockedComputeForecast.mockResolvedValue(MOCK_TIERS as any);
  mockedSpendingTrends.mockResolvedValue(MOCK_TRENDS as any);
});

const app = createApp();

describe('GET /forecast/:userId', () => {
  it('returns 200 with tiers and trends for valid request', async () => {
    const res = await request(app)
      .get(`/forecast/${USER}`)
      .query({ year: '2026', month: '6' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tiers: MOCK_TIERS, trends: MOCK_TRENDS });
  });

  it('calls computeForecast with parsed year and month integers', async () => {
    await request(app)
      .get(`/forecast/${USER}`)
      .query({ year: '2026', month: '6' });

    expect(mockedComputeForecast).toHaveBeenCalledWith(
      expect.anything(), // pool
      USER,
      2026,
      6,
    );
  });

  it('calls spendingTrends with the userId', async () => {
    await request(app)
      .get(`/forecast/${USER}`)
      .query({ year: '2026', month: '6' });

    expect(mockedSpendingTrends).toHaveBeenCalledWith(expect.anything(), USER);
  });

  it('returns 400 when year is missing', async () => {
    const res = await request(app)
      .get(`/forecast/${USER}`)
      .query({ month: '6' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when month is missing', async () => {
    const res = await request(app)
      .get(`/forecast/${USER}`)
      .query({ year: '2026' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when year is not a valid integer', async () => {
    const res = await request(app)
      .get(`/forecast/${USER}`)
      .query({ year: 'abc', month: '6' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 when computeForecast throws', async () => {
    mockedComputeForecast.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get(`/forecast/${USER}`)
      .query({ year: '2026', month: '6' });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
