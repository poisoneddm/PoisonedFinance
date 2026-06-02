import { Router } from 'express';
import crypto from 'crypto';
import { buildAuthUrl, exchangeCode } from '@/truelayer/oauth';
import { encrypt } from '@/lib/crypto';
import { pool } from '@/db/client';
import { getValidAccessToken } from '@/truelayer/tokens';
import { syncAccounts } from '@/truelayer/sync';

const router = Router();

// GET /auth/truelayer?userId=<uuid>
// Redirects user to TrueLayer consent screen. userId is passed as state.
router.get('/auth/truelayer', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  const state = `${userId}:${crypto.randomBytes(8).toString('hex')}`;
  res.redirect(buildAuthUrl(state));
});

// GET /auth/callback?code=<code>&state=<userId:nonce>
router.get('/auth/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!code || !state) { res.status(400).json({ error: 'code and state required' }); return; }

  const userId = state.split(':')[0];
  try {
    const tokens = await exchangeCode(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const { rows: connRows } = await pool.query(
      `INSERT INTO bank_connections
         (user_id, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt],
    );
    const connectionId = connRows[0].id as string;
    const accessToken = await getValidAccessToken(connectionId);
    await syncAccounts(userId, connectionId, accessToken);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
