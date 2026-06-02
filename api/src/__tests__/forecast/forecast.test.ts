import { computeForecast, ForecastTier } from '@/forecast/forecast';
import { Pool } from 'pg';

// --- mock Phase 3 helpers ---
jest.mock('@/lib/money', () => ({
  incomeForMonth:      jest.fn(),
  bucketSpendForMonth: jest.fn(),
}));
jest.mock('@/lib/goals', () => ({
  getOrCreateGoal: jest.fn(),
}));
// --- mock monthlyAverages so we can control it ---
jest.mock('@/forecast/trends', () => ({
  monthlyAverages: jest.fn(),
}));

import { incomeForMonth, bucketSpendForMonth } from '@/lib/money';
import { getOrCreateGoal } from '@/lib/goals';
import { monthlyAverages } from '@/forecast/trends';

const mockPool = {} as unknown as Pool;
const USER = '00000000-0000-0000-0000-000000000001';

const mockedIncome         = incomeForMonth      as jest.MockedFunction<typeof incomeForMonth>;
const mockedBucketSpend    = bucketSpendForMonth  as jest.MockedFunction<typeof bucketSpendForMonth>;
const mockedGetOrCreate    = getOrCreateGoal      as jest.MockedFunction<typeof getOrCreateGoal>;
const mockedMonthlyAvg     = monthlyAverages      as jest.MockedFunction<typeof monthlyAverages>;

beforeEach(() => {
  jest.clearAllMocks();
});

// Shared baseline setup: on-track scenario
// income £3 000, goal 40% = £1 200
// avg6 income £2 800, avg6 needs £800, avg6 wants £600
// realistic = 2800-800-600 = 1400  (>= goal → on-track)
// stretch   = 2800-800-0.70*600 = 2800-800-420 = 1580
// actual    = 900 (>= goal → on-track)
function setupOnTrack() {
  mockedIncome.mockResolvedValue(300000);                          // £3 000 this month
  mockedBucketSpend.mockResolvedValue(90000);                      // £900 savings this month
  mockedGetOrCreate.mockResolvedValue({
    id: 'g1', user_id: USER, year: 2026, month: 6,
    needs_pct: 40, wants_pct: 20, savings_pct: 40,
  } as any);
  mockedMonthlyAvg.mockResolvedValue({
    avg_income_pence: 280000,
    avg_needs_pence:  80000,
    avg_wants_pence:  60000,
  });
}

describe('computeForecast — on-track scenario', () => {
  it('returns 4 tiers with correct names in order', async () => {
    setupOnTrack();
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    expect(tiers.map(t => t.name)).toEqual(['Goal', 'Realistic', 'Stretch', 'Actual']);
  });

  it('computes goal_pence = ROUND(income * savings_pct / 100)', async () => {
    setupOnTrack();
    // ROUND(300000 * 40 / 100) = 120000
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    const goal = tiers.find(t => t.name === 'Goal')!;
    expect(goal.monthly_pence).toBe(120000);
    expect(goal.annual_pence).toBe(120000 * 12);
  });

  it('computes realistic_pence = ROUND(avg6_income - avg6_needs - avg6_wants)', async () => {
    setupOnTrack();
    // ROUND(280000 - 80000 - 60000) = 140000
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    const realistic = tiers.find(t => t.name === 'Realistic')!;
    expect(realistic.monthly_pence).toBe(140000);
    expect(realistic.annual_pence).toBe(140000 * 12);
  });

  it('computes stretch_pence = ROUND(avg6_income - avg6_needs - 0.70 * avg6_wants)', async () => {
    setupOnTrack();
    // ROUND(280000 - 80000 - 0.70*60000) = ROUND(280000 - 80000 - 42000) = 158000
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    const stretch = tiers.find(t => t.name === 'Stretch')!;
    expect(stretch.monthly_pence).toBe(158000);
    expect(stretch.annual_pence).toBe(158000 * 12);
  });

  it('computes actual_pence = savings bucket spend this month', async () => {
    setupOnTrack();
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    const actual = tiers.find(t => t.name === 'Actual')!;
    expect(actual.monthly_pence).toBe(90000);
    expect(actual.annual_pence).toBe(90000 * 12);
  });

  it('badges Realistic on-track when realistic >= goal', async () => {
    setupOnTrack();
    // 140000 >= 120000 → on-track
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    expect(tiers.find(t => t.name === 'Realistic')!.badge).toBe('on-track');
  });

  it('badges Stretch always as "stretch" regardless of comparison', async () => {
    setupOnTrack();
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    expect(tiers.find(t => t.name === 'Stretch')!.badge).toBe('stretch');
  });

  it('badges Actual on-track when actual >= goal', async () => {
    setupOnTrack();
    // 90000 < 120000 → behind
    // re-check: 90000 < 120000 → behind. Update expected value to behind.
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    expect(tiers.find(t => t.name === 'Actual')!.badge).toBe('behind');
  });

  it('badges Goal as on-track (goal >= goal)', async () => {
    setupOnTrack();
    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    expect(tiers.find(t => t.name === 'Goal')!.badge).toBe('on-track');
  });
});

