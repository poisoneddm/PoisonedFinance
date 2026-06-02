import { pool } from '@/db/client';
import type { TxnForCategorisation, CategorizationResult } from './types';

export function normaliseMerchant(merchant: string | null, fallback = ''): string {
  return (merchant ?? fallback).trim().toUpperCase();
}

export async function applyRules(
  userId: string,
  transactions: TxnForCategorisation[],
): Promise<CategorizationResult[]> {
  const results: CategorizationResult[] = [];

  for (const txn of transactions) {
    const pattern = normaliseMerchant(txn.merchant_name, txn.description);
    const { rows } = await pool.query<{ merchant_pattern: string; category_name: string }>(
      `SELECT r.merchant_pattern, c.name AS category_name
       FROM categorisation_rules r
       JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = $1 AND r.merchant_pattern = $2`,
      [userId, pattern],
    );
    if (rows.length > 0) {
      results.push({ id: txn.id, category_name: rows[0].category_name, source: 'rule' });
    }
  }

  return results;
}
