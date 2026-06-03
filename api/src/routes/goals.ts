import { Router, Request, Response } from 'express';
import { getOrCreateGoal } from '@/lib/goals';
import { pool } from '@/db/client';
import { resolvePeriod } from '@/lib/period';

const router = Router();

router.get('/goals/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const period = resolvePeriod(req.query.year as string | undefined, req.query.month as string | undefined);
    if (!period.ok) { res.status(400).json({ error: period.error }); return; }
    const { year, month } = period.period;
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

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'year and month must be integers; month must be 1–12' });
      return;
    }

    const pcts = [needs_pct, wants_pct, savings_pct];
    if (pcts.some(p => !Number.isInteger(p) || p < 0 || p > 100)) {
      res.status(400).json({
        error: 'needs_pct, wants_pct, and savings_pct must be integers between 0 and 100',
      });
      return;
    }

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
