import { MonthlyGoal } from '@/types/index';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

import { getOrCreateGoal } from '@/lib/goals';

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const existingGoal: MonthlyGoal = {
  id: 'goal-uuid-1',
  user_id: SEED_USER_ID,
  year: 2026,
  month: 6,
  needs_pct: 40,
  wants_pct: 20,
  savings_pct: 40,
};

beforeEach(() => mockQuery.mockReset());

describe('getOrCreateGoal', () => {
  it('returns existing goal when row found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [existingGoal] });
    const result = await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    expect(result).toEqual(existingGoal);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('SELECT');
  });

  it('inserts with defaults when no row found, then returns inserted row', async () => {
    const insertedGoal: MonthlyGoal = { ...existingGoal, id: 'goal-uuid-2' };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })           // SELECT returns nothing
      .mockResolvedValueOnce({ rows: [insertedGoal] }); // INSERT returns row
    const result = await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    expect(result).toEqual(insertedGoal);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const insertCall: string = mockQuery.mock.calls[1][0];
    expect(insertCall).toContain('INSERT INTO monthly_goals');
    expect(insertCall).toContain('ON CONFLICT');
  });

  it('insert uses 40/20/40 defaults', async () => {
    const insertedGoal: MonthlyGoal = { ...existingGoal, id: 'goal-uuid-3' };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [insertedGoal] });
    await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    const insertParams: unknown[] = mockQuery.mock.calls[1][1];
    // params order: user_id, year, month, needs_pct, wants_pct, savings_pct
    expect(insertParams).toContain(40); // needs_pct
    expect(insertParams).toContain(20); // wants_pct
  });

  it('re-selects and returns existing goal when INSERT conflicts', async () => {
    // Simulate race: SELECT empty → INSERT conflicts (returns empty) → re-SELECT finds row
    const racedGoal: MonthlyGoal = { ...existingGoal, id: 'goal-uuid-4' };
    mockQuery
      .mockResolvedValueOnce({ rows: [] })        // first SELECT
      .mockResolvedValueOnce({ rows: [] })        // INSERT ON CONFLICT DO NOTHING returns nothing
      .mockResolvedValueOnce({ rows: [racedGoal] }); // fallback SELECT
    const result = await getOrCreateGoal(SEED_USER_ID, 2026, 6);
    expect(result).toEqual(racedGoal);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
