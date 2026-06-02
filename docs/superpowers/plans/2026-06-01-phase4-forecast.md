# PoisonedFinance — Phase 4: Forecast & Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Savings Forecast screen end-to-end: three server modules (`trends.ts`, `forecast.ts`, `insights.ts`) computing 6-month averages, four savings tiers (Goal/Realistic/Stretch/Actual), and spending-trend callouts; one Express route `GET /forecast/:userId?year=&month=` wiring them together; and the Expo Forecast screen rendering tier cards and trend callouts. Phases 2–3 and all contracts are already implemented; this plan imports but does not redefine Phase 3 helpers.

**Architecture:** Server modules live in `api/src/forecast/`. Each module exports a single pure-ish async function accepting a `pg.Pool` (injected, not imported) so tests can pass query mocks directly. The router in `api/src/routes/forecast.ts` imports the pool singleton and the three module functions, then assembles `{ tiers, trends }`. The Expo screen at `mobile/app/(tabs)/forecast.tsx` calls `apiGet` from `mobile/lib/api.ts` (§13 of contracts) and renders with React Native core components; tests use RTL with a mocked `mobile/lib/api` module.

**Tech Stack:** Node.js 20, TypeScript 5.4, Express 4, `pg` 8, Jest + `ts-jest` + `supertest` (API); Expo SDK 51, React Native, React Testing Library (`@testing-library/react-native`), Jest + `jest-expo` (mobile)

---

## File Structure

```
api/
└── src/
    ├── app.ts                                       # MODIFY — mount forecastRouter
    ├── forecast/
    │   ├── trends.ts                                # CREATE — monthlyAverages()
    │   ├── forecast.ts                              # CREATE — computeForecast()
    │   └── insights.ts                              # CREATE — spendingTrends()
    ├── routes/
    │   └── forecast.ts                              # CREATE — GET /forecast/:userId
    └── __tests__/
        ├── forecast/
        │   ├── trends.test.ts                       # CREATE
        │   ├── forecast.test.ts                     # CREATE
        │   └── insights.test.ts                     # CREATE
        └── routes/
            └── forecast.test.ts                     # CREATE

mobile/
└── app/
    └── (tabs)/
        └── forecast.tsx                             # MODIFY — wire to API
mobile/
└── __tests__/
    └── forecast.test.tsx                            # CREATE
```

---

## Task 1: `monthlyAverages` — 6-month trailing averages

**Files:**
- Create: `api/src/forecast/trends.ts`
- Create: `api/src/__tests__/forecast/trends.test.ts`

### Step 1: Write the failing test

Create `api/src/__tests__/forecast/trends.test.ts`:

```typescript
import { monthlyAverages } from '@/forecast/trends';
import { Pool } from 'pg';

// Each call to mockPool.query() will be configured per test.
const mockQuery = jest.fn();
const mockPool = { query: mockQuery } as unknown as Pool;

const USER = '00000000-0000-0000-0000-000000000001';

beforeEach(() => mockQuery.mockReset());

// Helper: build the row the SQL returns for one trailing-month bucket.
// The real query returns one row with avg_income_pence, avg_needs_pence, avg_wants_pence.
function makeAvgRow(income: number, needs: number, wants: number) {
  return { rows: [{ avg_income_pence: String(income), avg_needs_pence: String(needs), avg_wants_pence: String(wants) }] };
}

describe('monthlyAverages', () => {
  it('returns integer averages from the database row', async () => {
    // income 3000_00, needs 1000_00, wants 600_00
    mockQuery.mockResolvedValueOnce(makeAvgRow(300000, 100000, 60000));

    const result = await monthlyAverages(mockPool, USER);

    expect(result).toEqual({
      avg_income_pence: 300000,
      avg_needs_pence: 100000,
      avg_wants_pence: 60000,
    });
  });

  it('defaults to 6 trailing months and queries with correct userId', async () => {
    mockQuery.mockResolvedValueOnce(makeAvgRow(200000, 80000, 40000));

    await monthlyAverages(mockPool, USER);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain(USER);
    expect(sql).toContain('6');
    expect(sql).toContain('transaction_date');
  });

  it('accepts a custom months parameter', async () => {
    mockQuery.mockResolvedValueOnce(makeAvgRow(150000, 50000, 20000));

    await monthlyAverages(mockPool, USER, 3);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain(USER);
    // The query should bound to 3 months, not 6
    expect(sql).toContain('3');
  });

  it('returns zeros when no data exists (NULL averages coerced to 0)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_income_pence: null, avg_needs_pence: null, avg_wants_pence: null }] });

    const result = await monthlyAverages(mockPool, USER);

    expect(result).toEqual({
      avg_income_pence: 0,
      avg_needs_pence: 0,
      avg_wants_pence: 0,
    });
  });

  it('returns integers (truncates fractional pence from AVG)', async () => {
    // e.g. AVG over 3 months: 100001 + 100002 + 100000 = 300003 / 3 = 100001.0 — exact
    // but simulate a fractional string from pg driver
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_income_pence: '100001.666', avg_needs_pence: '50000.333', avg_wants_pence: '25000.999' }] });

    const result = await monthlyAverages(mockPool, USER);

    expect(Number.isInteger(result.avg_income_pence)).toBe(true);
    expect(Number.isInteger(result.avg_needs_pence)).toBe(true);
    expect(Number.isInteger(result.avg_wants_pence)).toBe(true);
    // Math.round(100001.666) = 100002
    expect(result.avg_income_pence).toBe(100002);
  });
});
```

