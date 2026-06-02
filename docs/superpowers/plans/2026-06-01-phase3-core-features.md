# PoisonedFinance — Phase 3: Core Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up all data-producing API endpoints (dashboard, spending, transactions, goals) and the mobile screens that consume them. At the end, Dashboard/Spending/Transactions screens display real database-backed data, pill statuses are computed by a pure function with full boundary coverage, goals auto-seed on first access, and both API and mobile layers have comprehensive TDD coverage.

**Architecture:** All new API logic lives under `api/src/lib/` (pure helpers) and `api/src/routes/` (Express routers). Routers are mounted in the existing `api/src/app.ts`. Mobile utilities live in `mobile/lib/`; screens import a `useMonthData` hook for `useEffect`+state data fetching. No new dependencies are added beyond what Plans A–D already declared.

**Tech Stack:** Node.js 20, TypeScript 5.4, Express 4, `pg` 8, Jest + `ts-jest` + `supertest` (API); Expo SDK 51, React Native, Jest + `jest-expo` + React Testing Library (mobile). Money fields: integer pence, `_pence` suffix throughout. Date filtering: `transaction_date` exclusively (never `posted_date`). Auth: `SEED_USER_ID` from `@/lib/currentUser`.

---

## File Structure

```
api/
└── src/
    ├── app.ts                                        # Modify — mount 4 new routers
    ├── lib/
    │   ├── pillStatus.ts                             # Create — pure pillStatus() helper (§7)
    │   ├── goals.ts                                  # Create — getOrCreateGoal() (§6)
    │   └── money.ts                                  # Create — SQL helpers: incomeForMonth, bucketSpendForMonth (§4/§5)
    └── routes/
        ├── dashboard.ts                              # Create — GET /dashboard/:userId
        ├── spending.ts                               # Create — GET /spending/:userId
        ├── transactions.ts                           # Create — GET /transactions/:userId
        └── goals.ts                                  # Create — GET /goals/:userId, PUT /goals/:userId
    __tests__/
        ├── lib/
        │   ├── pillStatus.test.ts                    # Create — exhaustive boundary tests
        │   ├── goals.test.ts                         # Create — getOrCreateGoal insert/select
        │   └── money.test.ts                         # Create — incomeForMonth, bucketSpendForMonth
        └── routes/
            ├── dashboard.test.ts                     # Create — GET /dashboard/:userId integration
            ├── spending.test.ts                      # Create — GET /spending/:userId integration
            ├── transactions.test.ts                  # Create — GET /transactions/:userId integration
            └── goals.test.ts                         # Create — GET + PUT /goals/:userId integration

mobile/
└── lib/
    ├── api.ts                                        # Create — apiGet/apiPost/apiPut (§13)
    ├── format.ts                                     # Create — formatPence/formatPenceShort (§13)
    └── statusColors.ts                               # Create — PillLevel→{bg,text} theme tokens (§7/§13)
    __tests__/
        ├── format.test.ts                            # Create — unit tests for format.ts
        └── statusColors.test.ts                      # Create — unit tests for statusColors.ts
└── screens/
    ├── DashboardScreen.tsx                           # Modify — wire to /dashboard via useMonthData
    ├── SpendingScreen.tsx                            # Modify — wire to /spending via useMonthData
    └── TransactionsScreen.tsx                        # Modify — wire to /transactions via useMonthData
    __tests__/screens/
        ├── DashboardScreen.test.tsx                  # Create — loading→data render test
        ├── SpendingScreen.test.tsx                   # Create — loading→data render test
        └── TransactionsScreen.test.tsx               # Create — loading→data render test
    hooks/
        └── useMonthData.ts                           # Create — generic useEffect+state data hook
```

---

### Task 1: `pillStatus` pure helper

**Files:**
- Create: `api/src/lib/pillStatus.ts`
- Create: `api/src/__tests__/lib/pillStatus.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/lib/pillStatus.test.ts`:

```typescript
import { pillStatus, PillLevel, Bucket } from '@/lib/pillStatus';

// Helper to assert clearly
function expect_status(
  amount: number,
  goal: number,
  bucket: Bucket,
  expected: PillLevel,
) {
  expect(pillStatus(amount, goal, bucket)).toBe(expected);
}

describe('pillStatus — needs bucket (lower is better)', () => {
  it('ratio exactly 0 → green', () => expect_status(0, 1000, 'needs', 'green'));
  it('ratio 0.49 → green (just below 50%)', () => expect_status(490, 1000, 'needs', 'green'));
  it('ratio 0.5 → amber (boundary — 50% is amber, not green)', () => expect_status(500, 1000, 'needs', 'amber'));
  it('ratio 0.99 → amber (just below 100%)', () => expect_status(990, 1000, 'needs', 'amber'));
  it('ratio 1.0 → red (100% is over)', () => expect_status(1000, 1000, 'needs', 'red'));
  it('ratio over 1.0 → red', () => expect_status(1500, 1000, 'needs', 'red'));
  it('goal=0 amount=0 → green (ratio=0)', () => expect_status(0, 0, 'needs', 'green'));
  it('goal=0 amount>0 → red (ratio=Infinity)', () => expect_status(1, 0, 'needs', 'red'));
});

describe('pillStatus — wants bucket (lower is better)', () => {
  it('ratio 0.49 → green', () => expect_status(490, 1000, 'wants', 'green'));
  it('ratio 0.5 → amber', () => expect_status(500, 1000, 'wants', 'amber'));
  it('ratio 0.99 → amber', () => expect_status(990, 1000, 'wants', 'amber'));
  it('ratio 1.0 → red', () => expect_status(1000, 1000, 'wants', 'red'));
  it('ratio over 1.0 → red', () => expect_status(2000, 1000, 'wants', 'red'));
  it('goal=0 amount=0 → green', () => expect_status(0, 0, 'wants', 'green'));
  it('goal=0 amount>0 → red', () => expect_status(50, 0, 'wants', 'red'));
});

describe('pillStatus — savings bucket (higher is better)', () => {
  it('ratio 0 → red', () => expect_status(0, 1000, 'savings', 'red'));
  it('ratio 0.49 → red (just below 50%)', () => expect_status(490, 1000, 'savings', 'red'));
  it('ratio 0.5 → amber (50% boundary — not red)', () => expect_status(500, 1000, 'savings', 'amber'));
  it('ratio 0.89 → amber (just below 90%)', () => expect_status(890, 1000, 'savings', 'amber'));
  it('ratio 0.9 → green (90% boundary)', () => expect_status(900, 1000, 'savings', 'green'));
  it('ratio over 0.9 → green', () => expect_status(1200, 1000, 'savings', 'green'));
  it('goal=0 amount=0 → green (ratio=0 treated as 0, savings 0/0 = no shortfall)', () => expect_status(0, 0, 'savings', 'green'));
  it('goal=0 amount>0 → green (Infinity ≥ 0.9)', () => expect_status(500, 0, 'savings', 'green'));
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && npm test -- --testPathPattern="lib/pillStatus"
```

