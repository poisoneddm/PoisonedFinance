import { pool } from '@/db/client';
import { applyRules } from './rules';
import { batchCategorise } from './ai';
import type { TxnForCategorisation } from './types';

/** Load the category name→id map once (categories are a small fixed seed set). */
async function loadCategoryMap(): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM categories',
  );
  return new Map(rows.map(r => [r.name, r.id]));
}

async function applyCategoryToTransaction(
  userId: string,
  txnId: string,
  categoryId: string,
  source: 'rule' | 'ai',
): Promise<void> {
  const needsReview = source === 'ai';
  await pool.query(
    `UPDATE transactions
     SET category_id = $1,
         categorisation_source = $2,
         needs_review = ${needsReview ? 'TRUE' : 'FALSE'}
     WHERE id = $3 AND user_id = $4`,
    [categoryId, source, txnId, userId],
  );
}

export async function runPipeline(userId: string, transactionIds: string[]): Promise<void> {
  if (transactionIds.length === 0) return;

  const { rows } = await pool.query<TxnForCategorisation>(
    `SELECT id, merchant_name, description
     FROM transactions
     WHERE id = ANY($1) AND user_id = $2 AND category_id IS NULL`,
    [transactionIds, userId],
  );
  if (rows.length === 0) return;

  const ruleResults = await applyRules(userId, rows);
  const ruleMatchedIds = new Set(ruleResults.map(r => r.id));
  const unmatched = rows.filter(t => !ruleMatchedIds.has(t.id));

  const aiResultsRaw = await batchCategorise(unmatched);
  // C3: only trust AI results whose id was actually in the batch we sent, so a
  // hallucinated/echoed id can never address another transaction.
  const unmatchedIds = new Set(unmatched.map(t => t.id));
  const aiResults = aiResultsRaw.filter(r => unmatchedIds.has(r.id));

  const categoryMap = await loadCategoryMap();

  for (const result of [...ruleResults, ...aiResults]) {
    const categoryId = categoryMap.get(result.category_name);
    if (!categoryId) continue; // unknown category — leave for manual review
    await applyCategoryToTransaction(userId, result.id, categoryId, result.source);
  }
}
