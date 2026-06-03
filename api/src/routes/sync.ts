import { Router } from 'express';
import { pool } from '@/db/client';
import { getValidAccessToken } from '@/truelayer/tokens';
import { syncAccounts, syncTransactions } from '@/truelayer/sync';

const router = Router();

// POST /sync/:userId — manually trigger a full sync for all bank connections
router.post('/sync/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { rows: connections } = await pool.query(
      `SELECT id FROM bank_connections WHERE user_id = $1`,
      [userId],
    );
    if (connections.length === 0) { res.status(404).json({ error: 'No bank connections' }); return; }

    for (const conn of connections) {
      const accessToken = await getValidAccessToken(conn.id as string);
      await syncAccounts(userId, conn.id as string, accessToken);
      const { rows: accounts } = await pool.query(
        `SELECT id, external_id FROM linked_accounts WHERE connection_id = $1`,
        [conn.id],
      );
      for (const acct of accounts) {
        await syncTransactions(userId, acct.id as string, acct.external_id as string, accessToken);
      }
    }
    await pool.query(
      `UPDATE linked_accounts SET last_synced_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    res.json({ ok: true, synced: connections.length });
  } catch (err) {
    console.error('[sync]', err);
    res.status(500).json({ error: 'sync failed' });
  }
});

export default router;