Expected: FAIL — `Cannot find module '@/lib/pillStatus'`

- [ ] **Step 3: Create `api/src/lib/pillStatus.ts`**

```typescript
export type PillLevel = 'green' | 'amber' | 'red';
export type Bucket = 'needs' | 'wants' | 'savings';

export function pillStatus(
  amountPence: number,
  goalPence: number,
  bucket: Bucket,
): PillLevel {
  let ratio: number;
  if (goalPence === 0) {
    ratio = amountPence > 0 ? Infinity : 0;
  } else {
    ratio = amountPence / goalPence;
  }

  if (bucket === 'needs' || bucket === 'wants') {
    if (ratio < 0.5) return 'green';
    if (ratio < 1.0) return 'amber';
    return 'red';
  }

  // savings — reversed
  if (ratio >= 0.9) return 'green';
  if (ratio >= 0.5) return 'amber';
  return 'red';
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd api && npm test -- --testPathPattern="lib/pillStatus"
```

Expected: PASS — 23/23

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/pillStatus.ts api/src/__tests__/lib/pillStatus.test.ts
git commit -m "feat(api): add pure pillStatus helper with full boundary coverage (§7)"
```

---

### Task 2: `goals` lib — `getOrCreateGoal`

**Files:**
- Create: `api/src/lib/goals.ts`
- Create: `api/src/__tests__/lib/goals.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/lib/goals.test.ts`:

```typescript
import { MonthlyGoal } from '@/types/index';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

import { getOrCreateGoal } from '@/lib/goals';

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const existingGoal: MonthlyGoal = {
  id: 'goal-uuid-1',
  user_id: SEED_USER_ID,
  year: 2026,
  month: 6,
  needs_pct: 40,
  wants_pct: 20,
  savings_pct: 40,
};

beforeEach(() => mockQuery.mockReset());

describe('getOrCreateGoal', () => {
  it('returns existing goal when row found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [existingGoal] });
    const result = await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    expect(result).toEqual(existingGoal);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('SELECT');
  });

  it('inserts with defaults when no row found, then returns inserted row', async () => {
    const insertedGoal: MonthlyGoal = { ...existingGoal, id: 'goal-uuid-2' };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })           // SELECT returns nothing
      .mockResolvedValueOnce({ rows: [insertedGoal] }); // INSERT returns row
    const result = await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    expect(result).toEqual(insertedGoal);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const insertCall: string = mockQuery.mock.calls[1][0];
    expect(insertCall).toContain('INSERT INTO monthly_goals');
    expect(insertCall).toContain('ON CONFLICT');
  });

  it('insert uses 40/20/40 defaults', async () => {
    const insertedGoal: MonthlyGoal = { ...existingGoal, id: 'goal-uuid-3' };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [insertedGoal] });
    await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    const insertParams: unknown[] = mockQuery.mock.calls[1][1];
    // params order: user_id, year, month, needs_pct, wants_pct, savings_pct
    expect(insertParams).toContain(40); // needs_pct
    expect(insertParams).toContain(20); // wants_pct
  });

  it('re-selects and returns existing goal when INSERT conflicts', async () => {
    // Simulate race: SELECT empty → INSERT conflicts (returns empty) → re-SELECT finds row
    const racedGoal: MonthlyGoal = { ...existingGoal, id: 'goal-uuid-4' };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })        // first SELECT
      .mockResolvedValueOnce({ rows: [] })        // INSERT ON CONFLICT DO NOTHING returns nothing
      .mockResolvedValueOnce({ rows: [racedGoal] }); // fallback SELECT
    const result = await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    expect(result).toEqual(racedGoal);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && npm test -- --testPathPattern="lib/goals"
```

Expected: FAIL — `Cannot find module '@/lib/goals'`

- [ ] **Step 3: Create `api/src/lib/goals.ts`**

```typescript
import { pool } from '@/db/client';
import { MonthlyGoal } from '@/types/index';

