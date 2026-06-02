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
