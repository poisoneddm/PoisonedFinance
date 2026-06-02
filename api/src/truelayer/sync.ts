import { pool } from '@/db/client';
import { fetchTrueLayer } from './client';
import { runPipeline } from '@/categorisation/pipeline';
import type { TrueLayerAccount, TrueLayerApiResponse, TrueLayerTransaction } from './types';

export async function syncAccounts(
  userId: string,
  connectionId: string,
  accessToken: string,
): Promise<void> {
  const data = await fetchTrueLayer<TrueLayerApiResponse<TrueLayerAccount>>(
    '/data/v1/accounts',
    accessToken,
  );
  for (const acct of data.results) {
    await pool.query(
      `INSERT INTO linked_accounts
         (user_id, connection_id, external_id, account_name, account_type, currency)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, external_id) DO UPDATE
         SET account_name = EXCLUDED.account_name,
             account_type = EXCLUDED.account_type,
             connection_id = EXCLUDED.connection_id`,
      [userId, connectionId, acct.account_id, acct.display_name, acct.account_type, acct.currency],
    );
  }
}

export async function syncTransactions(
  userId: string,
  linkedAccountId: string,
  externalAccountId: string,
  accessToken: string,
): Promise<void> {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const data = await fetchTrueLayer<TrueLayerApiResponse<TrueLayerTransaction>>(
    `/data/v1/accounts/${externalAccountId}/transactions?from=${from}&to=${to}`,
    accessToken,
  );

  const newIds: string[] = [];

  for (const txn of data.results) {
    const postedDate = txn.timestamp.slice(0, 10);
    const transactionDate = txn.meta?.transaction_time
      ? txn.meta.transaction_time.slice(0, 10)
      : postedDate;
    const amountPence = Math.round(txn.amount * 100);

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, needs_review)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, TRUE)
       ON CONFLICT (account_id, external_id) DO NOTHING
       RETURNING id`,
      [
        linkedAccountId, userId, txn.transaction_id,
        txn.merchant_name ?? null, txn.description,
        amountPence, txn.currency,
        transactionDate, postedDate,
      ],
    );
    if (rows.length > 0) newIds.push(rows[0].id);
  }

  if (newIds.length > 0) {
    await runPipeline(userId, newIds);
  }
}