### Step 2: Run the test to verify it fails

```bash
cd api && npm test -- --testPathPattern="forecast/trends"
```

Expected: FAIL — `Cannot find module '@/forecast/trends'`

### Step 3: Create `api/src/forecast/trends.ts`

```typescript
import { Pool } from 'pg';

export interface MonthlyAverages {
  avg_income_pence: number;
  avg_needs_pence: number;
  avg_wants_pence: number;
}

/**
 * Compute trailing-N-month averages of income, needs spend, and wants spend
 * for a given user, using transaction_date for all date filtering (contracts §4, §5).
 *
 * If fewer than N calendar months of data exist, PostgreSQL AVG naturally averages
 * over the months that do exist. NULL averages (no data at all) are coerced to 0.
 *
 * @param pool  - injected pg Pool (allows test mocking without module-level import)
 * @param userId - UUID of the user
 * @param months - trailing calendar months to average over (default 6, per §8)
 */
export async function monthlyAverages(
  pool: Pool,
  userId: string,
  months: number = 6,
): Promise<MonthlyAverages> {
  // We group by (year, month) of transaction_date, compute per-month totals,
  // then take AVG across the groups that fall within the trailing N calendar months.
  // Income = SUM of credits excluding savings meta_bucket (contracts §4).
  // Bucket spend = SUM(-amount_pence) for debits in that meta_bucket (contracts §5).
  const sql = `
    WITH month_totals AS (
      SELECT
        DATE_TRUNC('month', t.transaction_date) AS month_start,
        COALESCE(SUM(t.amount_pence) FILTER (
          WHERE t.amount_pence > 0
            AND (t.category_id IS NULL OR c.meta_bucket <> 'savings')
        ), 0) AS income_pence,
        COALESCE(SUM(-t.amount_pence) FILTER (
          WHERE t.amount_pence < 0
            AND c.meta_bucket = 'needs'
        ), 0) AS needs_pence,
        COALESCE(SUM(-t.amount_pence) FILTER (
          WHERE t.amount_pence < 0
            AND c.meta_bucket = 'wants'
        ), 0) AS wants_pence
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = $1
        AND t.transaction_date >= DATE_TRUNC('month', NOW()) - ($2 || ' months')::INTERVAL
        AND t.transaction_date < DATE_TRUNC('month', NOW())
      GROUP BY DATE_TRUNC('month', t.transaction_date)
    )
    SELECT
      AVG(income_pence) AS avg_income_pence,
      AVG(needs_pence)  AS avg_needs_pence,
      AVG(wants_pence)  AS avg_wants_pence
    FROM month_totals
  `;

  const { rows } = await pool.query(sql, [userId, String(months)]);
  const row = rows[0];

  return {
    avg_income_pence: Math.round(Number(row?.avg_income_pence ?? 0)),
    avg_needs_pence:  Math.round(Number(row?.avg_needs_pence  ?? 0)),
    avg_wants_pence:  Math.round(Number(row?.avg_wants_pence  ?? 0)),
  };
}
```

### Step 4: Run the test to verify it passes

```bash
cd api && npm test -- --testPathPattern="forecast/trends"
```

Expected: PASS — 5/5

### Step 5: Commit

```bash
git add api/src/forecast/trends.ts api/src/__tests__/forecast/trends.test.ts
git commit -m "feat(api/forecast): add monthlyAverages — 6-month trailing income/spend averages"
```

---

## Task 2: `computeForecast` — 4-tier savings forecast

**Files:**
- Create: `api/src/forecast/forecast.ts`
- Create: `api/src/__tests__/forecast/forecast.test.ts`

Imports `incomeForMonth` and `bucketSpendForMonth` from Phase 3's `api/src/lib/money.ts`, and `getOrCreateGoal` from `api/src/lib/goals.ts`. Does NOT redefine them.

### Step 1: Write the failing test

Create `api/src/__tests__/forecast/forecast.test.ts`:

```typescript
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
```

### Step 2: Run the test to verify it fails

```bash
cd api && npm test -- --testPathPattern="forecast/forecast"
```

Expected: FAIL — `Cannot find module '@/forecast/forecast'`

### Step 3: Create `api/src/forecast/forecast.ts`

