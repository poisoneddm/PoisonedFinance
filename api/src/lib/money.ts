import { pool } from '@/db/client';
import { MetaBucket } from '@/types/index';

/**
 * Income for a given month: sum of positive (credit) transactions that are either
 * uncategorised OR tagged with the Income meta-bucket. A credit categorised into a
 * SPEND bucket (e.g. a Tesco refund tagged Groceries) is treated as a refund/reversal
 * — it nets against bucket spend (see bucketSpendForMonth) and is excluded here so it
 * is never double-counted as income. Tagging a salary "Income" pins it as income even
 * if it would otherwise be mis-categorised into a spend bucket. §4.
 */
export async function incomeForMonth(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const sql = `
    SELECT COALESCE(SUM(t.amount_pence), 0)::bigint AS income_pence
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = $1
      AND t.amount_pence > 0
      AND (t.category_id IS NULL OR c.meta_bucket = 'income')
      AND EXTRACT(YEAR  FROM t.transaction_date) = $2
      AND EXTRACT(MONTH FROM t.transaction_date) = $3
  `;
  const { rows } = await pool.query(sql, [userId, year, month]);
  // BIGINT is returned by node-pg as a string; coerce to a JS number.
  return Number(rows[0]?.income_pence ?? 0);
}

/**
 * Net bucket spend for a given month: SUM(-amount_pence) over every transaction
 * whose category sits in the given meta_bucket. Debits add to spend; credits
 * (refunds/reversals categorised into the bucket) subtract from it, so a £50
 * Groceries refund reduces Needs spend by £50. §5.
 * Savings bucket spend = net money moved into savings (debits in minus credits out).
 */
export async function bucketSpendForMonth(
  userId: string,
  bucket: MetaBucket,
  year: number,
  month: number,
): Promise<number> {
  const sql = `
    SELECT COALESCE(SUM(-t.amount_pence), 0)::bigint AS spend_pence
    FROM transactions t
    INNER JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = $1
      AND c.meta_bucket = $2
      AND EXTRACT(YEAR  FROM t.transaction_date) = $3
      AND EXTRACT(MONTH FROM t.transaction_date) = $4
  `;
  const { rows } = await pool.query(sql, [userId, bucket, year, month]);
  // BIGINT is returned by node-pg as a string; coerce to a JS number.
  return Number(rows[0]?.spend_pence ?? 0);
}
