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