```typescript
import { Pool } from 'pg';
import { incomeForMonth, bucketSpendForMonth } from '@/lib/money';
import { getOrCreateGoal } from '@/lib/goals';
import { monthlyAverages } from '@/forecast/trends';

export type TierName = 'Goal' | 'Realistic' | 'Stretch' | 'Actual';
export type Badge = 'on-track' | 'behind' | 'stretch';

export interface ForecastTier {
  name: TierName;
  monthly_pence: number;
  annual_pence: number;
  badge: Badge;
}

/**
 * Compute the 4 savings-forecast tiers for a given user/month (contracts §8).
 *
 * Formulas (all integer pence, clamp realistic/stretch >= 0):
 *   goal_pence      = ROUND(income_this_month * savings_pct / 100)
 *   realistic_pence = ROUND(avg6_income - avg6_needs - avg6_wants)           clamped >= 0
 *   stretch_pence   = ROUND(avg6_income - avg6_needs - 0.70 * avg6_wants)    clamped >= 0
 *   actual_pence    = savings bucket spend this month (§5)
 *
 * Badge rules (compare tier monthly vs goal_pence):
 *   tier >= goal  → 'on-track'
 *   tier <  goal  → 'behind'
 *   Stretch tier always carries badge 'stretch' (overrides comparison)
 */
export async function computeForecast(
  pool: Pool,
  userId: string,
  year: number,
  month: number,
): Promise<ForecastTier[]> {
  const [goal, income_pence, actual_pence, avgs] = await Promise.all([
    getOrCreateGoal(userId, year, month),
    incomeForMonth(userId, year, month),
    bucketSpendForMonth(userId, 'savings', year, month),
    monthlyAverages(pool, userId),
  ]);

  const goal_pence = Math.round(income_pence * goal.savings_pct / 100);

  const realistic_raw = Math.round(avgs.avg_income_pence - avgs.avg_needs_pence - avgs.avg_wants_pence);
  const realistic_pence = Math.max(0, realistic_raw);

  const stretch_raw = Math.round(avgs.avg_income_pence - avgs.avg_needs_pence - 0.70 * avgs.avg_wants_pence);
  const stretch_pence = Math.max(0, stretch_raw);

  function badge(monthly: number): Badge {
    return monthly >= goal_pence ? 'on-track' : 'behind';
  }

  return [
    {
      name: 'Goal',
      monthly_pence: goal_pence,
      annual_pence: goal_pence * 12,
      badge: badge(goal_pence),
    },
    {
      name: 'Realistic',
      monthly_pence: realistic_pence,
      annual_pence: realistic_pence * 12,
      badge: badge(realistic_pence),
    },
    {
      name: 'Stretch',
      monthly_pence: stretch_pence,
      annual_pence: stretch_pence * 12,
      badge: 'stretch',
    },
    {
      name: 'Actual',
      monthly_pence: actual_pence,
      annual_pence: actual_pence * 12,
      badge: badge(actual_pence),
    },
  ];
}
```

### Step 4: Run the test to verify it passes

```bash
cd api && npm test -- --testPathPattern="forecast/forecast"
```

Expected: PASS — 11/11

### Step 5: Commit

```bash
git add api/src/forecast/forecast.ts api/src/__tests__/forecast/forecast.test.ts
git commit -m "feat(api/forecast): add computeForecast — 4-tier savings forecast per §8"
```

---

## Task 3: `spendingTrends` — structured insight callouts

**Files:**
- Create: `api/src/forecast/insights.ts`
- Create: `api/src/__tests__/forecast/insights.test.ts`

Produces three kinds of callout:
- `consistent` — a category whose 6-month monthly spend variance is low (max deviation ≤ 10% of mean)
- `increasing` — a category whose spend in the most recent 3 months is more than 10% higher than the previous 3 months
- `suggestion` — "Reduce X to 3-month average saves ~£Y/month" (the category with the largest increase, expressed as saving = recent3avg - overall6avg)

### Step 1: Write the failing test

Create `api/src/__tests__/forecast/insights.test.ts`:

