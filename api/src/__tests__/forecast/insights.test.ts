import { spendingTrends, TrendCallout } from '@/forecast/insights';
import { Pool } from 'pg';

const mockQuery = jest.fn();
const mockPool = { query: mockQuery } as unknown as Pool;
const USER = '00000000-0000-0000-0000-000000000001';

beforeEach(() => mockQuery.mockReset());

// The function issues two queries:
//   Query 1: 6-month per-category monthly totals (consistent + increasing detection)
//   Query 2: 3-month per-category monthly totals (recent half for suggestion)
// We build helpers to mock both in sequence.

/**
 * Build rows for the 6-month query.
 * Each row: { category_name, month_start, spend_pence }
 */
function sixMonthRows(rows: { category_name: string; month_start: string; spend_pence: number }[]) {
  return { rows: rows.map(r => ({ ...r, spend_pence: String(r.spend_pence) })) };
}

describe('spendingTrends — consistent callout', () => {
  it('emits a "consistent" callout for a stable category', async () => {
    // Groceries: same spend every month for 6 months → max deviation 0% → consistent
    const groceriesRows = [1, 2, 3, 4, 5, 6].map(i => ({
      category_name: 'Groceries',
      month_start: `2025-${String(i + 6).padStart(2, '0')}-01`,
      spend_pence: 50000,
    }));
    // Use a second category to ensure we pick the right one
    const eatingRows = [1, 2, 3, 4, 5, 6].map(i => ({
      category_name: 'Eating Out',
      month_start: `2025-${String(i + 6).padStart(2, '0')}-01`,
      spend_pence: i * 10000, // very variable — not consistent
    }));

    mockQuery.mockResolvedValueOnce(sixMonthRows([...groceriesRows, ...eatingRows]));

    const callouts = await spendingTrends(mockPool, USER);
    const consistent = callouts.filter(c => c.kind === 'consistent');
    expect(consistent.length).toBeGreaterThanOrEqual(1);
    expect(consistent[0].category).toBe('Groceries');
    expect(consistent[0].text).toContain('Groceries');
    expect(consistent[0].text).toContain('consistent');
  });
});

describe('spendingTrends — increasing callout', () => {
  it('emits an "increasing" callout when recent 3 months > prior 3 months by >10%', async () => {
    // Shopping: prior 3 months avg £200, recent 3 months avg £300 (50% increase → increasing)
    const shoppingRows = [
      { category_name: 'Shopping', month_start: '2025-07-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-08-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-09-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-10-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-11-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-12-01', spend_pence: 30000 },
    ];

    mockQuery.mockResolvedValueOnce(sixMonthRows(shoppingRows));

    const callouts = await spendingTrends(mockPool, USER);
    const increasing = callouts.filter(c => c.kind === 'increasing');
    expect(increasing.length).toBeGreaterThanOrEqual(1);
    const s = increasing.find(c => c.category === 'Shopping')!;
    expect(s).toBeDefined();
    expect(s.text).toContain('Shopping');
    expect(s.text).toContain('increasing');
    // Should mention old → new figures (£200 → £300)
    expect(s.text).toMatch(/£200/);
    expect(s.text).toMatch(/£300/);
  });

  it('does NOT emit increasing for a category with <=10% rise', async () => {
    // Transport: prior avg 10000, recent avg 10900 (9% rise — below threshold)
    const transportRows = [
      { category_name: 'Transport', month_start: '2025-07-01', spend_pence: 10000 },
      { category_name: 'Transport', month_start: '2025-08-01', spend_pence: 10000 },
      { category_name: 'Transport', month_start: '2025-09-01', spend_pence: 10000 },
      { category_name: 'Transport', month_start: '2025-10-01', spend_pence: 10900 },
      { category_name: 'Transport', month_start: '2025-11-01', spend_pence: 10900 },
      { category_name: 'Transport', month_start: '2025-12-01', spend_pence: 10900 },
    ];

    mockQuery.mockResolvedValueOnce(sixMonthRows(transportRows));

    const callouts = await spendingTrends(mockPool, USER);
    const increasing = callouts.filter(c => c.kind === 'increasing' && c.category === 'Transport');
    expect(increasing.length).toBe(0);
  });
});

describe('spendingTrends — suggestion callout', () => {
  it('emits a "suggestion" for the most-increased category', async () => {
    // Shopping: prior avg £200, recent avg £300 → saving = 300 - 200 = £1/month (in pence: 10000)
    const shoppingRows = [
      { category_name: 'Shopping', month_start: '2025-07-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-08-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-09-01', spend_pence: 20000 },
      { category_name: 'Shopping', month_start: '2025-10-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-11-01', spend_pence: 30000 },
      { category_name: 'Shopping', month_start: '2025-12-01', spend_pence: 30000 },
    ];

    mockQuery.mockResolvedValueOnce(sixMonthRows(shoppingRows));

    const callouts = await spendingTrends(mockPool, USER);
    const suggestions = callouts.filter(c => c.kind === 'suggestion');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const sug = suggestions[0];
    expect(sug.text).toContain('Shopping');
    expect(sug.text).toContain('saves');
    // saving = 30000 - 20000 = 10000 pence = £100 → text mentions £100
    expect(sug.text).toMatch(/£100/);
    expect(sug.text).toContain('/month');
  });

  it('does NOT emit a suggestion when no category is increasing', async () => {
    // All flat spend — no increases
    const flatRows = ['Groceries', 'Transport'].flatMap(cat =>
      [1, 2, 3, 4, 5, 6].map(i => ({
        category_name: cat,
        month_start: `2025-${String(i + 6).padStart(2, '0')}-01`,
        spend_pence: 30000,
      })),
    );

    mockQuery.mockResolvedValueOnce(sixMonthRows(flatRows));

    const callouts = await spendingTrends(mockPool, USER);
    expect(callouts.filter(c => c.kind === 'suggestion')).toHaveLength(0);
  });
});
