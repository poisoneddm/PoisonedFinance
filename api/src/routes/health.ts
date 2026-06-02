import { Router } from 'express';
import { pool } from '@/db/client';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'unavailable' });
  }
});

export default router;
