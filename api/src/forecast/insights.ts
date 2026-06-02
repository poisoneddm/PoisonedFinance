import { Pool } from 'pg';

export type CalloutKind = 'consistent' | 'increasing' | 'suggestion';

export interface TrendCallout {
  kind: CalloutKind;
  text: string;
  category?: string;
}

interface CategoryMonthRow {
  category_name: string;
  month_start: string;
  spend_pence: number;
}

interface CategoryStats {
  name: string;
  monthlySpend: number[];  // sorted oldest → newest
  mean: number;
  prior3Mean: number;      // mean of first 3 months
  recent3Mean: number;     // mean of last 3 months
}

/** Format integer pence as £X,XXX (whole pounds, no decimal) for callout text. */
function fmtPounds(pence: number): string {
  return '£' + Math.round(pence / 100).toLocaleString('en-GB');
}

/**
 * Build per-category stats from raw query rows.
 * Rows are grouped by category_name; monthlySpend is sorted by month_start ASC.
 */
function buildStats(rows: CategoryMonthRow[]): CategoryStats[] {
  const byCategory = new Map<string, number[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category_name)) byCategory.set(row.category_name, []);
    byCategory.get(row.category_name)!.push(row.spend_pence);
  }

  return Array.from(byCategory.entries()).map(([name, spend]) => {
    const mean = spend.reduce((a, b) => a + b, 0) / spend.length;
    const prior3 = spend.slice(0, 3);
    const recent3 = spend.slice(-3);
    const prior3Mean = prior3.reduce((a, b) => a + b, 0) / Math.max(prior3.length, 1);
    const recent3Mean = recent3.reduce((a, b) => a + b, 0) / Math.max(recent3.length, 1);
    return { name, monthlySpend: spend, mean, prior3Mean, recent3Mean };
  });
}

/**
 * Produce structured spending-trend callouts for the Forecast screen.
 *
 * Callout kinds (contracts spec, design §"Savings Forecast Screen"):
 *   consistent  — a category whose 6-month spend is stable (max deviation ≤ 10% of mean)
 *   increasing  — a category whose recent-3-month spend is >10% above prior-3-month spend
 *   suggestion  — "Reduce X to 3-month average saves ~£Y/month" for the most-increased category
 *
 * A single query fetches 6 months of per-category monthly spend using transaction_date (§5).
 */
export async function spendingTrends(pool: Pool, userId: string): Promise<TrendCallout[]> {
  const sql = `
    SELECT
      c.name AS category_name,
      DATE_TRUNC('month', t.transaction_date)::TEXT AS month_start,
      SUM(-t.amount_pence) AS spend_pence
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = $1
      AND t.amount_pence < 0
      AND t.transaction_date >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
      AND t.transaction_date < DATE_TRUNC('month', NOW())
    GROUP BY c.name, DATE_TRUNC('month', t.transaction_date)
    ORDER BY c.name, DATE_TRUNC('month', t.transaction_date)
  `;

  const { rows: rawRows } = await pool.query(sql, [userId]);
  const rows: CategoryMonthRow[] = rawRows.map(r => ({
    category_name: r.category_name,
    month_start: r.month_start,
    spend_pence: Math.round(Number(r.spend_pence)),
  }));

  const stats = buildStats(rows);
  const callouts: TrendCallout[] = [];

  // --- Consistent callout: pick the first category with max deviation ≤ 10% of mean ---
  for (const s of stats) {
    if (s.monthlySpend.length < 2) continue;
    const maxDev = Math.max(...s.monthlySpend.map(v => Math.abs(v - s.mean)));
    const devPct = s.mean > 0 ? maxDev / s.mean : 0;
    if (devPct <= 0.10) {
      callouts.push({
        kind: 'consistent',
        text: `Your ${s.name} spend has been consistent at ${fmtPounds(s.mean)}/month over the last 6 months.`,
        category: s.name,
      });
      break; // one consistent callout is sufficient
    }
  }

  // --- Increasing callouts and suggestion tracking ---
  let biggestIncreaseDelta = 0;
  let biggestIncreaseCategory: CategoryStats | null = null;

  for (const s of stats) {
    if (s.monthlySpend.length < 6) continue; // need both halves
    if (s.prior3Mean <= 0) continue;
    const riseRatio = (s.recent3Mean - s.prior3Mean) / s.prior3Mean;
    if (riseRatio > 0.10) {
      callouts.push({
        kind: 'increasing',
        text: `Your ${s.name} spend is increasing — ${fmtPounds(s.prior3Mean)}/month → ${fmtPounds(s.recent3Mean)}/month over the last 3 months.`,
        category: s.name,
      });

      const delta = s.recent3Mean - s.prior3Mean;
      if (delta > biggestIncreaseDelta) {
        biggestIncreaseDelta = delta;
        biggestIncreaseCategory = s;
      }
    }
  }

  // --- Suggestion callout: largest-increased category (if any were increasing) ---
  if (biggestIncreaseCategory !== null) {
    const saving = Math.round(biggestIncreaseCategory.recent3Mean - biggestIncreaseCategory.prior3Mean);
    callouts.push({
      kind: 'suggestion',
      text: `Reduce ${biggestIncreaseCategory.name} to its 3-month average saves ~${fmtPounds(saving)}/month.`,
      category: biggestIncreaseCategory.name,
    });
  }

  return callouts;
}
