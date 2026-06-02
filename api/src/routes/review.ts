import { Router } from 'express';
import { pool } from '@/db/client';
import { normaliseMerchant } from '@/categorisation/rules';

const router = Router();

// GET /review/:userId — pending transactions (AI-categorised, not yet confirmed)
router.get('/review/:userId', async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT t.id, t.merchant_name, t.description, t.amount_pence,
            t.transaction_date, t.categorisation_source,
            c.name AS category_name, c.meta_bucket,
            la.account_name
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     JOIN linked_accounts la ON la.id = t.account_id
     WHERE t.user_id = $1 AND t.needs_review = TRUE
     ORDER BY t.transaction_date DESC`,
    [userId],
  );
  res.json(rows);
});

// POST /review/:txnId/confirm — accept AI suggestion as-is
router.post('/review/:txnId/confirm', async (req, res) => {
  const { txnId } = req.params;
  const { rows } = await pool.query(
    'SELECT id, category_id FROM transactions WHERE id = $1',
    [txnId],
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Transaction not found' }); return; }

  await pool.query(
    `UPDATE transactions
     SET categorisation_source = 'confirmed', needs_review = FALSE
     WHERE id = $1`,
    [txnId],
  );
  res.json({ ok: true });
});

// POST /review/:txnId/change — change category, optionally create rule
// Body: { category_name: string, create_rule?: boolean, user_id?: string }
router.post('/review/:txnId/change', async (req, res) => {
  const { txnId } = req.params;
  const { category_name, create_rule, user_id } = req.body as {
    category_name: string;
    create_rule?: boolean;
    user_id?: string;
  };

  const { rows: catRows } = await pool.query<{ id: string }>(
    'SELECT id FROM categories WHERE name = $1',
    [category_name],
  );
  if (catRows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }
  const categoryId = catRows[0].id;

  await pool.query(
    `UPDATE transactions
     SET category_id = $1, categorisation_source = 'manual', needs_review = FALSE
     WHERE id = $2`,
    [categoryId, txnId],
  );

  if (create_rule && user_id) {
    const { rows: txnRows } = await pool.query<{ merchant_name: string | null; user_id: string }>(
      'SELECT merchant_name, description, user_id FROM transactions WHERE id = $1',
      [txnId],
    );
    if (txnRows.length > 0) {
      const txn = txnRows[0];
      const pattern = normaliseMerchant(
        txn.merchant_name,
        (txn as unknown as { description: string }).description,
      );
      await pool.query(
        `INSERT INTO categorisation_rules (user_id, merchant_pattern, category_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, merchant_pattern) DO UPDATE SET category_id = EXCLUDED.category_id`,
        [user_id, pattern, categoryId],
      );
    }
  }

  res.json({ ok: true });
});

export default router;