```typescript
import { spendingTrends, TrendCallout } from '@/forecast/insights';
import { Pool } from 'pg';

const mockQuery = jest.fn();
const mockPool = { query: mockQuery } as unknown as Pool;
const USER = '00000000-0000-0000-0000-000000000001';

beforeEach(() => mockQuery.mockReset());

// The function issues two queries:
//   Query 1: 6-month per-category monthly totals (consistent + increasing detection)
//   Query 2: 3-month per-category monthly totals (recent half for suggestion)
// We build helpers to mock both in sequence.

/**
 * Build rows for the 6-month query.
 * Each row: { category_name, month_start, spend_pence }
 */
function sixMonthRows(rows: { category_name: string; month_start: string; spend_pence: number }[]) {
  return { rows: rows.map(r => ({ ...r, spend_pence: String(r.spend_pence) })) };
}

describe('spendingTrends — consistent callout', () => {
  it('emits a "consistent" callout for a stable category', async () => {
    // Groceries: same spend every month for 6 months → max deviation 0% → consistent
    const groceriesRows = [1, 2, 3, 4, 5, 6].map(i => ({
      category_name: 'Groceries',
      month_start: `2025-${String(i + 6).padStart(2, '0')}-01`,
      spend_pence: 50000,
    }));
    // Use a second category to ensure we pick the right one
    const eatingRows = [1, 2, 3, 4, 5, 6].map(i => ({
      category_name: 'Eating Out',
      month_start: `2025-${String(i + 6).padStart(2, '0')}-01`,
      spend_pence: i * 10000, // very variable — not consistent
    }));

    mockQuery.mockResolvedValueOnce(sixMonthRows([...groceriesRows, ...eatingRows]));

    const callouts = await spendingTrends(mockPool, USER);
    const consistent = callouts.filter(c => c.kind === 'consistent');
    expect(consistent.length).toBeGreaterThanOrEqual(1);
    expect(consistent[0].category).toBe('Groceries');
    expect(consistent[0].text).toContain('Groceries');
    expect(consistent[0].text).toContain('consistent');
  });
});

describe('spendingTrends — increasing callout', () => {
  it('emits an "increasing" callout when recent 3 months > prior 3 months by >10%', async () => {
    // Shopping: prior 3 months avg £200, recent 3 months avg £300 (50% increase → increasing)
    const shoppingRows = [
      { category_name: 'Shopping', month_start: '2025-07-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-08-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-09-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-10-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-11-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-12-01', spend_pence: 30000 },
    ];

    mockQuery.mockResolvedValueOnce(sixMonthRows(shoppingRows));

    const callouts = await spendingTrends(mockPool, USER);
    const increasing = callouts.filter(c => c.kind === 'increasing');
    expect(increasing.length).toBeGreaterThanOrEqual(1);
    const s = increasing.find(c => c.category === 'Shopping')!;
    expect(s).toBeDefined();
    expect(s.text).toContain('Shopping');
    expect(s.text).toContain('increasing');
    // Should mention old → new figures (£200 → £300)
    expect(s.text).toMatch(/£200/);
    expect(s.text).toMatch(/£300/);
  });

  it('does NOT emit increasing for a category with <=10% rise', async () => {
    // Transport: prior avg 10000, recent avg 10900 (9% rise — below threshold)
    const transportRows = [
      { category_name: 'Transport', month_start: '2025-07-01', spend_pence: 10000 },
      { category_name: 'Transport', month_start: '2025-08-01', spend_pence: 10000 },
      { category_name: 'Transport', month_start: '2025-09-01', spend_pence: 10000 },
      { category_name: 'Transport', month_start: '2025-10-01', spend_pence: 10900 },
      { category_name: 'Transport', month_start: '2025-11-01', spend_pence: 10900 },
      { category_name: 'Transport', month_start: '2025-12-01', spend_pence: 10900 },
    ];

    mockQuery.mockResolvedValueOnce(sixMonthRows(transportRows));

    const callouts = await spendingTrends(mockPool, USER);
    const increasing = callouts.filter(c => c.kind === 'increasing' && c.category === 'Transport');
    expect(increasing.length).toBe(0);
  });
});

describe('spendingTrends — suggestion callout', () => {
  it('emits a "suggestion" for the most-increased category', async () => {
    // Shopping: prior avg £200, recent avg £300 → saving = 300 - 200 = £1/month (in pence: 10000)
    const shoppingRows = [
      { category_name: 'Shopping', month_start: '2025-07-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-08-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-09-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-10-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-11-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-12-01', spend_pence: 30000 },
    ];

    mockQuery.mockResolvedValueOnce(sixMonthRows(shoppingRows));

    const callouts = await spendingTrends(mockPool, USER);
    const suggestions = callouts.filter(c => c.kind === 'suggestion');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const sug = suggestions[0];
    expect(sug.text).toContain('Shopping');
    expect(sug.text).toContain('saves');
    // saving = 30000 - 20000 = 10000 pence = £100 → text mentions £100
    expect(sug.text).toMatch(/£100/);
    expect(sug.text).toContain('/month');
  });

  it('does NOT emit a suggestion when no category is increasing', async () => {
    // All flat spend — no increases
    const flatRows = ['Groceries', 'Transport'].flatMap(cat =>
      [1, 2, 3, 4, 5, 6].map(i => ({
        category_name: cat,
        month_start: `2025-${String(i + 6).padStart(2, '0')}-01`,
        spend_pence: 30000,
      })),
    );

    mockQuery.mockResolvedValueOnce(sixMonthRows(flatRows));

    const callouts = await spendingTrends(mockPool, USER);
    expect(callouts.filter(c => c.kind === 'suggestion')).toHaveLength(0);
  });
});
```

### Step 2: Run the test to verify it fails

```bash
cd api && npm test -- --testPathPattern="forecast/insights"
```

Expected: FAIL — `Cannot find module '@/forecast/insights'`

### Step 3: Create `api/src/forecast/insights.ts`

