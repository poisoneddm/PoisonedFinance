import { Router } from 'express';
import { pool } from '@/db/client';
import { normaliseMerchant } from '@/categorisation/rules';
import { asyncHandler } from '@/lib/asyncHandler';

const router = Router();

// GET /review/:userId — pending transactions (AI-categorised, not yet confirmed).
// LEFT JOIN categories so AI-failed / unknown-category transactions (category_id
// NULL but needs_review TRUE) still surface as "Uncategorised" (contracts §10).
router.get(
  '/review/:userId',
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { rows } = await pool.query(
      `SELECT t.id, t.merchant_name, t.description, t.amount_pence,
              t.transaction_date, t.categorisation_source,
              COALESCE(c.name, 'Uncategorised') AS category_name, c.meta_bucket,
              la.account_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       JOIN linked_accounts la ON la.id = t.account_id
       WHERE t.user_id = $1 AND t.needs_review = TRUE
       ORDER BY t.transaction_date DESC`,
      [userId],
    );
    res.json(rows);
  }),
);

// POST /review/:txnId/confirm — accept AI suggestion as-is.
// Body: { user_id: string } — the owning user; the UPDATE is scoped to it so a
// caller can only confirm their own transactions (closes the IDOR).
router.post(
  '/review/:txnId/confirm',
  asyncHandler(async (req, res) => {
    const { txnId } = req.params;
    const { user_id } = req.body as { user_id?: string };
    if (!user_id) { res.status(400).json({ error: 'user_id is required' }); return; }

    const { rowCount } = await pool.query(
      `UPDATE transactions
       SET categorisation_source = 'confirmed', needs_review = FALSE
       WHERE id = $1 AND user_id = $2`,
      [txnId, user_id],
    );
    if (rowCount === 0) { res.status(404).json({ error: 'Transaction not found' }); return; }
    res.json({ ok: true });
  }),
);

// POST /review/:txnId/change — change category, optionally create rule.
// Body: { category_name: string, user_id: string, create_rule?: boolean }
router.post(
  '/review/:txnId/change',
  asyncHandler(async (req, res) => {
    const { txnId } = req.params;
    const { category_name, create_rule, user_id } = req.body as {
      category_name: string;
      create_rule?: boolean;
      user_id?: string;
    };
    if (!user_id) { res.status(400).json({ error: 'user_id is required' }); return; }

    const { rows: catRows } = await pool.query<{ id: string }>(
      'SELECT id FROM categories WHERE name = $1',
      [category_name],
    );
    if (catRows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }
    const categoryId = catRows[0].id;

    const { rowCount } = await pool.query(
      `UPDATE transactions
       SET category_id = $1, categorisation_source = 'manual', needs_review = FALSE
       WHERE id = $2 AND user_id = $3`,
      [categoryId, txnId, user_id],
    );
    if (rowCount === 0) { res.status(404).json({ error: 'Transaction not found' }); return; }

    if (create_rule) {
      // Read the merchant/description for this user's transaction so the rule
      // pattern is the raw merchant string (never the old category name).
      const { rows: txnRows } = await pool.query<{ merchant_name: string | null; description: string }>(
        'SELECT merchant_name, description FROM transactions WHERE id = $1 AND user_id = $2',
        [txnId, user_id],
      );
      if (txnRows.length > 0) {
        const pattern = normaliseMerchant(txnRows[0].merchant_name, txnRows[0].description);
        await pool.query(
          `INSERT INTO categorisation_rules (user_id, merchant_pattern, category_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, merchant_pattern) DO UPDATE SET category_id = EXCLUDED.category_id`,
          [user_id, pattern, categoryId],
        );
      }
    }

    res.json({ ok: true });
  }),
);

export default router;
