import { pool } from '@/db/client';
import { applyRules } from './rules';
import { batchCategorise } from './claude';
import type { TxnForCategorisation } from './types';

async function applyCategoryToTransaction(
  txnId: string,
  categoryName: string,
  source: 'rule' | 'ai',
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM categories WHERE name = $1',
    [categoryName],
  );
  if (rows.length === 0) return; // unknown category — leave for manual review

  const needsReview = source === 'ai';
  await pool.query(
    `UPDATE transactions
     SET category_id = $1,
         categorisation_source = $2,
         needs_review = ${needsReview ? 'TRUE' : 'FALSE'}
     WHERE id = $3`,
    [rows[0].id, source, txnId],
  );
}

export async function runPipeline(userId: string, transactionIds: string[]): Promise<void> {
  if (transactionIds.length === 0) return;

  const { rows } = await pool.query<TxnForCategorisation>(
    `SELECT id, merchant_name, description
     FROM transactions
     WHERE id = ANY($1) AND category_id IS NULL`,
    [transactionIds],
  );
  if (rows.length === 0) return;

  const ruleResults = await applyRules(userId, rows);
  const ruleMatchedIds = new Set(ruleResults.map(r => r.id));
  const unmatched = rows.filter(t => !ruleMatchedIds.has(t.id));

  const aiResults = await batchCategorise(unmatched);

  for (const result of [...ruleResults, ...aiResults]) {
    await applyCategoryToTransaction(result.id, result.category_name, result.source);
  }
}