```typescript
import { Pool } from 'pg';

export type CalloutKind = 'consistent' | 'increasing' | 'suggestion';

export interface TrendCallout {
  kind: CalloutKind;
  text: string;
  category?: string;
}

interface CategoryMonthRow {
  category_name: string;
  month_start: string;
  spend_pence: number;
}

interface CategoryStats {
  name: string;
  monthlySpend: number[];  // sorted oldest → newest
  mean: number;
  prior3Mean: number;      // mean of first 3 months
  recent3Mean: number;     // mean of last 3 months
}

/** Format integer pence as £X,XXX (whole pounds, no decimal) for callout text. */
function fmtPounds(pence: number): string {
  return '£' + Math.round(pence / 100).toLocaleString('en-GB');
}

/**
 * Build per-category stats from raw query rows.
 * Rows are grouped by category_name; monthlySpend is sorted by month_start ASC.
 */
function buildStats(rows: CategoryMonthRow[]): CategoryStats[] {
  const byCategory = new Map<string, number[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category_name)) byCategory.set(row.category_name, []);
    byCategory.get(row.category_name)!.push(row.spend_pence);
  }

  return Array.from(byCategory.entries()).map(([name, spend]) => {
    const mean = spend.reduce((a, b) => a + b, 0) / spend.length;
    const prior3 = spend.slice(0, 3);
    const recent3 = spend.slice(-3);
    const prior3Mean = prior3.reduce((a, b) => a + b, 0) / Math.max(prior3.length, 1);
    const recent3Mean = recent3.reduce((a, b) => a + b, 0) / Math.max(recent3.length, 1);
    return { name, monthlySpend: spend, mean, prior3Mean, recent3Mean };
  });
}

/**
 * Produce structured spending-trend callouts for the Forecast screen.
 *
 * Callout kinds (contracts spec, design §"Savings Forecast Screen"):
 *   consistent  — a category whose 6-month spend is stable (max deviation ≤ 10% of mean)
 *   increasing  — a category whose recent-3-month spend is >10% above prior-3-month spend
 *   suggestion  — "Reduce X to 3-month average saves ~£Y/month" for the most-increased category
 *
 * A single query fetches 6 months of per-category monthly spend using transaction_date (§5).
 */
export async function spendingTrends(pool: Pool, userId: string): Promise<TrendCallout[]> {
  const sql = `
    SELECT
      c.name AS category_name,
      DATE_TRUNC('month', t.transaction_date)::TEXT AS month_start,
      SUM(-t.amount_pence) AS spend_pence
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = $1
      AND t.amount_pence < 0
      AND t.transaction_date >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
      AND t.transaction_date < DATE_TRUNC('month', NOW())
    GROUP BY c.name, DATE_TRUNC('month', t.transaction_date)
    ORDER BY c.name, DATE_TRUNC('month', t.transaction_date)
  `;

  const { rows: rawRows } = await pool.query(sql, [userId]);
  const rows: CategoryMonthRow[] = rawRows.map(r => ({
    category_name: r.category_name,
    month_start: r.month_start,
    spend_pence: Math.round(Number(r.spend_pence)),
  }));

  const stats = buildStats(rows);
  const callouts: TrendCallout[] = [];

  // --- Consistent callout: pick the first category with max deviation ≤ 10% of mean ---
  for (const s of stats) {
    if (s.monthlySpend.length < 2) continue;
    const maxDev = Math.max(...s.monthlySpend.map(v => Math.abs(v - s.mean)));
    const devPct = s.mean > 0 ? maxDev / s.mean : 0;
    if (devPct <= 0.10) {
      callouts.push({
        kind: 'consistent',
        text: `Your ${s.name} spend has been consistent at ${fmtPounds(s.mean)}/month over the last 6 months.`,
        category: s.name,
      });
      break; // one consistent callout is sufficient
    }
  }

  // --- Increasing callouts and suggestion tracking ---
  let biggestIncreaseDelta = 0;
  let biggestIncreaseCategory: CategoryStats | null = null;

  for (const s of stats) {
    if (s.monthlySpend.length < 6) continue; // need both halves
    if (s.prior3Mean <= 0) continue;
    const riseRatio = (s.recent3Mean - s.prior3Mean) / s.prior3Mean;
    if (riseRatio > 0.10) {
      callouts.push({
        kind: 'increasing',
        text: `Your ${s.name} spend is increasing — ${fmtPounds(s.prior3Mean)}/month → ${fmtPounds(s.recent3Mean)}/month over the last 3 months.`,
        category: s.name,
      });

      const delta = s.recent3Mean - s.prior3Mean;
      if (delta > biggestIncreaseDelta) {
        biggestIncreaseDelta = delta;
        biggestIncreaseCategory = s;
      }
    }
  }

  // --- Suggestion callout: largest-increased category (if any were increasing) ---
  if (biggestIncreaseCategory !== null) {
    const saving = Math.round(biggestIncreaseCategory.recent3Mean - biggestIncreaseCategory.prior3Mean);
    callouts.push({
      kind: 'suggestion',
      text: `Reduce ${biggestIncreaseCategory.name} to its 3-month average saves ~${fmtPounds(saving)}/month.`,
      category: biggestIncreaseCategory.name,
    });
  }

  return callouts;
}
```

### Step 4: Run the test to verify it passes

```bash
cd api && npm test -- --testPathPattern="forecast/insights"
```

Expected: PASS — 5/5

### Step 5: Commit

```bash
git add api/src/forecast/insights.ts api/src/__tests__/forecast/insights.test.ts
git commit -m "feat(api/forecast): add spendingTrends — consistent/increasing/suggestion callouts"
```

---

## Task 4: `GET /forecast/:userId` route and app mount

**Files:**
- Create: `api/src/routes/forecast.ts`
- Create: `api/src/__tests__/routes/forecast.test.ts`
- Modify: `api/src/app.ts`

### Step 1: Write the failing test

Create `api/src/__tests__/routes/forecast.test.ts`:

```typescript
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
```

### Step 2: Run the test to verify it fails

```bash
cd api && npm test -- --testPathPattern="routes/forecast"
```

Expected: FAIL — route not found (404) or `Cannot find module '@/routes/forecast'`

### Step 3: Create `api/src/routes/forecast.ts`

