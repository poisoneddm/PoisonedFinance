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
