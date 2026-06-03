import { Router } from 'express';
import { buildAuthUrl, exchangeCode } from '@/truelayer/oauth';
import { encrypt } from '@/lib/crypto';
import { pool } from '@/db/client';
import { getValidAccessToken } from '@/truelayer/tokens';
import { syncAccounts } from '@/truelayer/sync';
import { issueState, consumeState } from '@/lib/oauthState';

const router = Router();

// Deep link the OAuth callback redirects back to once linking finishes, so the
// user lands back inside the mobile app rather than on a raw JSON page. The app
// listens for this URL and kicks off a full sync. Overridable for other clients.
const APP_RETURN_URL = process.env.APP_RETURN_URL ?? 'poisonedfinance://link-complete';

// GET /auth/truelayer?userId=<uuid>
// Redirects user to TrueLayer consent screen. A single-use, server-stored nonce
// is bound to userId and round-tripped as `state` for CSRF protection.
router.get('/auth/truelayer', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  const state = issueState(userId);
  res.redirect(buildAuthUrl(state));
});

// GET /auth/callback?code=<code>&state=<userId:nonce>
router.get('/auth/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!code || !state) { res.status(400).json({ error: 'code and state required' }); return; }

  // Validate state against the server-side store. userId comes from the store,
  // never from the (attacker-controllable) state string.
  const userId = consumeState(state);
  if (!userId) { res.status(403).json({ error: 'invalid or expired state' }); return; }

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
    // Return the user to the app. Transactions are pulled by the full sync the
    // app triggers on return (POST /sync/:userId), keeping this redirect fast.
    res.redirect(`${APP_RETURN_URL}?status=ok`);
  } catch (err) {
    console.error('[auth/callback]', err);
    res.redirect(`${APP_RETURN_URL}?status=error`);
  }
});

export default router;
