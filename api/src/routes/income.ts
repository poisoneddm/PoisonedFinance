import { Router, Request, Response } from 'express';
import { resolvePeriod } from '@/lib/period';
import { expectedIncomeForMonth, setExpectedIncome } from '@/lib/income';

const router = Router();

// GET /income/:userId?year=&month= — expected income (confirmed/suggested/actual),
// the history-derived suggestion, and actual income received so far.
router.get('/income/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const period = resolvePeriod(req.query.year as string | undefined, req.query.month as string | undefined);
    if (!period.ok) { res.status(400).json({ error: period.error }); return; }
    const { year, month } = period.period;
    res.json(await expectedIncomeForMonth(userId, year, month));
  } catch (err) {
    console.error('[income GET]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

// PUT /income/:userId — confirm/override expected income for a month.
// Body: { year, month, expected_pence }. Send expected_pence: null to clear
// the override and return to the suggested figure.
router.put('/income/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { year, month, expected_pence } = req.body as {
      year: number; month: number; expected_pence: number | null;
    };

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({ error: 'year and month must be integers; month must be 1–12' });
      return;
    }
    if (expected_pence !== null && (!Number.isInteger(expected_pence) || expected_pence < 0)) {
      res.status(400).json({ error: 'expected_pence must be a non-negative integer, or null to clear' });
      return;
    }

    await setExpectedIncome(userId, year, month, expected_pence);
    res.json(await expectedIncomeForMonth(userId, year, month));
  } catch (err) {
    console.error('[income PUT]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