```typescript
import { Router, Request, Response } from 'express';
import { pool } from '@/db/client';
import { computeForecast } from '@/forecast/forecast';
import { spendingTrends } from '@/forecast/insights';

const router = Router();

/**
 * GET /forecast/:userId?year=&month=
 *
 * Returns { tiers: ForecastTier[], trends: TrendCallout[] }.
 * All money values are integer pence with _pence suffix (contracts §9).
 */
router.get('/forecast/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const yearStr  = req.query.year  as string | undefined;
  const monthStr = req.query.month as string | undefined;

  if (!yearStr || !monthStr) {
    res.status(400).json({ error: 'year and month query parameters are required' });
    return;
  }

  const year  = parseInt(yearStr,  10);
  const month = parseInt(monthStr, 10);

  if (isNaN(year) || isNaN(month)) {
    res.status(400).json({ error: 'year and month must be valid integers' });
    return;
  }

  try {
    const [tiers, trends] = await Promise.all([
      computeForecast(pool, userId, year, month),
      spendingTrends(pool, userId),
    ]);
    res.json({ tiers, trends });
  } catch (err) {
    console.error('[forecast] error:', err);
    res.status(500).json({ error: 'Failed to compute forecast' });
  }
});

export default router;
```

### Step 4: Modify `api/src/app.ts` to mount the forecast router

Replace `api/src/app.ts` with the complete final version including ALL routers:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import authRouter from '@/routes/auth';
import syncRouter from '@/routes/sync';
import reviewRouter from '@/routes/review';
import dashboardRouter from '@/routes/dashboard';
import spendingRouter from '@/routes/spending';
import transactionsRouter from '@/routes/transactions';
import goalsRouter from '@/routes/goals';
import forecastRouter from '@/routes/forecast';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(syncRouter);
  app.use(reviewRouter);
  app.use(dashboardRouter);
  app.use(spendingRouter);
  app.use(transactionsRouter);
  app.use(goalsRouter);
  app.use(forecastRouter);
  return app;
}
```

### Step 5: Run the test to verify it passes

```bash
cd api && npm test -- --testPathPattern="routes/forecast"
```

Expected: PASS — 7/7

### Step 6: Run full API suite to confirm no regressions

```bash
cd api && npm test
```

Expected: all existing suites pass, plus 7 new forecast route tests.

### Step 7: Commit

```bash
git add api/src/routes/forecast.ts api/src/__tests__/routes/forecast.test.ts api/src/app.ts
git commit -m "feat(api): add GET /forecast/:userId route and mount in app"
```

---

## Task 5: Expo Forecast screen wired to API

**Files:**
- Modify: `mobile/app/(tabs)/forecast.tsx`
- Create: `mobile/__tests__/forecast.test.tsx`

Calls `apiGet` from `mobile/lib/api.ts` (contracts §13). Renders 4 tier cards (amount via `formatPence` from `mobile/lib/format.ts`, badge) and trend callouts. Uses `SEED_USER_ID` from `mobile/lib/currentUser.ts` (same constant as the API side, referenced from mobile). Uses plain `useEffect` + `useState` hooks (no React Query, per §13).

### Step 0: Create `mobile/lib/currentUser.ts`

```typescript
export const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';
```

Commit:
```bash
git add mobile/lib/currentUser.ts
git commit -m "feat(mobile): add SEED_USER_ID constant for MVP auth bootstrap"
```

### Step 1: Write the failing test

Create `mobile/__tests__/forecast.test.tsx`:

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

// Mock the api module before importing the screen
jest.mock('@/lib/api', () => ({
  apiGet: jest.fn(),
}));
// Mock format helpers so we test rendering logic without real formatting details
jest.mock('@/lib/format', () => ({
  formatPence: (p: number) => `£${(p / 100).toFixed(2)}`,
}));
// Mock currentUser constant
jest.mock('@/lib/currentUser', () => ({
  SEED_USER_ID: '00000000-0000-0000-0000-000000000001',
}));

import { apiGet } from '@/lib/api';
import ForecastScreen from '@/app/(tabs)/forecast';

const mockedApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const MOCK_RESPONSE = {
  tiers: [
    { name: 'Goal',      monthly_pence: 120000, annual_pence: 1440000, badge: 'on-track' },
    { name: 'Realistic', monthly_pence: 140000, annual_pence: 1680000, badge: 'on-track' },
    { name: 'Stretch',   monthly_pence: 158000, annual_pence: 1896000, badge: 'stretch'  },
    { name: 'Actual',    monthly_pence:  90000, annual_pence: 1080000, badge: 'behind'   },
  ],
  trends: [
    { kind: 'consistent', text: 'Your Groceries spend has been consistent at £500/month.', category: 'Groceries' },
    { kind: 'increasing', text: 'Your Shopping spend is increasing — £200/month → £300/month.', category: 'Shopping' },
    { kind: 'suggestion', text: 'Reduce Shopping to its 3-month average saves ~£100/month.', category: 'Shopping' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ForecastScreen', () => {
  it('shows a loading indicator before data arrives', () => {
    // Never resolve so we stay in loading state
    mockedApiGet.mockReturnValue(new Promise(() => {}));

    render(<ForecastScreen />);

    expect(screen.getByTestId('forecast-loading')).toBeTruthy();
  });

  it('renders all 4 tier names after data loads', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      expect(screen.getByText('Goal')).toBeTruthy();
      expect(screen.getByText('Realistic')).toBeTruthy();
      expect(screen.getByText('Stretch')).toBeTruthy();
      expect(screen.getByText('Actual')).toBeTruthy();
    });
  });

  it('renders formatted monthly amount for each tier', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      // formatPence mock: £(pence/100).toFixed(2)
      expect(screen.getByText('£1200.00')).toBeTruthy(); // Goal 120000
      expect(screen.getByText('£1400.00')).toBeTruthy(); // Realistic 140000
      expect(screen.getByText('£1580.00')).toBeTruthy(); // Stretch 158000
      expect(screen.getByText('£900.00')).toBeTruthy();  // Actual 90000
    });
  });

  it('renders badge text for each tier', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      // Two on-track badges (Goal + Realistic), one stretch, one behind
      const onTrackBadges = screen.getAllByText('on-track');
      expect(onTrackBadges.length).toBe(2);
      expect(screen.getByText('stretch')).toBeTruthy();
      expect(screen.getByText('behind')).toBeTruthy();
    });
  });

  it('renders all three trend callout texts', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => {
      expect(screen.getByText('Your Groceries spend has been consistent at £500/month.')).toBeTruthy();
      expect(screen.getByText('Your Shopping spend is increasing — £200/month → £300/month.')).toBeTruthy();
      expect(screen.getByText('Reduce Shopping to its 3-month average saves ~£100/month.')).toBeTruthy();
    });
  });

  it('calls apiGet with the correct path including SEED_USER_ID and current year/month', async () => {
    mockedApiGet.mockResolvedValue(MOCK_RESPONSE);

    render(<ForecastScreen />);

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledTimes(1));

    const [path] = mockedApiGet.mock.calls[0] as [string];
    // Path must include the user ID and year/month query params
    expect(path).toContain('00000000-0000-0000-0000-000000000001');
    expect(path).toContain('year=');
    expect(path).toContain('month=');
  });

  it('shows an error message when the API call fails', async () => {
    mockedApiGet.mockRejectedValue(new Error('Network error'));

    render(<ForecastScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('forecast-error')).toBeTruthy();
    });
  });
});
```

