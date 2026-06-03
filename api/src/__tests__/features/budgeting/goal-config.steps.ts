import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import request from 'supertest';
import { createWorld, type BddWorld } from '../world';

// Route handlers import the `pool` singleton from '@/db/client'. We mock it with
// a stable object whose query() delegates to whichever pg-mem world is active
// for the current scenario — so these BDD tests exercise the REAL Express routes
// and REAL SQL against a real (in-memory) Postgres schema, not mocks.
const live: { query: BddWorld['query'] } = {
  query: async () => ({ rows: [] }),
};
jest.mock('@/db/client', () => ({
  pool: { query: (sql: string, params?: unknown[]) => live.query(sql, params) },
}));

import { createApp } from '@/app';

const feature = loadFeature(
  path.join(__dirname, '../../../../../features/budgeting/goal-config.feature'),
  { tagFilter: 'not @wip' },
);

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';
const app = createApp();

defineFeature(feature, test => {
  let world: BddWorld;
  let res: request.Response;

  beforeEach(async () => {
    world = await createWorld();
    live.query = world.query;
  });

  afterEach(async () => {
    if (world) await world.teardown();
  });

  async function seedCreditTransaction(amountPence: number, isoDate: string): Promise<void> {
    const { rows: conns } = await world.query<{ id: string }>(
      `INSERT INTO bank_connections
         (user_id, provider, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES ($1, 'bdd', 'enc', 'enc', '2099-01-01') RETURNING id`,
      [SEED_USER_ID],
    );
    const { rows: accts } = await world.query<{ id: string }>(
      `INSERT INTO linked_accounts
         (user_id, connection_id, provider, external_id, account_name, account_type)
       VALUES ($1, $2, 'bdd', 'bdd-acct', 'BDD Account', 'current') RETURNING id`,
      [SEED_USER_ID, conns[0].id],
    );
    await world.query(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, needs_review)
       VALUES ($1, $2, 'income-1', 'EMPLOYER', 'SALARY', $3, 'GBP', $4, $4, FALSE)`,
      [accts[0].id, SEED_USER_ID, amountPence, isoDate],
    );
  }

  // Background: the seed user is created by migration 003 in the pg-mem world.
  const seededUser = (given: (m: string | RegExp, fn: () => void) => void) =>
    given('a seeded user', () => {});

  test('Default goals are auto-seeded as 40/20/40 for a new month', ({ given, when, then }) => {
    seededUser(given);
    when('I request goals for June 2026 for the first time', async () => {
      res = await request(app).get(`/goals/${SEED_USER_ID}?year=2026&month=6`);
    });
    then('the response has needs_pct 40, wants_pct 20, savings_pct 40', () => {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ needs_pct: 40, wants_pct: 20, savings_pct: 40 });
    });
  });

  test('Auto-seeding is idempotent — requesting twice creates exactly one row', ({ given, when, and, then }) => {
    seededUser(given);
    when('I request goals for July 2026', async () => {
      await request(app).get(`/goals/${SEED_USER_ID}?year=2026&month=7`);
    });
    and('I request goals for July 2026 again', async () => {
      await request(app).get(`/goals/${SEED_USER_ID}?year=2026&month=7`);
    });
    then('there is exactly 1 goal row for July 2026', async () => {
      const { rows } = await world.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM monthly_goals
         WHERE user_id = $1 AND year = 2026 AND month = 7`,
        [SEED_USER_ID],
      );
      expect(Number(rows[0].count)).toBe(1);
    });
  });

  test('User can update goal percentages that sum to 100', ({ given, when, then, and }) => {
    seededUser(given);
    when('I PUT goals for May 2026 with needs_pct 50, wants_pct 10, savings_pct 40', async () => {
      res = await request(app)
        .put(`/goals/${SEED_USER_ID}`)
        .send({ year: 2026, month: 5, needs_pct: 50, wants_pct: 10, savings_pct: 40 });
    });
    then('the response status is 200', () => {
      expect(res.status).toBe(200);
    });
    and('the stored goals are needs_pct 50, wants_pct 10, savings_pct 40', async () => {
      const { rows } = await world.query(
        `SELECT needs_pct, wants_pct, savings_pct FROM monthly_goals
         WHERE user_id = $1 AND year = 2026 AND month = 5`,
        [SEED_USER_ID],
      );
      expect(rows[0]).toMatchObject({ needs_pct: 50, wants_pct: 10, savings_pct: 40 });
    });
  });

  test('Goal goal amounts are derived from income and percentages', ({ given, and, when, then }) => {
    seededUser(given);
    given(/^income for May 2026 is (\d+) pence$/, async (amount: string) => {
      await seedCreditTransaction(Number(amount), '2026-05-15');
    });
    and('the May 2026 goals are needs_pct 40, wants_pct 20, savings_pct 40', async () => {
      await request(app)
        .put(`/goals/${SEED_USER_ID}`)
        .send({ year: 2026, month: 5, needs_pct: 40, wants_pct: 20, savings_pct: 40 });
    });
    when('I request the dashboard for May 2026', async () => {
      res = await request(app).get(`/dashboard/${SEED_USER_ID}?year=2026&month=5`);
    });
    const goalFor = (bucket: string) =>
      res.body.pills.find((p: { bucket: string }) => p.bucket === bucket).goal_pence;
    then(/^the needs goal_pence is (\d+)$/, (v: string) => {
      expect(goalFor('needs')).toBe(Number(v));
    });
    and(/^the wants goal_pence is (\d+)$/, (v: string) => {
      expect(goalFor('wants')).toBe(Number(v));
    });
    and(/^the savings goal_pence is (\d+)$/, (v: string) => {
      expect(goalFor('savings')).toBe(Number(v));
    });
  });

  test('Goal update rejected when percentages do not sum to 100', ({ given, when, then, and }) => {
    seededUser(given);
    when('I PUT goals for May 2026 with needs_pct 50, wants_pct 30, savings_pct 30', async () => {
      res = await request(app)
        .put(`/goals/${SEED_USER_ID}`)
        .send({ year: 2026, month: 5, needs_pct: 50, wants_pct: 30, savings_pct: 30 });
    });
    then('the response status is 400', () => {
      expect(res.status).toBe(400);
    });
    and('the existing goals are unchanged', async () => {
      // The invalid split must never be persisted — no May row with needs_pct 50.
      const { rows } = await world.query<{ needs_pct: number }>(
        `SELECT needs_pct FROM monthly_goals
         WHERE user_id = $1 AND year = 2026 AND month = 5`,
        [SEED_USER_ID],
      );
      expect(rows.find(r => r.needs_pct === 50)).toBeUndefined();
    });
  });

  test('Goal update rejected when a percentage is negative', ({ given, when, then }) => {
    seededUser(given);
    when('I PUT goals for May 2026 with needs_pct -10, wants_pct 60, savings_pct 50', async () => {
      res = await request(app)
        .put(`/goals/${SEED_USER_ID}`)
        .send({ year: 2026, month: 5, needs_pct: -10, wants_pct: 60, savings_pct: 50 });
    });
    then('the response status is 400', () => {
      expect(res.status).toBe(400);
    });
  });
});
