import { monthlyAverages } from '@/forecast/trends';
import { Pool } from 'pg';

// Each call to mockPool.query() will be configured per test.
const mockQuery = jest.fn();
const mockPool = { query: mockQuery } as unknown as Pool;

const USER = '00000000-0000-0000-0000-000000000001';

beforeEach(() => mockQuery.mockReset());

// Helper: build the row the SQL returns for one trailing-month bucket.
// The real query returns one row with avg_income_pence, avg_needs_pence, avg_wants_pence.
function makeAvgRow(income: number, needs: number, wants: number) {
  return { rows: [{ avg_income_pence: String(income), avg_needs_pence: String(needs), avg_wants_pence: String(wants) }] };
}

describe('monthlyAverages', () => {
  it('returns integer averages from the database row', async () => {
    // income 3000_00, needs 1000_00, wants 600_00
    mockQuery.mockResolvedValueOnce(makeAvgRow(300000, 100000, 60000));

    const result = await monthlyAverages(mockPool, USER);

    expect(result).toEqual({
      avg_income_pence: 300000,
      avg_needs_pence: 100000,
      avg_wants_pence: 60000,
    });
  });

  it('defaults to 6 trailing months and queries with correct userId', async () => {
    mockQuery.mockResolvedValueOnce(makeAvgRow(200000, 80000, 40000));

    await monthlyAverages(mockPool, USER);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain(USER);
    // months count is passed as a bound parameter (safe SQL), not inlined.
    expect(params).toContain('6');
    expect(sql).toContain('transaction_date');
  });

  it('accepts a custom months parameter', async () => {
    mockQuery.mockResolvedValueOnce(makeAvgRow(150000, 50000, 20000));

    await monthlyAverages(mockPool, USER, 3);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain(USER);
    // The query should bound to 3 months, not 6 — passed as a bound parameter.
    expect(params).toContain('3');
  });

  it('returns zeros when no data exists (NULL averages coerced to 0)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_income_pence: null, avg_needs_pence: null, avg_wants_pence: null }] });

    const result = await monthlyAverages(mockPool, USER);

    expect(result).toEqual({
      avg_income_pence: 0,
      avg_needs_pence: 0,
      avg_wants_pence: 0,
    });
  });

  it('returns integers (truncates fractional pence from AVG)', async () => {
    // e.g. AVG over 3 months: 100001 + 100002 + 100000 = 300003 / 3 = 100001.0 — exact
    // but simulate a fractional string from pg driver
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_income_pence: '100001.666', avg_needs_pence: '50000.333', avg_wants_pence: '25000.999' }] });

    const result = await monthlyAverages(mockPool, USER);

    expect(Number.isInteger(result.avg_income_pence)).toBe(true);
    expect(Number.isInteger(result.avg_needs_pence)).toBe(true);
    expect(Number.isInteger(result.avg_wants_pence)).toBe(true);
    // Math.round(100001.666) = 100002
    expect(result.avg_income_pence).toBe(100002);
  });
});