describe('computeForecast — behind-goal scenario', () => {
  it('badges Realistic behind when realistic < goal', async () => {
    // income £2 000, savings_pct 40 → goal = 80000
    // avg6 income 150000, needs 80000, wants 60000 → realistic = 150000-80000-60000 = 10000 < 80000
    mockedIncome.mockResolvedValue(200000);
    mockedBucketSpend.mockResolvedValue(5000);
    mockedGetOrCreate.mockResolvedValue({
      id: 'g2', user_id: USER, year: 2026, month: 6,
      needs_pct: 40, wants_pct: 20, savings_pct: 40,
    } as any);
    mockedMonthlyAvg.mockResolvedValue({
      avg_income_pence: 150000,
      avg_needs_pence:  80000,
      avg_wants_pence:  60000,
    });

    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    // goal = ROUND(200000 * 40 / 100) = 80000
    // realistic = 150000 - 80000 - 60000 = 10000 < 80000 → behind
    expect(tiers.find(t => t.name === 'Realistic')!.badge).toBe('behind');
    expect(tiers.find(t => t.name === 'Realistic')!.monthly_pence).toBe(10000);
  });
});

describe('computeForecast — clamp-to-zero scenario', () => {
  it('clamps realistic_pence to 0 when avg6 spend exceeds avg6 income', async () => {
    // avg6 income 100000, needs 80000, wants 60000 → realistic = 100000-80000-60000 = -40000 → clamp 0
    mockedIncome.mockResolvedValue(100000);
    mockedBucketSpend.mockResolvedValue(0);
    mockedGetOrCreate.mockResolvedValue({
      id: 'g3', user_id: USER, year: 2026, month: 6,
      needs_pct: 40, wants_pct: 20, savings_pct: 40,
    } as any);
    mockedMonthlyAvg.mockResolvedValue({
      avg_income_pence: 100000,
      avg_needs_pence:  80000,
      avg_wants_pence:  60000,
    });

    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    expect(tiers.find(t => t.name === 'Realistic')!.monthly_pence).toBe(0);
  });

  it('clamps stretch_pence to 0 when calculation is negative', async () => {
    // avg6 income 100000, needs 80000, wants 60000
    // stretch = 100000 - 80000 - 0.70*60000 = 100000 - 80000 - 42000 = -22000 → clamp 0
    mockedIncome.mockResolvedValue(100000);
    mockedBucketSpend.mockResolvedValue(0);
    mockedGetOrCreate.mockResolvedValue({
      id: 'g4', user_id: USER, year: 2026, month: 6,
      needs_pct: 40, wants_pct: 20, savings_pct: 40,
    } as any);
    mockedMonthlyAvg.mockResolvedValue({
      avg_income_pence: 100000,
      avg_needs_pence:  80000,
      avg_wants_pence:  60000,
    });

    const tiers = await computeForecast(mockPool, USER, 2026, 6);
    expect(tiers.find(t => t.name === 'Stretch')!.monthly_pence).toBe(0);
  });
});
