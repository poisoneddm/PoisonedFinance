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
