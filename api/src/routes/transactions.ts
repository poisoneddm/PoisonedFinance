import { Router, Request, Response } from 'express';
import { pool } from '@/db/client';
import { resolvePeriod } from '@/lib/period';

const router = Router();

router.get('/transactions/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const period = resolvePeriod(req.query.year as string | undefined, req.query.month as string | undefined);
    if (!period.ok) { res.status(400).json({ error: period.error }); return; }
    const { year, month } = period.period;
    const account = req.query.account as string | undefined;
    const bucket = req.query.bucket as string | undefined;
    const q = req.query.q as string | undefined;

    const params: unknown[] = [userId, year, month];
    const conditions: string[] = [
      `t.user_id = $1`,
      `EXTRACT(YEAR  FROM t.transaction_date) = $2`,
      `EXTRACT(MONTH FROM t.transaction_date) = $3`,
    ];

    if (account) {
      params.push(account);
      conditions.push(`t.account_id = $${params.length}`);
    }

    if (bucket) {
      params.push(bucket);
      conditions.push(`c.meta_bucket = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(
        `(t.merchant_name ILIKE $${idx} OR t.description ILIKE $${idx})`,
      );
    }

    const sql = `
      SELECT t.id,
             t.merchant_name,
             t.description,
             t.amount_pence,
             t.transaction_date,
             t.needs_review,
             c.name      AS category_name,
             c.meta_bucket,
             c.color_hex,
             la.account_name
      FROM transactions t
      LEFT JOIN categories    c  ON c.id  = t.category_id
      LEFT JOIN linked_accounts la ON la.id = t.account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.transaction_date DESC, t.created_at DESC
    `;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[transactions]', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;
