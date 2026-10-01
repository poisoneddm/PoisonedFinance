import crypto from 'crypto';
import { pool } from '@/db/client';
import { encrypt } from '@/lib/crypto';
import { runPipeline } from '@/categorisation/pipeline';
import type { ParsedStatement, ParsedTxn, StatementAccount } from './common';

const FALLBACK_ACCOUNT: StatementAccount = { externalId: 'unknown', name: 'Imported statements' };

/**
 * Deterministic external_ids so re-importing a period — in the same or a different
 * format — does not duplicate rows. Descriptions differ between PDF, CSV and OFX
 * exports, so the key is date + amount + which occurrence of that pair it is.
 */
function syntheticExternalIds(transactions: ParsedTxn[]): string[] {
  const seen = new Map<string, number>();
  return transactions.map(txn => {
    const key = `${txn.date}|${String(txn.amount_pence)}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return crypto.createHash('sha256').update(`${key}|${String(occurrence)}`).digest('hex');
  });
}

/**
 * Find or create the sentinel bank_connections row for statement imports.
 *
 * Per contracts §2 / §3, bank_connections.access_token_enc and
 * refresh_token_enc are NOT NULL. For the sentinel we store encrypt('')
 * in both columns and use a far-future token_expires_at so no refresh is
 * ever attempted by the normal token-refresh path.
 */
async function findOrCreateStatementConnection(userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM bank_connections WHERE user_id = $1 AND provider = 'statement' LIMIT 1`,
    [userId],
  );
  if (rows.length > 0) return rows[0].id;

  const emptyEnc = encrypt('');
  const farFuture = new Date('2099-12-31T23:59:59Z');

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO bank_connections
       (user_id, provider, access_token_enc, refresh_token_enc, token_expires_at)
     VALUES ($1, 'statement', $2, $3, $4)
     RETURNING id`,
    [userId, emptyEnc, emptyEnc, farFuture],
  );
  return inserted[0].id;
}

/** Find or create the linked_account for the bank account a statement belongs to. */
async function findOrCreateStatementAccount(
  userId: string,
  connectionId: string,
  account: StatementAccount,
): Promise<string> {
  const externalId = `statement:${account.externalId}`;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM linked_accounts WHERE user_id = $1 AND external_id = $2 LIMIT 1`,
    [userId, externalId],
  );
  if (rows.length > 0) return rows[0].id;

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO linked_accounts
       (user_id, connection_id, provider, external_id, account_name, account_type, currency)
     VALUES ($1, $2, 'statement', $3, $4, 'TRANSACTION', 'GBP')
     RETURNING id`,
    [userId, connectionId, externalId, account.name],
  );
  return inserted[0].id;
}

/**
 * Import a parsed statement (PDF, CSV or OFX) for a user.
 *
 * @returns Count of newly inserted (non-duplicate) transactions
 */
export async function importStatement(userId: string, statement: ParsedStatement): Promise<number> {
  const { transactions } = statement;
  if (transactions.length === 0) return 0;

  const connectionId = await findOrCreateStatementConnection(userId);
  const linkedAccountId = await findOrCreateStatementAccount(
    userId,
    connectionId,
    statement.account ?? FALLBACK_ACCOUNT,
  );
  const externalIds = syntheticExternalIds(transactions);

  const newIds: string[] = [];

  for (const [i, txn] of transactions.entries()) {
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
        externalIds[i],
        null,            // merchant_name — null for statement imports; pipeline will categorise
        txn.description,
        txn.amount_pence,
        txn.date,        // transaction_date
        txn.date,        // posted_date (statements carry a single date)
      ],
    );

    if (rows.length > 0) newIds.push(rows[0].id);
  }

  if (newIds.length > 0) {
    await runPipeline(userId, newIds);
  }

  return newIds.length;
}
