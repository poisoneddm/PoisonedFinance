import crypto from 'crypto';
import { pool } from '@/db/client';
import { encrypt } from '@/lib/crypto';
import { runPipeline } from '@/categorisation/pipeline';
import type { ParsedTxn } from './parse';

/**
 * Compute a deterministic external_id for a parsed transaction so that
 * re-uploading the same PDF does not create duplicate rows.
 */
function syntheticExternalId(txn: ParsedTxn): string {
  return crypto
    .createHash('sha256')
    .update(`${txn.date}|${txn.description}|${String(txn.amount_pence)}`)
    .digest('hex');
}

/**
 * Find or create the sentinel bank_connections row for PDF imports.
 *
 * Per contracts §2 / §3, bank_connections.access_token_enc and
 * refresh_token_enc are NOT NULL. For the PDF sentinel we store encrypt('')
 * in both columns and use a far-future token_expires_at so no refresh is
 * ever attempted by the normal token-refresh path.
 */
async function findOrCreatePdfConnection(userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM bank_connections WHERE user_id = $1 AND provider = 'pdf' LIMIT 1`,
    [userId],
  );
  if (rows.length > 0) return rows[0].id;

  const emptyEnc = encrypt('');
  const farFuture = new Date('2099-12-31T23:59:59Z');

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO bank_connections
       (user_id, provider, access_token_enc, refresh_token_enc, token_expires_at)
     VALUES ($1, 'pdf', $2, $3, $4)
     RETURNING id`,
    [userId, emptyEnc, emptyEnc, farFuture],
  );
  return inserted[0].id;
}

/**
 * Find or create the "PDF Import" linked_account for this user's PDF connection.
 * The account_name is fixed to "PDF Import"; external_id is a stable synthetic key.
 */
async function findOrCreatePdfLinkedAccount(
  userId: string,
  connectionId: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM linked_accounts
     WHERE user_id = $1 AND connection_id = $2 LIMIT 1`,
    [userId, connectionId],
  );
  if (rows.length > 0) return rows[0].id;

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO linked_accounts
       (user_id, connection_id, external_id, account_name, account_type, currency)
     VALUES ($1, $2, 'pdf-import', 'PDF Import', 'TRANSACTION', 'GBP')
     RETURNING id`,
    [userId, connectionId],
  );
  return inserted[0].id;
}

/**
 * Import a list of parsed transactions for a user.
 *
 * @param userId   - The user who owns these transactions (SEED_USER_ID for MVP)
 * @param label    - Human-readable label (e.g. "NatWest PDF") — not stored; for caller tracing
 * @param parsed   - Output of parseStatementText()
 * @returns        - Count of newly inserted (non-duplicate) transactions
 */
export async function importStatement(
  userId: string,
  label: string,
  parsed: ParsedTxn[],
): Promise<number> {
  if (parsed.length === 0) return 0;

  const connectionId = await findOrCreatePdfConnection(userId);
  const linkedAccountId = await findOrCreatePdfLinkedAccount(userId, connectionId);

  const newIds: string[] = [];

  for (const txn of parsed) {
    const externalId = syntheticExternalId(txn);

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, needs_review)
       VALUES ($1, $2, $3, $4, $5, $6, 'GBP', $7, $8, TRUE)
       ON CONFLICT (account_id, external_id) DO NOTHING
       RETURNING id`,
      [
        linkedAccountId,
        userId,
        externalId,
        null,            // merchant_name — null for PDF imports; pipeline will categorise
        txn.description,
        txn.amount_pence,
        txn.date,        // transaction_date
        txn.date,        // posted_date (same — PDF has no separate posting date)
      ],
    );

    if (rows.length > 0) newIds.push(rows[0].id);
  }

  if (newIds.length > 0) {
    await runPipeline(userId, newIds);
  }

  return newIds.length;
}
