import { pool } from '@/db/client';
import { getOrCreateGoal } from '@/lib/goals';
import { incomeForMonth } from '@/lib/money';

/** Trailing calendar months averaged to suggest expected income. */
const SUGGEST_MONTHS = 3;

export type ExpectedIncomeSource = 'confirmed' | 'suggested' | 'actual';

export interface ExpectedIncome {
  /** The figure budget targets are computed from (income × bucket pct). */
  expected_pence: number;
  /** Where expected_pence came from. */
  source: ExpectedIncomeSource;
  /** History-derived suggestion (trailing-average actual income); 0 if no history. */
  suggested_pence: number;
  /** Actual income received in this month so far. */
  actual_pence: number;
}

/**
 * Suggest expected income as the trailing-average actual monthly income over the
 * SUGGEST_MONTHS calendar months *before* (year, month). Per-month sums are
 * averaged in JS to keep the SQL pg-mem friendly (no interval/date_trunc maths).
 * Returns 0 when there is no prior income history.
 */
export async function suggestedIncomeForMonth(
  userId: string,
  year: number,
  month: number,
  months: number = SUGGEST_MONTHS,
): Promise<number> {
  // [start, end) spans the `months` calendar months immediately before the target.
  const end = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const start = new Date(Date.UTC(year, month - 1 - months, 1)).toISOString().slice(0, 10);

  const { rows } = await pool.query<{ income: string | number }>(
    `SELECT SUM(amount_pence) AS income
     FROM transactions
     WHERE user_id = $1
       AND amount_pence > 0
       AND category_id IS NULL
       AND transaction_date >= $2
       AND transaction_date <  $3
     GROUP BY EXTRACT(YEAR FROM transaction_date),
              EXTRACT(MONTH FROM transaction_date)`,
    [userId, start, end],
  );

  if (rows.length === 0) return 0;
  const total = rows.reduce((sum, r) => sum + Number(r.income), 0);
  return Math.round(total / rows.length);
}

/**
 * Resolve the expected income that drives budget targets for (year, month):
 *   1. a user-confirmed override (monthly_goals.expected_income_pence), else
 *   2. the history-derived suggestion (if any history exists), else
 *   3. this month's actual income (cold-start fallback).
 */
export async function expectedIncomeForMonth(
  userId: string,
  year: number,
  month: number,
): Promise<ExpectedIncome> {
  await getOrCreateGoal(userId, year, month); // ensure the goal row exists
  const { rows } = await pool.query<{ expected_income_pence: number | null }>(
    `SELECT expected_income_pence FROM monthly_goals
     WHERE user_id = $1 AND year = $2 AND month = $3`,
    [userId, year, month],
  );
  const override = rows[0]?.expected_income_pence ?? null;

  const [suggested_pence, actual_pence] = await Promise.all([
    suggestedIncomeForMonth(userId, year, month),
    incomeForMonth(userId, year, month),
  ]);

  if (override !== null && override !== undefined) {
    return { expected_pence: Number(override), source: 'confirmed', suggested_pence, actual_pence };
  }
  if (suggested_pence > 0) {
    return { expected_pence: suggested_pence, source: 'suggested', suggested_pence, actual_pence };
  }
  return { expected_pence: actual_pence, source: 'actual', suggested_pence, actual_pence };
}

/** Store (or clear, when null) a user-confirmed expected-income override for the month. */
export async function setExpectedIncome(
  userId: string,
  year: number,
  month: number,
  expectedPence: number | null,
): Promise<void> {
  await getOrCreateGoal(userId, year, month);
  await pool.query(
    `UPDATE monthly_goals SET expected_income_pence = $4
     WHERE user_id = $1 AND year = $2 AND month = $3`,
    [userId, year, month, expectedPence],
  );
}
