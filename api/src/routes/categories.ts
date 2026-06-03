import { Router } from 'express';
import { pool } from '@/db/client';
import { asyncHandler } from '@/lib/asyncHandler';

const router = Router();

// GET /categories — the full category list for the Category Edit picker.
// Ordered by meta-bucket (needs → wants → savings) then name so the mobile
// screen can render coloured meta-bucket groups without re-sorting.
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, meta_bucket, color_hex
       FROM categories
       ORDER BY CASE meta_bucket
                  WHEN 'needs'   THEN 0
                  WHEN 'wants'   THEN 1
                  WHEN 'savings' THEN 2
                  ELSE 3
                END,
                name`,
    );
    res.json(rows);
  }),
);

export default router;