export async function getOrCreateGoal(
  userId: string,
  year: number,
  month: number,
): Promise<MonthlyGoal> {
  const selectSql = `
    SELECT id, user_id, year, month, needs_pct, wants_pct, savings_pct
    FROM monthly_goals
    WHERE user_id = $1 AND year = $2 AND month = $3
  `;
  const { rows: existing } = await pool.query(selectSql, [userId, year, month]);
  if (existing.length > 0) return existing[0] as MonthlyGoal;

  const insertSql = `
    INSERT INTO monthly_goals (user_id, year, month, needs_pct, wants_pct, savings_pct)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id, year, month) DO NOTHING
    RETURNING id, user_id, year, month, needs_pct, wants_pct, savings_pct
  `;
  const { rows: inserted } = await pool.query(insertSql, [
    userId,
    year,
    month,
    40,
    20,
    40,
  ]);
  if (inserted.length > 0) return inserted[0] as MonthlyGoal;

  // Race condition: another request inserted between our SELECT and INSERT
  const { rows: fallback } = await pool.query(selectSql, [userId, year, month]);
  return fallback[0] as MonthlyGoal;
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd api && npm test -- --testPathPattern="lib/goals"
```

Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/goals.ts api/src/__tests__/lib/goals.test.ts
git commit -m "feat(api): add getOrCreateGoal with 40/20/40 auto-seed on first read (§6)"
```

---

### Task 3: `money` lib — SQL aggregation helpers

**Files:**
- Create: `api/src/lib/money.ts`
- Create: `api/src/__tests__/lib/money.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/lib/money.test.ts`:

```typescript
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
    expect(sql).toMatch(/-amount_pence/);
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
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && npm test -- --testPathPattern="lib/money"
```

Expected: FAIL — `Cannot find module '@/lib/money'`

- [ ] **Step 3: Create `api/src/lib/money.ts`**

```typescript
import { pool } from '@/db/client';
import { MetaBucket } from '@/types/index';

/**
 * Income for a given month: sum of positive (credit) transactions,
 * excluding credits whose category meta_bucket is 'savings'. §4.
 */
export async function incomeForMonth(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const sql = `
    SELECT COALESCE(SUM(t.amount_pence), 0)::integer AS income_pence
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = $1
      AND t.amount_pence > 0
      AND EXTRACT(YEAR  FROM t.transaction_date) = $2
      AND EXTRACT(MONTH FROM t.transaction_date) = $3
      AND (t.category_id IS NULL OR c.meta_bucket <> 'savings')
  `;
  const { rows } = await pool.query(sql, [userId, year, month]);
  return (rows[0]?.income_pence as number | null) ?? 0;
}

/**
 * Bucket spend for a given month: sum of absolute values of debit transactions
 * whose category's meta_bucket matches the given bucket. §5.
 * Savings bucket spend = money moved into savings (debits categorised Savings).
 */
export async function bucketSpendForMonth(
  userId: string,
  bucket: MetaBucket,
  year: number,
  month: number,
): Promise<number> {
  const sql = `
    SELECT COALESCE(SUM(-t.amount_pence), 0)::integer AS spend_pence
    FROM transactions t
    INNER JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = $1
      AND t.amount_pence < 0
      AND c.meta_bucket = $2
      AND EXTRACT(YEAR  FROM t.transaction_date) = $3
      AND EXTRACT(MONTH FROM t.transaction_date) = $4
  `;
  const { rows } = await pool.query(sql, [userId, bucket, year, month]);
  return (rows[0]?.spend_pence as number | null) ?? 0;
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd api && npm test -- --testPathPattern="lib/money"
```

Expected: PASS — 9/9

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/money.ts api/src/__tests__/lib/money.test.ts
git commit -m "feat(api): add incomeForMonth and bucketSpendForMonth SQL helpers (§4/§5)"
```

---

### Task 4: `GET /dashboard/:userId` route

**Files:**
- Create: `api/src/routes/dashboard.ts`
- Create: `api/src/__tests__/routes/dashboard.test.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/routes/dashboard.test.ts`:

```typescript
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
const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

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
    expect(needsPill.status).toBe('green'); // 80000/100000 = 0.8, but wait — 0.8 ≥ 0.5 so amber
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
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && npm test -- --testPathPattern="routes/dashboard"
```

Expected: FAIL — route not mounted

- [ ] **Step 3: Create `api/src/routes/dashboard.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { getOrCreateGoal } from '@/lib/goals';
import { incomeForMonth, bucketSpendForMonth } from '@/lib/money';
import { pillStatus, Bucket } from '@/lib/pillStatus';
import { pool } from '@/db/client';
import { MetaBucket } from '@/types/index';

const router = Router();

router.get('/dashboard/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();
    const year = parseInt(req.query.year as string, 10) || now.getFullYear();
    const month = parseInt(req.query.month as string, 10) || (now.getMonth() + 1);

    const [goal, income] = await Promise.all([
      getOrCreateGoal(userId, year, month),
      incomeForMonth(userId, year, month),
    ]);

    const buckets: MetaBucket[] = ['needs', 'wants', 'savings'];
    const pctMap: Record<MetaBucket, number> = {
      needs: goal.needs_pct,
      wants: goal.wants_pct,
      savings: goal.savings_pct,
    };

    const spends = await Promise.all(
      buckets.map(b => bucketSpendForMonth(userId, b, year, month)),
    );

    const pills = buckets.map((b, i) => {
      const goal_pence = Math.round((income * pctMap[b]) / 100);
      const spent_pence = spends[i];
      return {
        bucket: b,
        spent_pence,
        goal_pence,
        status: pillStatus(spent_pence, goal_pence, b as Bucket),
      };
    });

    const reviewResult = await pool.query(
      `SELECT COUNT(*)::integer AS review_count
       FROM transactions
       WHERE user_id = $1 AND needs_review = TRUE`,
      [userId],
    );
    const review_count = parseInt(reviewResult.rows[0]?.review_count ?? '0', 10);

    const recentResult = await pool.query(
      `SELECT t.id,
              t.merchant_name,
              t.description,
              t.amount_pence,
              t.transaction_date,
              c.name  AS category_name,
              c.meta_bucket,
              c.color_hex
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1
         AND EXTRACT(YEAR  FROM t.transaction_date) = $2
         AND EXTRACT(MONTH FROM t.transaction_date) = $3
       ORDER BY t.transaction_date DESC
       LIMIT 5`,
      [userId, year, month],
    );

    res.json({
      income_pence: income,
      pills,
      review_count,
      recent: recentResult.rows,
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
```

- [ ] **Step 4: Modify `api/src/app.ts` — mount dashboard router**

Open `api/src/app.ts` and add the import and `app.use(dashboardRouter)` line. The file currently reads:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  return app;
}
```

Replace with:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import dashboardRouter from '@/routes/dashboard';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(dashboardRouter);
  return app;
}
```

- [ ] **Step 5: Run to verify PASS**

```bash
cd api && npm test -- --testPathPattern="routes/dashboard"
```

Expected: PASS — 6/6

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/dashboard.ts api/src/app.ts api/src/__tests__/routes/dashboard.test.ts
git commit -m "feat(api): add GET /dashboard/:userId endpoint — income, pills, review count, recent txns (§9)"
```

---

### Task 5: `GET /spending/:userId` route

**Files:**
- Create: `api/src/routes/spending.ts`
- Create: `api/src/__tests__/routes/spending.test.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/routes/spending.test.ts`:

```typescript
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
const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

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

const categoryBreakdownRows = [
  { name: 'Groceries',  meta_bucket: 'needs',  color_hex: '#60a5fa', total_pence: 55000 },
  { name: 'Transport',  meta_bucket: 'needs',  color_hex: '#bfdbfe', total_pence: 25000 },
  { name: 'Eating Out', meta_bucket: 'wants',  color_hex: '#f472b6', total_pence: 40000 },
  { name: 'Savings',    meta_bucket: 'savings',color_hex: '#4ade80', total_pence: 100000 },
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
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && npm test -- --testPathPattern="routes/spending"
```

Expected: FAIL — route not mounted

- [ ] **Step 3: Create `api/src/routes/spending.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { getOrCreateGoal } from '@/lib/goals';
import { incomeForMonth, bucketSpendForMonth } from '@/lib/money';
import { pillStatus, Bucket } from '@/lib/pillStatus';
import { pool } from '@/db/client';
import { MetaBucket } from '@/types/index';

const router = Router();

router.get('/spending/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();
    const year = parseInt(req.query.year as string, 10) || now.getFullYear();
    const month = parseInt(req.query.month as string, 10) || (now.getMonth() + 1);

    const [goal, income] = await Promise.all([
      getOrCreateGoal(userId, year, month),
      incomeForMonth(userId, year, month),
    ]);

    const buckets: MetaBucket[] = ['needs', 'wants', 'savings'];
    const pctMap: Record<MetaBucket, number> = {
      needs: goal.needs_pct,
      wants: goal.wants_pct,
      savings: goal.savings_pct,
    };

    const spends = await Promise.all(
      buckets.map(b => bucketSpendForMonth(userId, b, year, month)),
    );

    const goal_bars = buckets.map((b, i) => {
      const goal_pence = Math.round((income * pctMap[b]) / 100);
      const spent_pence = spends[i];
      return {
        bucket: b,
        spent_pence,
        goal_pence,
        status: pillStatus(spent_pence, goal_pence, b as Bucket),
      };
    });

    const breakdownResult = await pool.query(
      `SELECT c.name,
              c.meta_bucket,
              c.color_hex,
              COALESCE(SUM(-t.amount_pence), 0)::integer AS total_pence
       FROM categories c
       LEFT JOIN transactions t
         ON t.category_id = c.id
        AND t.user_id = $1
        AND t.amount_pence < 0
        AND EXTRACT(YEAR  FROM t.transaction_date) = $2
        AND EXTRACT(MONTH FROM t.transaction_date) = $3
       GROUP BY c.id, c.name, c.meta_bucket, c.color_hex
       ORDER BY total_pence DESC`,
      [userId, year, month],
    );

    res.json({
      goal_bars,
      category_breakdown: breakdownResult.rows,
    });
  } catch (err) {
    console.error('[spending]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
```

- [ ] **Step 4: Modify `api/src/app.ts` — mount spending router**

Replace the current `app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import dashboardRouter from '@/routes/dashboard';
import spendingRouter from '@/routes/spending';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(dashboardRouter);
  app.use(spendingRouter);
  return app;
}
```

- [ ] **Step 5: Run to verify PASS**

```bash
cd api && npm test -- --testPathPattern="routes/spending"
```

Expected: PASS — 5/5

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/spending.ts api/src/app.ts api/src/__tests__/routes/spending.test.ts
git commit -m "feat(api): add GET /spending/:userId — 3 goal bars + category breakdown (§9)"
```

---

### Task 6: `GET /transactions/:userId` route

**Files:**
- Create: `api/src/routes/transactions.ts`
- Create: `api/src/__tests__/routes/transactions.test.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/routes/transactions.test.ts`:

```typescript
import request from 'supertest';
import { createApp } from '@/app';

jest.mock('@/db/client', () => ({ pool: { query: jest.fn() } }));

import { pool } from '@/db/client';
const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

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
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && npm test -- --testPathPattern="routes/transactions"
```

Expected: FAIL — route not mounted

- [ ] **Step 3: Create `api/src/routes/transactions.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { pool } from '@/db/client';

const router = Router();

router.get('/transactions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();
    const year = parseInt(req.query.year as string, 10) || now.getFullYear();
    const month = parseInt(req.query.month as string, 10) || (now.getMonth() + 1);
    const account = req.query.account as string | undefined;
    const bucket = req.query.bucket as string | undefined;
    const q = req.query.q as string | undefined;

    const params: unknown[] = [userId, year, month];
    const conditions: string[] = [
      `t.user_id = $1`,
      `EXTRACT(YEAR  FROM t.transaction_date) = $2`,
      `EXTRACT(MONTH FROM t.transaction_date) = $3`,
    ];

    if (account) {
      params.push(account);
      conditions.push(`t.account_id = $${params.length}`);
    }

    if (bucket) {
      params.push(bucket);
      conditions.push(`c.meta_bucket = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(
        `(t.merchant_name ILIKE $${idx} OR t.description ILIKE $${idx})`,
      );
    }

    const sql = `
      SELECT t.id,
             t.merchant_name,
             t.description,
             t.amount_pence,
             t.transaction_date,
             t.needs_review,
             c.name      AS category_name,
             c.meta_bucket,
             c.color_hex,
             la.account_name
      FROM transactions t
      LEFT JOIN categories    c  ON c.id  = t.category_id
      LEFT JOIN linked_accounts la ON la.id = t.account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.transaction_date DESC, t.created_at DESC
    `;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[transactions]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
```

- [ ] **Step 4: Modify `api/src/app.ts` — mount transactions router**

Replace the current `app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import dashboardRouter from '@/routes/dashboard';
import spendingRouter from '@/routes/spending';
import transactionsRouter from '@/routes/transactions';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(dashboardRouter);
  app.use(spendingRouter);
  app.use(transactionsRouter);
  return app;
}
```

- [ ] **Step 5: Run to verify PASS**

```bash
cd api && npm test -- --testPathPattern="routes/transactions"
```

Expected: PASS — 6/6

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/transactions.ts api/src/app.ts api/src/__tests__/routes/transactions.test.ts
git commit -m "feat(api): add GET /transactions/:userId with year/month/account/bucket/q filters (§9)"
```

---

### Task 7: `GET /goals/:userId` and `PUT /goals/:userId` routes

**Files:**
- Create: `api/src/routes/goals.ts`
- Create: `api/src/__tests__/routes/goals.test.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/routes/goals.test.ts`:

```typescript
import request from 'supertest';
import { createApp } from '@/app';

jest.mock('@/lib/goals', () => ({ getOrCreateGoal: jest.fn() }));
jest.mock('@/db/client', () => ({ pool: { query: jest.fn() } }));

import { getOrCreateGoal } from '@/lib/goals';
import { pool } from '@/db/client';

const mockGetOrCreateGoal = getOrCreateGoal as jest.MockedFunction<typeof getOrCreateGoal>;
const mockQuery = pool.query as jest.MockedFunction<typeof pool.query>;

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
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && npm test -- --testPathPattern="routes/goals"
```

Expected: FAIL — route not mounted

- [ ] **Step 3: Create `api/src/routes/goals.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { getOrCreateGoal } from '@/lib/goals';
import { pool } from '@/db/client';

const router = Router();

router.get('/goals/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();
    const year = parseInt(req.query.year as string, 10) || now.getFullYear();
    const month = parseInt(req.query.month as string, 10) || (now.getMonth() + 1);
    const goal = await getOrCreateGoal(userId, year, month);
    res.json(goal);
  } catch (err) {
    console.error('[goals GET]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

router.put('/goals/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { year, month, needs_pct, wants_pct, savings_pct } = req.body as {
      year: number;
      month: number;
      needs_pct: number;
      wants_pct: number;
      savings_pct: number;
    };

    if (needs_pct + wants_pct + savings_pct !== 100) {
      res.status(400).json({
        error: 'needs_pct, wants_pct, and savings_pct must sum to 100',
      });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO monthly_goals (user_id, year, month, needs_pct, wants_pct, savings_pct)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, year, month) DO UPDATE
         SET needs_pct   = EXCLUDED.needs_pct,
             wants_pct   = EXCLUDED.wants_pct,
             savings_pct = EXCLUDED.savings_pct
       RETURNING id, user_id, year, month, needs_pct, wants_pct, savings_pct`,
      [userId, year, month, needs_pct, wants_pct, savings_pct],
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('[goals PUT]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
```

- [ ] **Step 4: Modify `api/src/app.ts` — mount goals router (final state)**

Replace the current `app.ts` with the complete final version mounting all four new routers:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import dashboardRouter from '@/routes/dashboard';
import spendingRouter from '@/routes/spending';
import transactionsRouter from '@/routes/transactions';
import goalsRouter from '@/routes/goals';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(dashboardRouter);
  app.use(spendingRouter);
  app.use(transactionsRouter);
  app.use(goalsRouter);
  return app;
}
```

- [ ] **Step 5: Run to verify PASS**

```bash
cd api && npm test -- --testPathPattern="routes/goals"
```

Expected: PASS — 7/7

- [ ] **Step 6: Run full API suite to confirm no regressions**

```bash
cd api && npm test
```

Expected: all tests pass across client, migrate, health, pillStatus, goals lib, money, dashboard, spending, transactions, goals routes.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/goals.ts api/src/app.ts api/src/__tests__/routes/goals.test.ts
git commit -m "feat(api): add GET /goals/:userId and PUT /goals/:userId with sum=100 validation (§9)"
```

---

### Task 8: Mobile lib — `format.ts`

**Files:**
- Create: `mobile/lib/format.ts`
- Create: `mobile/lib/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/lib/__tests__/format.test.ts`:

```typescript
import { formatPence, formatPenceShort } from '../format';

describe('formatPence', () => {
  it('formats integer pence as £X,XXX.XX', () => {
    expect(formatPence(123456)).toBe('£1,234.56');
  });

  it('formats zero correctly', () => {
    expect(formatPence(0)).toBe('£0.00');
  });

  it('formats single pence (1p)', () => {
    expect(formatPence(1)).toBe('£0.01');
  });

  it('formats exactly 100p as £1.00', () => {
    expect(formatPence(100)).toBe('£1.00');
  });

  it('formats large amount with commas', () => {
    expect(formatPence(1000000)).toBe('£10,000.00');
  });

  it('formats negative pence (debit) with minus sign', () => {
    expect(formatPence(-3450)).toBe('-£34.50');
  });

  it('formats negative zero as £0.00 (no -£0.00)', () => {
    // Math.abs(0) === 0 so sign check passes through as positive
    expect(formatPence(-0)).toBe('£0.00');
  });
});

describe('formatPenceShort', () => {
  it('formats pence rounding to nearest pound, no decimals', () => {
    expect(formatPenceShort(123456)).toBe('£1,235');
  });

  it('formats zero as £0', () => {
    expect(formatPenceShort(0)).toBe('£0');
  });

  it('truncates (floors) — 99p rounds up at 50p', () => {
    expect(formatPenceShort(150)).toBe('£2');
  });

  it('formats £1,234 for 123400 pence', () => {
    expect(formatPenceShort(123400)).toBe('£1,234');
  });

  it('formats negative amounts', () => {
    expect(formatPenceShort(-3450)).toBe('-£35');
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mobile && npx jest --testPathPattern="lib/__tests__/format"
```

Expected: FAIL — `Cannot find module '../format'`

- [ ] **Step 3: Create `mobile/lib/format.ts`**

```typescript
/**
 * Format integer pence as a GBP currency string with pence. §13
 * Examples: 123456 → "£1,234.56"  -3450 → "-£34.50"
 */
export function formatPence(pence: number): string {
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const pounds = (abs / 100).toFixed(2);
  const [integer, decimal] = pounds.split('.');
  const intWithCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}£${intWithCommas}.${decimal}`;
}

/**
 * Format integer pence rounded to nearest whole pound, no decimals. §13
 * Examples: 123456 → "£1,235"  -3450 → "-£35"
 */
export function formatPenceShort(pence: number): string {
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const pounds = Math.round(abs / 100);
  const poundsStr = pounds.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}£${poundsStr}`;
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd mobile && npx jest --testPathPattern="lib/__tests__/format"
```

Expected: PASS — 12/12

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/format.ts mobile/lib/__tests__/format.test.ts
git commit -m "feat(mobile): add formatPence and formatPenceShort currency helpers (§13)"
```

---

### Task 9: Mobile lib — `statusColors.ts`

**Files:**
- Create: `mobile/lib/statusColors.ts`
- Create: `mobile/lib/__tests__/statusColors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `mobile/lib/__tests__/statusColors.test.ts`:

```typescript
import { statusColors, StatusColorResult } from '../statusColors';
import { PillLevel } from '../types';

describe('statusColors', () => {
  it('green → pillGreenBg background token and green text token', () => {
    const result: StatusColorResult = statusColors('green');
    expect(result.bg).toBe('pillGreenBg');
    expect(result.text).toBe('green');
  });

  it('amber → pillAmberBg background token and amber text token', () => {
    const result: StatusColorResult = statusColors('amber');
    expect(result.bg).toBe('pillAmberBg');
    expect(result.text).toBe('amber');
  });

  it('red → pillRedBg background token and red text token', () => {
    const result: StatusColorResult = statusColors('red');
    expect(result.bg).toBe('pillRedBg');
    expect(result.text).toBe('red');
  });

  it('returns a result with bg and text properties for all PillLevel values', () => {
    const levels: PillLevel[] = ['green', 'amber', 'red'];
    for (const level of levels) {
      const result = statusColors(level);
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(typeof result.bg).toBe('string');
      expect(typeof result.text).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Create `mobile/lib/types.ts`** (shared PillLevel type for mobile — mirrors API §7)

```typescript
export type PillLevel = 'green' | 'amber' | 'red';
```

- [ ] **Step 3: Run to verify FAIL**

```bash
cd mobile && npx jest --testPathPattern="lib/__tests__/statusColors"
```

Expected: FAIL — `Cannot find module '../statusColors'`

- [ ] **Step 4: Create `mobile/lib/statusColors.ts`**

```typescript
import { PillLevel } from './types';

export interface StatusColorResult {
  /** Theme token name for background colour */
  bg: string;
  /** Theme token name for text colour */
  text: string;
}

/**
 * Maps a PillLevel to theme colour tokens per §7:
 *   green → bg pillGreenBg (#0d2e1a), text green
 *   amber → bg pillAmberBg (#2d2208), text amber
 *   red   → bg pillRedBg   (#2d0a0a), text red
 */
export function statusColors(level: PillLevel): StatusColorResult {
  switch (level) {
    case 'green':
      return { bg: 'pillGreenBg', text: 'green' };
    case 'amber':
      return { bg: 'pillAmberBg', text: 'amber' };
    case 'red':
      return { bg: 'pillRedBg', text: 'red' };
  }
}
```

- [ ] **Step 5: Run to verify PASS**

```bash
cd mobile && npx jest --testPathPattern="lib/__tests__/statusColors"
```

Expected: PASS — 4/4

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/types.ts mobile/lib/statusColors.ts mobile/lib/__tests__/statusColors.test.ts
git commit -m "feat(mobile): add statusColors helper mapping PillLevel to theme tokens (§7/§13)"
```

---

### Task 10: Mobile lib — `api.ts`

**Files:**
- Create: `mobile/lib/api.ts`

No unit tests for `api.ts` itself (it wraps `fetch` with no logic to isolate); it is exercised via mocking in screen tests (Tasks 11–13).

- [ ] **Step 1: Create `mobile/lib/api.ts`**

```typescript
/**
 * Typed HTTP helpers for the PoisonedFinance API. §13
 * Base URL read from EXPO_PUBLIC_API_URL environment variable.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/api.ts
git commit -m "feat(mobile): add typed apiGet/apiPost/apiPut using EXPO_PUBLIC_API_URL (§13)"
```

---

### Task 11: Mobile `useMonthData` hook

**Files:**
- Create: `mobile/hooks/useMonthData.ts`

- [ ] **Step 1: Create `mobile/hooks/useMonthData.ts`**

```typescript
import { useState, useEffect } from 'react';
import { apiGet } from '@/lib/api';

export type FetchState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: T };

/**
 * Generic hook that fetches a typed resource from the API whenever
 * userId, year, or month changes. Uses plain useEffect+state per §13 (no React Query).
 */
export function useMonthData<T>(
  buildPath: (userId: string, year: number, month: number) => string,
  userId: string,
  year: number,
  month: number,
): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiGet<T>(buildPath(userId, year, month))
      .then(data => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch(err => {
        if (!cancelled)
          setState({ status: 'error', error: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, year, month]);

  return state;
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/hooks/useMonthData.ts
git commit -m "feat(mobile): add useMonthData generic fetch hook (useEffect+state, §13)"
```

---

### Task 12: Wire `DashboardScreen` to API + test

**Files:**
- Modify: `mobile/screens/DashboardScreen.tsx`
- Create: `mobile/__tests__/screens/DashboardScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/screens/DashboardScreen.test.tsx`:

```typescript
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from '../../screens/DashboardScreen';

jest.mock('../../lib/api', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '../../lib/api';
const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const dashboardData = {
  income_pence: 250000,
  pills: [
    { bucket: 'needs',   spent_pence: 80000,  goal_pence: 100000, status: 'green' },
    { bucket: 'wants',   spent_pence: 40000,  goal_pence:  50000, status: 'amber' },
    { bucket: 'savings', spent_pence: 100000, goal_pence: 100000, status: 'green' },
  ],
  review_count: 2,
  recent: [
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
};

describe('DashboardScreen', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows a loading indicator before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    const { getByTestId } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders income after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(dashboardData);
    const { getByText } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('£2,500.00')).toBeTruthy();
    });
  });

  it('renders all 3 pill buckets', async () => {
    mockApiGet.mockResolvedValueOnce(dashboardData);
    const { getByText } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText(/needs/i)).toBeTruthy();
      expect(getByText(/wants/i)).toBeTruthy();
      expect(getByText(/savings/i)).toBeTruthy();
    });
  });

  it('renders recent transactions list', async () => {
    mockApiGet.mockResolvedValueOnce(dashboardData);
    const { getByText } = render(
      <DashboardScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Tesco')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mobile && npx jest --testPathPattern="__tests__/screens/DashboardScreen"
```

Expected: FAIL — module not found or missing testID

- [ ] **Step 3: Modify `mobile/screens/DashboardScreen.tsx`**

```typescript
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useMonthData } from '@/hooks/useMonthData';
import { formatPence } from '@/lib/format';
import { statusColors } from '@/lib/statusColors';
import { PillLevel } from '@/lib/types';

interface Pill {
  bucket: string;
  spent_pence: number;
  goal_pence: number;
  status: PillLevel;
}

interface RecentTransaction {
  id: string;
  merchant_name: string | null;
  description: string;
  amount_pence: number;
  transaction_date: string;
  category_name: string | null;
}

interface DashboardData {
  income_pence: number;
  pills: Pill[];
  review_count: number;
  recent: RecentTransaction[];
}

interface DashboardScreenProps {
  userId: string;
  year: number;
  month: number;
}

export function DashboardScreen({ userId, year, month }: DashboardScreenProps) {
  const state = useMonthData<DashboardData>(
    (u, y, m) => `/dashboard/${u}?year=${y}&month=${m}`,
    userId,
    year,
    month,
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="loading-indicator" size="large" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text>Error: {state.error}</Text>
      </View>
    );
  }

  const { income_pence, pills, review_count, recent } = state.data;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.incomeLabel}>Monthly Income</Text>
      <Text style={styles.incomeAmount}>{formatPence(income_pence)}</Text>

      {review_count > 0 && (
        <Text style={styles.reviewAlert}>{review_count} transactions need review</Text>
      )}

      <View style={styles.pillsRow}>
        {pills.map(pill => {
          const colors = statusColors(pill.status);
          return (
            <View key={pill.bucket} style={[styles.pill, { backgroundColor: colors.bg }]}>
              <Text style={[styles.pillLabel, { color: colors.text }]}>
                {pill.bucket.charAt(0).toUpperCase() + pill.bucket.slice(1)}
              </Text>
              <Text style={[styles.pillAmount, { color: colors.text }]}>
                {formatPence(pill.spent_pence)}
              </Text>
              <Text style={[styles.pillGoal, { color: colors.text }]}>
                of {formatPence(pill.goal_pence)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionHeader}>Recent Transactions</Text>
      {recent.map(tx => (
        <View key={tx.id} style={styles.txRow}>
          <Text style={styles.txMerchant}>{tx.merchant_name ?? tx.description}</Text>
          <Text style={styles.txAmount}>{formatPence(tx.amount_pence)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  incomeLabel: { fontSize: 14, color: '#888', marginBottom: 4 },
  incomeAmount: { fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  reviewAlert: { color: '#f59e0b', marginBottom: 12 },
  pillsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  pill: { flex: 1, borderRadius: 8, padding: 12 },
  pillLabel: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  pillAmount: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  pillGoal: { fontSize: 11, marginTop: 2 },
  sectionHeader: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  txMerchant: { flex: 1, fontSize: 14 },
  txAmount: { fontSize: 14, fontWeight: '500' },
});
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd mobile && npx jest --testPathPattern="__tests__/screens/DashboardScreen"
```

Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add mobile/screens/DashboardScreen.tsx mobile/__tests__/screens/DashboardScreen.test.tsx
git commit -m "feat(mobile): wire DashboardScreen to /dashboard API via useMonthData hook"
```

---

### Task 13: Wire `SpendingScreen` to API + test

**Files:**
- Modify: `mobile/screens/SpendingScreen.tsx`
- Create: `mobile/__tests__/screens/SpendingScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/screens/SpendingScreen.test.tsx`:

```typescript
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SpendingScreen } from '../../screens/SpendingScreen';

jest.mock('../../lib/api', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '../../lib/api';
const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const spendingData = {
  goal_bars: [
    { bucket: 'needs',   spent_pence: 80000,  goal_pence: 100000, status: 'green' },
    { bucket: 'wants',   spent_pence: 40000,  goal_pence:  50000, status: 'amber' },
    { bucket: 'savings', spent_pence: 100000, goal_pence: 100000, status: 'green' },
  ],
  category_breakdown: [
    { name: 'Groceries',  meta_bucket: 'needs',   color_hex: '#60a5fa', total_pence: 55000 },
    { name: 'Transport',  meta_bucket: 'needs',   color_hex: '#bfdbfe', total_pence: 25000 },
    { name: 'Eating Out', meta_bucket: 'wants',   color_hex: '#f472b6', total_pence: 40000 },
    { name: 'Savings',    meta_bucket: 'savings', color_hex: '#4ade80', total_pence: 100000 },
  ],
};

describe('SpendingScreen', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows loading indicator before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <SpendingScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders all 3 goal bars after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(spendingData);
    const { getByText } = render(
      <SpendingScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText(/needs/i)).toBeTruthy();
      expect(getByText(/wants/i)).toBeTruthy();
      expect(getByText(/savings/i)).toBeTruthy();
    });
  });

  it('renders category breakdown items', async () => {
    mockApiGet.mockResolvedValueOnce(spendingData);
    const { getByText } = render(
      <SpendingScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Groceries')).toBeTruthy();
      expect(getByText('Eating Out')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mobile && npx jest --testPathPattern="__tests__/screens/SpendingScreen"
```

Expected: FAIL

- [ ] **Step 3: Modify `mobile/screens/SpendingScreen.tsx`**

```typescript
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useMonthData } from '@/hooks/useMonthData';
import { formatPence } from '@/lib/format';
import { statusColors } from '@/lib/statusColors';
import { PillLevel } from '@/lib/types';

interface GoalBar {
  bucket: string;
  spent_pence: number;
  goal_pence: number;
  status: PillLevel;
}

interface CategoryBreakdownItem {
  name: string;
  meta_bucket: string;
  color_hex: string;
  total_pence: number;
}

interface SpendingData {
  goal_bars: GoalBar[];
  category_breakdown: CategoryBreakdownItem[];
}

interface SpendingScreenProps {
  userId: string;
  year: number;
  month: number;
}

export function SpendingScreen({ userId, year, month }: SpendingScreenProps) {
  const state = useMonthData<SpendingData>(
    (u, y, m) => `/spending/${u}?year=${y}&month=${m}`,
    userId,
    year,
    month,
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="loading-indicator" size="large" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text>Error: {state.error}</Text>
      </View>
    );
  }

  const { goal_bars, category_breakdown } = state.data;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionHeader}>Goal Progress</Text>
      {goal_bars.map(bar => {
        const pct = bar.goal_pence > 0
          ? Math.round((bar.spent_pence / bar.goal_pence) * 100)
          : 0;
        const colors = statusColors(bar.status);
        return (
          <View key={bar.bucket} style={styles.barWrapper}>
            <View style={styles.barLabelRow}>
              <Text style={styles.barLabel}>
                {bar.bucket.charAt(0).toUpperCase() + bar.bucket.slice(1)}
              </Text>
              <Text style={styles.barPct}>{pct}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(pct, 100)}%` as any,
                    backgroundColor: colors.text,
                  },
                ]}
              />
            </View>
            <Text style={styles.barAmounts}>
              {formatPence(bar.spent_pence)} of {formatPence(bar.goal_pence)}
            </Text>
          </View>
        );
      })}

      <Text style={styles.sectionHeader}>By Category</Text>
      {category_breakdown.map(item => (
        <View key={item.name} style={styles.catRow}>
          <View style={[styles.catDot, { backgroundColor: item.color_hex }]} />
          <Text style={styles.catName}>{item.name}</Text>
          <Text style={styles.catTotal}>{formatPence(item.total_pence)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 8 },
  barWrapper: { marginBottom: 20 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 14, fontWeight: '600' },
  barPct: { fontSize: 14, color: '#888' },
  barTrack: { height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barAmounts: { fontSize: 12, color: '#888', marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  catName: { flex: 1, fontSize: 14 },
  catTotal: { fontSize: 14, fontWeight: '500' },
});
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd mobile && npx jest --testPathPattern="__tests__/screens/SpendingScreen"
```

Expected: PASS — 3/3

- [ ] **Step 5: Commit**

```bash
git add mobile/screens/SpendingScreen.tsx mobile/__tests__/screens/SpendingScreen.test.tsx
git commit -m "feat(mobile): wire SpendingScreen to /spending API — goal bars + category breakdown"
```

---

### Task 14: Wire `TransactionsScreen` to API + test

**Files:**
- Modify: `mobile/screens/TransactionsScreen.tsx`
- Create: `mobile/__tests__/screens/TransactionsScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/screens/TransactionsScreen.test.tsx`:

```typescript
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { TransactionsScreen } from '../../screens/TransactionsScreen';

jest.mock('../../lib/api', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '../../lib/api';
const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const txnData = [
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

describe('TransactionsScreen', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows loading indicator before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders transaction merchant names after data loads', async () => {
    mockApiGet.mockResolvedValueOnce(txnData);
    const { getByText } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Tesco')).toBeTruthy();
      expect(getByText('Netflix')).toBeTruthy();
    });
  });

  it('renders formatted pence amounts for each transaction', async () => {
    mockApiGet.mockResolvedValueOnce(txnData);
    const { getByText } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('-£34.50')).toBeTruthy();
      expect(getByText('-£15.99')).toBeTruthy();
    });
  });

  it('renders category names', async () => {
    mockApiGet.mockResolvedValueOnce(txnData);
    const { getByText } = render(
      <TransactionsScreen userId={SEED_USER_ID} year={2026} month={6} />,
    );
    await waitFor(() => {
      expect(getByText('Groceries')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd mobile && npx jest --testPathPattern="__tests__/screens/TransactionsScreen"
```

Expected: FAIL

- [ ] **Step 3: Modify `mobile/screens/TransactionsScreen.tsx`**

```typescript
import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useMonthData } from '@/hooks/useMonthData';
import { formatPence } from '@/lib/format';

interface Transaction {
  id: string;
  merchant_name: string | null;
  description: string;
  amount_pence: number;
  transaction_date: string;
  category_name: string | null;
  meta_bucket: string | null;
  color_hex: string | null;
  account_name: string | null;
}

interface TransactionsScreenProps {
  userId: string;
  year: number;
  month: number;
  account?: string;
  bucket?: string;
  q?: string;
}

export function TransactionsScreen({
  userId,
  year,
  month,
  account,
  bucket,
  q,
}: TransactionsScreenProps) {
  const state = useMonthData<Transaction[]>(
    (u, y, m) => {
      const params = new URLSearchParams({
        year: String(y),
        month: String(m),
        ...(account ? { account } : {}),
        ...(bucket ? { bucket } : {}),
        ...(q ? { q } : {}),
      });
      return `/transactions/${u}?${params.toString()}`;
    },
    userId,
    year,
    month,
  );

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="loading-indicator" size="large" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text>Error: {state.error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={state.data}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.merchant}>
              {item.merchant_name ?? item.description}
            </Text>
            {item.category_name && (
              <View style={styles.catBadge}>
                <View
                  style={[
                    styles.catDot,
                    { backgroundColor: item.color_hex ?? '#666' },
                  ]}
                />
                <Text style={styles.catText}>{item.category_name}</Text>
              </View>
            )}
            <Text style={styles.date}>{item.transaction_date}</Text>
          </View>
          <Text
            style={[
              styles.amount,
              { color: item.amount_pence < 0 ? '#f87171' : '#4ade80' },
            ]}
          >
            {formatPence(item.amount_pence)}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  rowLeft: { flex: 1, marginRight: 8 },
  merchant: { fontSize: 14, fontWeight: '500' },
  catBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  catText: { fontSize: 12, color: '#888' },
  date: { fontSize: 12, color: '#666', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd mobile && npx jest --testPathPattern="__tests__/screens/TransactionsScreen"
```

Expected: PASS — 4/4

- [ ] **Step 5: Run full mobile test suite**

```bash
cd mobile && npx jest
```

Expected: all tests pass (format, statusColors, DashboardScreen, SpendingScreen, TransactionsScreen).

- [ ] **Step 6: Commit**

```bash
git add mobile/screens/TransactionsScreen.tsx mobile/__tests__/screens/TransactionsScreen.test.tsx
git commit -m "feat(mobile): wire TransactionsScreen to /transactions API — filtered list with amounts"
```

---

## Self-Review

### Spec coverage checklist

- [x] `pillStatus(amountPence, goalPence, bucket)` — pure function in `api/src/lib/pillStatus.ts`, exact signature from §7 → Task 1
- [x] needs/wants boundaries: 0.49→green, 0.5→amber, 0.99→amber, 1.0→red, over→red, goal=0 both cases → Task 1, Step 1 (23 test cases)
- [x] savings boundaries: 0.49→red, 0.5→amber, 0.89→amber, 0.9→green, over→green, goal=0 both cases → Task 1, Step 1
- [x] `getOrCreateGoal(userId, year, month)` with 40/20/40 defaults, ON CONFLICT DO NOTHING, race-condition fallback re-SELECT → Task 2 (§6)
- [x] `incomeForMonth` — SUM(amount_pence) WHERE > 0, excludes savings meta_bucket credits, uses transaction_date → Task 3 (§4)
- [x] `bucketSpendForMonth` — SUM(-amount_pence) WHERE < 0, filters by meta_bucket, uses transaction_date → Task 3 (§5)
- [x] `GET /dashboard/:userId?year=&month=` → `{ income_pence, pills:[{bucket,spent_pence,goal_pence,status}], review_count, recent:[...5 txns] }` → Task 4 (§9)
- [x] `GET /spending/:userId?year=&month=` → 3 goal bars + `category_breakdown [{name,meta_bucket,color_hex,total_pence}]` ordered desc → Task 5 (§9)
- [x] `GET /transactions/:userId?year=&month=&account=&bucket=&q=` — filtered list → Task 6 (§9)
- [x] `GET /goals/:userId?year=&month=` — auto-seeded → Task 7 (§9)
- [x] `PUT /goals/:userId` body `{year,month,needs_pct,wants_pct,savings_pct}` — validates sum=100, else 400 → Task 7 (§9)
- [x] All 4 new routers mounted in `app.ts` → Tasks 4–7 (Steps 4/4/4/4)
- [x] `SEED_USER_ID` from `@/lib/currentUser` referenced in tests → all route tests
- [x] Money fields are integer pence with `_pence` suffix throughout → all types and SQL
- [x] All date filtering uses `transaction_date` not `posted_date` → Tasks 3, 4, 5, 6 (asserted in tests)
- [x] `mobile/lib/api.ts` — `apiGet`/`apiPost`/`apiPut` using `process.env.EXPO_PUBLIC_API_URL` → Task 10 (§13)
- [x] `mobile/lib/format.ts` — `formatPence` (£1,234.56) and `formatPenceShort` (£1,234) → Task 8 (§13)
- [x] `mobile/lib/statusColors.ts` — PillLevel→{bg,text} theme tokens per §7 → Task 9
- [x] Data fetching via plain `useEffect`+state, no React Query → Task 11 (§13)
- [x] Dashboard, Spending, Transactions screens wired via `useMonthData` hook → Tasks 12–14
- [x] Screen tests: loading indicator → data renders (mocked api module) → Tasks 12–14

### Placeholder scan

No TBD, TODO, or vague instructions appear in any step. Every step contains either complete file content or an exact shell command. All SQL uses `$N`-parameterised queries with explicit param arrays shown. All test mock return values are fully specified objects matching the contract shapes from §4–§9.

### Type consistency

- `PillLevel` and `Bucket` defined in `api/src/lib/pillStatus.ts`; imported by dashboard and spending routes.
- `MetaBucket` defined in `api/src/types/index.ts`; imported by `money.ts`, `dashboard.ts`, `spending.ts`.
- `MonthlyGoal` defined in `api/src/types/index.ts`; returned by `getOrCreateGoal` in `goals.ts`.
- Mobile `PillLevel` type defined in `mobile/lib/types.ts`; imported by `statusColors.ts` and all three screens.
- `formatPence`/`formatPenceShort` imported identically from `@/lib/format` in all three screens.
- `apiGet` imported from `@/lib/api` and mocked via same path `../../lib/api` in all screen tests.
- `useMonthData` imported from `@/hooks/useMonthData`; generic `<T>` parameter inferred from the concrete data interface at each call site.
- All `_pence` fields are `number` (integer) throughout API responses and mobile types — no `string` coercion anywhere.
