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
