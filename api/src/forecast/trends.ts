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