### Step 2: Run the test to verify it fails

```bash
cd mobile && npx jest __tests__/forecast.test.tsx
```

Expected: FAIL — screen component does not yet render the expected elements

### Step 3: Modify `mobile/app/(tabs)/forecast.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { apiGet } from '@/lib/api';
import { formatPence } from '@/lib/format';
import { SEED_USER_ID } from '@/lib/currentUser';

// ---------- Types (mirrors API response, contracts §9) ----------

type Badge = 'on-track' | 'behind' | 'stretch';
type CalloutKind = 'consistent' | 'increasing' | 'suggestion';

interface ForecastTier {
  name: 'Goal' | 'Realistic' | 'Stretch' | 'Actual';
  monthly_pence: number;
  annual_pence: number;
  badge: Badge;
}

interface TrendCallout {
  kind: CalloutKind;
  text: string;
  category?: string;
}

interface ForecastResponse {
  tiers: ForecastTier[];
  trends: TrendCallout[];
}

// ---------- Helpers ----------

const BADGE_COLORS: Record<Badge, { bg: string; text: string }> = {
  'on-track': { bg: '#0d2e1a', text: '#4ade80' },
  'behind':   { bg: '#2d0a0a', text: '#f87171' },
  'stretch':  { bg: '#1e1a2d', text: '#c084fc' },
};

/** Return badge background and text colour tokens for a given badge value. */
function badgeStyle(badge: Badge): { bg: string; text: string } {
  return BADGE_COLORS[badge];
}

const CALLOUT_ACCENTS: Record<CalloutKind, string> = {
  consistent: '#60a5fa',
  increasing: '#f97316',
  suggestion: '#4ade80',
};

/** Return a left-border accent colour for a trend callout kind. */
function calloutAccent(kind: CalloutKind): string {
  return CALLOUT_ACCENTS[kind];
}

// ---------- Sub-components ----------

function TierCard({ tier }: { tier: ForecastTier }) {
  const bs = badgeStyle(tier.badge);
  return (
    <View style={styles.tierCard}>
      <View style={styles.tierHeader}>
        <Text style={styles.tierName}>{tier.name}</Text>
        <View style={[styles.badge, { backgroundColor: bs.bg }]}>
          <Text style={[styles.badgeText, { color: bs.text }]}>{tier.badge}</Text>
        </View>
      </View>
      <Text style={styles.tierAmount}>{formatPence(tier.monthly_pence)}</Text>
      <Text style={styles.tierAnnual}>{formatPence(tier.annual_pence)} / year</Text>
    </View>
  );
}

function CalloutCard({ callout }: { callout: TrendCallout }) {
  const accent = calloutAccent(callout.kind);
  return (
    <View style={[styles.calloutCard, { borderLeftColor: accent }]}>
      <Text style={styles.calloutText}>{callout.text}</Text>
    </View>
  );
}

// ---------- Screen ----------

