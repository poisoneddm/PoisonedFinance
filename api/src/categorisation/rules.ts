import { pool } from '@/db/client';
import type { TxnForCategorisation, CategorizationResult } from './types';

export function normaliseMerchant(merchant: string | null, fallback = ''): string {
  return (merchant ?? fallback).trim().toUpperCase();
}

export async function applyRules(
  userId: string,
  transactions: TxnForCategorisation[],
): Promise<CategorizationResult[]> {
  if (transactions.length === 0) return [];

  // Normalise once, then match every transaction in a single query (no N+1).
  const txnPatterns = transactions.map(t => ({
    id: t.id,
    pattern: normaliseMerchant(t.merchant_name, t.description),
  }));
  const distinctPatterns = [...new Set(txnPatterns.map(p => p.pattern))];

  const { rows } = await pool.query<{ merchant_pattern: string; category_name: string }>(
    `SELECT r.merchant_pattern, c.name AS category_name
     FROM categorisation_rules r
     JOIN categories c ON c.id = r.category_id
     WHERE r.user_id = $1 AND r.merchant_pattern = ANY($2)`,
    [userId, distinctPatterns],
  );

  const categoryByPattern = new Map(rows.map(r => [r.merchant_pattern, r.category_name]));

  const results: CategorizationResult[] = [];
  for (const { id, pattern } of txnPatterns) {
    const categoryName = categoryByPattern.get(pattern);
    if (categoryName) {
      results.push({ id, category_name: categoryName, source: 'rule' });
    }
  }
  return results;
}
