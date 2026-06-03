import { Router, Request, Response } from 'express';
import { getOrCreateGoal } from '@/lib/goals';
import { bucketSpendForMonth } from '@/lib/money';
import { expectedIncomeForMonth } from '@/lib/income';
import { pillStatus, Bucket } from '@/lib/pillStatus';
import { pool } from '@/db/client';
import { MetaBucket } from '@/types/index';
import { resolvePeriod } from '@/lib/period';

const router = Router();

router.get('/dashboard/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const period = resolvePeriod(req.query.year as string | undefined, req.query.month as string | undefined);
    if (!period.ok) { res.status(400).json({ error: period.error }); return; }
    const { year, month } = period.period;

    const [goal, income] = await Promise.all([
      getOrCreateGoal(userId, year, month),
      expectedIncomeForMonth(userId, year, month),
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

    // Budget targets use EXPECTED income so the plan is stable from day 1, even
    // before salaries land (see lib/income.ts).
    const pills = buckets.map((b, i) => {
      const goal_pence = Math.round((income.expected_pence * pctMap[b]) / 100);
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
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT 5`,
      [userId, year, month],
    );

    res.json({
      income_pence: income.actual_pence,
      expected_income_pence: income.expected_pence,
      income_source: income.source,
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
