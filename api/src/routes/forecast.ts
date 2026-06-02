import { Router, Request, Response } from 'express';
import { pool } from '@/db/client';
import { computeForecast } from '@/forecast/forecast';
import { spendingTrends } from '@/forecast/insights';

const router = Router();

/**
 * GET /forecast/:userId?year=&month=
 *
 * Returns { tiers: ForecastTier[], trends: TrendCallout[] }.
 * All money values are integer pence with _pence suffix (contracts §9).
 */
router.get('/forecast/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const yearStr  = req.query.year  as string | undefined;
  const monthStr = req.query.month as string | undefined;

  if (!yearStr || !monthStr) {
    res.status(400).json({ error: 'year and month query parameters are required' });
    return;
  }

  const year  = parseInt(yearStr,  10);
  const month = parseInt(monthStr, 10);

  if (isNaN(year) || isNaN(month)) {
    res.status(400).json({ error: 'year and month must be valid integers' });
    return;
  }

  try {
    const [tiers, trends] = await Promise.all([
      computeForecast(pool, userId, year, month),
      spendingTrends(pool, userId),
    ]);
    res.json({ tiers, trends });
  } catch (err) {
    console.error('[forecast] error:', err);
    res.status(500).json({ error: 'Failed to compute forecast' });
  }
});

export default router;