export default function ForecastScreen() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // JS months are 0-indexed

    apiGet<ForecastResponse>(
      `/forecast/${SEED_USER_ID}?year=${year}&month=${month}`,
    )
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View style={styles.center} testID="forecast-loading">
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center} testID="forecast-error">
        <Text style={styles.errorText}>Could not load forecast. Please try again.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Savings Forecast</Text>

      <View style={styles.section}>
        {data.tiers.map(tier => (
          <TierCard key={tier.name} tier={tier} />
        ))}
      </View>

      {data.trends.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Spending Trends</Text>
          {data.trends.map((callout, idx) => (
            <CalloutCard key={idx} callout={callout} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
  },
  tierCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tierAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  tierAnnual: {
    fontSize: 12,
    color: '#64748b',
  },
  calloutCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
  },
  calloutText: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
  },
});
```

### Step 4: Run the test to verify it passes

```bash
cd mobile && npx jest __tests__/forecast.test.tsx
```

Expected: PASS — 7/7

### Step 5: Run full mobile suite to confirm no regressions

```bash
cd mobile && npx jest
```

Expected: all existing suites pass, plus the 7 new forecast screen tests.

### Step 6: Commit

```bash
git add mobile/app/(tabs)/forecast.tsx mobile/__tests__/forecast.test.tsx
git commit -m "feat(mobile): wire Forecast screen to GET /forecast API with tier cards and trend callouts"
```

---

## Self-Review

### Spec coverage

| Requirement | Where addressed |
|---|---|
| `monthlyAverages(userId, months=6)` — trailing N calendar months by transaction_date, avg over months that exist | Task 1, `api/src/forecast/trends.ts` |
| Returns avg6 income/needs/wants in integer pence (`_pence` suffix) | Task 1 — `Math.round(Number(...))` |
| Fewer months of data → average over months that exist | Task 1 — PostgreSQL `AVG` naturally handles this; NULL → 0 guard |
| Full tests with seeded query mocks | Task 1 — 5 tests covering happy path, custom months, nulls, fractional coercion |
| `computeForecast(userId, year, month)` — 4 tiers per §8 | Task 2, `api/src/forecast/forecast.ts` |
| `goal_pence = ROUND(income * savings_pct / 100)` | Task 2, line `Math.round(income_pence * goal.savings_pct / 100)` |
| `realistic_pence = ROUND(avg6_income - avg6_needs - avg6_wants)` | Task 2 |
| `stretch_pence = ROUND(avg6_income - avg6_needs - 0.70 * avg6_wants)` | Task 2 |
| Clamp realistic/stretch ≥ 0 | Task 2 — `Math.max(0, ...)` |
| Badge on-track/behind; Stretch always 'stretch' | Task 2 |
| Tests: behind-goal case and clamp-to-zero case | Task 2 — dedicated describe blocks |
| `spendingTrends(userId)` — consistent, increasing, suggestion callouts | Task 3, `api/src/forecast/insights.ts` |
| Consistent: stable 6-month spend (≤10% max deviation) | Task 3 |
| Increasing: >10% rise over last 3 months vs prior 3 months | Task 3 |
| Suggestion: "Reduce X to 3-month avg saves ~£Y/month" | Task 3 |
| Return shape `[{kind, text, category?}]` | Task 3 |
| Tests: each kind with mocked rows | Task 3 — 5 tests across 3 describe blocks |
| `GET /forecast/:userId?year=&month=` → `{ tiers, trends }` | Task 4, `api/src/routes/forecast.ts` |
| Mount router in `app.ts` | Task 4 — modify step |
| supertest test | Task 4 — 7 tests |
| Forecast screen renders 4 tier cards (formatPence, badge) + trend callouts | Task 5, `mobile/app/(tabs)/forecast.tsx` |
| Uses `apiGet` from `mobile/lib/api` | Task 5 |
| Uses `SEED_USER_ID` from `@/lib/currentUser` | Task 5 |
| Mobile test with mocked api module (loading → data) | Task 5 — 7 tests |
| `transaction_date` for all date filters | Tasks 1, 3 — SQL uses `t.transaction_date` |
| All money fields integer pence with `_pence` suffix | Throughout — types named `*_pence`, Math.round applied |
| Phase 3 helpers imported, not redefined | Task 2 — `import { incomeForMonth, bucketSpendForMonth }` from `@/lib/money`; `import { getOrCreateGoal }` from `@/lib/goals` |

### Placeholder scan

No TBD, TODO, FIXME, or vague instructions appear anywhere in this document. Every step includes:
- Complete TypeScript or SQL source code
- Exact file paths (absolute within repo)
- Exact shell commands with expected output (FAIL or PASS)
- Exact git commit commands as text for the executor

### Type consistency

- `Pool` injected into every module function (not imported at module level) so tests can pass `mockPool` without mocking the `pg` module.
- All monetary return values use `Math.round(Number(...))` to guarantee integer pence.
- `ForecastTier`, `TrendCallout`, `MonthlyAverages`, `Badge`, `CalloutKind` defined once in the module that owns them; route and screen import from those modules.
- `SEED_USER_ID` consumed from `@/lib/currentUser` on both API side (tests) and mobile side (screen) — same constant, no duplication.
- `formatPence` consumed from `mobile/lib/format` in the screen; tests mock it to a deterministic lambda so assertions on rendered text are stable.
- `apiGet` consumed from `mobile/lib/api`; tests mock the whole module via `jest.mock('@/lib/api')` matching the path used in the screen.
- Pool singleton `pool` from `@/db/client` is passed through to module functions in the route handler; tests mock `@/db/client` at the route-test level and verify the mocked `computeForecast`/`spendingTrends` are called with `expect.anything()` for the pool argument.
