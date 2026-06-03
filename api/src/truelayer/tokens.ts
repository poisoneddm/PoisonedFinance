import { pool } from '@/db/client';
import { encrypt, decrypt } from '@/lib/crypto';
import { refreshAccessToken } from './oauth';

const REFRESH_THRESHOLD_MS = 60 * 1000; // refresh if within 60s of expiry

export async function getValidAccessToken(connectionId: string): Promise<string> {
  // Serialise concurrent callers per connection with SELECT ... FOR UPDATE inside
  // a transaction. Without this, two overlapping syncs near expiry could both
  // refresh and the rotated refresh token from the first call would invalidate
  // the second's tokens.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      id: string;
      access_token_enc: string;
      refresh_token_enc: string;
      token_expires_at: string;
    }>(
      `SELECT id, access_token_enc, refresh_token_enc, token_expires_at
       FROM bank_connections WHERE id = $1 FOR UPDATE`,
      [connectionId],
    );

    if (rows.length === 0) throw new Error('Bank connection not found');

    const conn = rows[0];
    const expiresAt = new Date(conn.token_expires_at).getTime();
    const now = Date.now();

    if (expiresAt > now + REFRESH_THRESHOLD_MS) {
      // Token still valid — release the lock and return the current token.
      await client.query('COMMIT');
      return decrypt(conn.access_token_enc);
    }

    // Near expiry — refresh while holding the row lock.
    const tokens = await refreshAccessToken(decrypt(conn.refresh_token_enc));
    const newExpiresAt = new Date(now + tokens.expires_in * 1000);

    await client.query(
      `UPDATE bank_connections
       SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3
       WHERE id = $4`,
      [encrypt(tokens.access_token), encrypt(tokens.refresh_token), newExpiresAt, connectionId],
    );

    await client.query('COMMIT');
    return tokens.access_token;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
