import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import request from 'supertest';
import { createWorld, type BddWorld } from '../world';

// Delegate the app's pool to the active pg-mem world — real /income and
// /dashboard routes + real lib/income SQL against a real schema.
const live: { query: BddWorld['query'] } = { query: async () => ({ rows: [] }) };
jest.mock('@/db/client', () => ({
  pool: { query: (sql: string, params?: unknown[]) => live.query(sql, params) },
}));

import { createApp } from '@/app';

const feature = loadFeature(
  path.join(__dirname, '../../../../../features/budgeting/expected-income.feature'),
  { tagFilter: 'not @wip' },
);

const USER = '00000000-0000-0000-0000-000000000001';
const app = createApp();

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

defineFeature(feature, test => {
  let world: BddWorld;
  let res: request.Response;
  let accountId: string | null;

  beforeEach(async () => {
    world = await createWorld();
    live.query = world.query;
    accountId = null;
  });
  afterEach(async () => {
    if (world) await world.teardown();
  });

  async function account(): Promise<string> {
    if (accountId) return accountId;
    const { rows: conns } = await world.query<{ id: string }>(
      `INSERT INTO bank_connections
         (user_id, provider, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES ($1, 'bdd', 'enc', 'enc', '2099-01-01') RETURNING id`,
      [USER],
    );
    const { rows: accts } = await world.query<{ id: string }>(
      `INSERT INTO linked_accounts
         (user_id, connection_id, provider, external_id, account_name, account_type)
       VALUES ($1, $2, 'bdd', 'bdd-acct', 'BDD Account', 'current') RETURNING id`,
      [USER, conns[0].id],
    );
    accountId = accts[0].id;
    return accountId;
  }

  async function seedIncome(amount: number, monthName: string): Promise<void> {
    const m = MONTHS[monthName];
    const date = `2026-${String(m).padStart(2, '0')}-15`;
    await world.query(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, needs_review)
       VALUES ($1, $2, $3, 'EMPLOYER', 'SALARY', $4, 'GBP', $5, $5, FALSE)`,
      [await account(), USER, `inc-${monthName}`, amount, date],
    );
  }

  const seededUser = (given: any) => given('a seeded user', () => {});
  const givenIncome = (fn: any) =>
    fn(/^actual income of (\d+) pence in (\w+) 2026$/, async (amount: string, monthName: string) => {
      await seedIncome(Number(amount), monthName);
    });
  const setExpected = (fn: any) =>
    fn(/^I set expected income for (\w+) 2026 to (\d+) pence$/, async (monthName: string, amount: string) => {
      res = await request(app).put(`/income/${USER}`).send({ year: 2026, month: MONTHS[monthName], expected_pence: Number(amount) });
    });

  test("With no history and no override, expected income falls back to this month's actual", ({ given, when, then }) => {
    seededUser(given);
    givenIncome(given);
    when(/^I request income for (\w+) 2026$/, async (monthName: string) => {
      res = await request(app).get(`/income/${USER}?year=2026&month=${MONTHS[monthName]}`);
    });
    then(/^the expected income is (\d+) with source "(\w+)"$/, (amount: string, source: string) => {
      expect(res.body.expected_pence).toBe(Number(amount));
      expect(res.body.source).toBe(source);
    });
  });

  test("Expected income is suggested from the trailing months' average", ({ given, and, when, then }) => {
    seededUser(given);
    givenIncome(given);
    givenIncome(and);
    givenIncome(and);
    when(/^I request income for (\w+) 2026$/, async (monthName: string) => {
      res = await request(app).get(`/income/${USER}?year=2026&month=${MONTHS[monthName]}`);
    });
    then(/^the expected income is (\d+) with source "(\w+)"$/, (amount: string, source: string) => {
      expect(res.body.expected_pence).toBe(Number(amount));
      expect(res.body.source).toBe(source);
    });
  });

  test('A confirmed override is used and reported as confirmed', ({ given, when, then }) => {
    seededUser(given);
    setExpected(when);
    then(/^the expected income is (\d+) with source "(\w+)"$/, (amount: string, source: string) => {
      // PUT returns the refreshed expected-income payload.
      expect(res.body.expected_pence).toBe(Number(amount));
      expect(res.body.source).toBe(source);
    });
  });

  test('Budget goal amounts derive from expected income', ({ given, when, and, then }) => {
    seededUser(given);
    setExpected(when);
    and(/^I request the dashboard for (\w+) 2026$/, async (monthName: string) => {
      res = await request(app).get(`/dashboard/${USER}?year=2026&month=${MONTHS[monthName]}`);
    });
    const goalFor = (bucket: string) =>
      res.body.pills.find((p: { bucket: string }) => p.bucket === bucket).goal_pence;
    then(/^the needs goal_pence is (\d+)$/, (v: string) => expect(goalFor('needs')).toBe(Number(v)));
    and(/^the savings goal_pence is (\d+)$/, (v: string) => expect(goalFor('savings')).toBe(Number(v)));
  });

  test('Clearing the override returns to the suggested figure', ({ given, and, when, then }) => {
    seededUser(given);
    givenIncome(given);
    setExpected(and);
    when(/^I clear the expected income override for (\w+) 2026$/, async (monthName: string) => {
      res = await request(app).put(`/income/${USER}`).send({ year: 2026, month: MONTHS[monthName], expected_pence: null });
    });
    then(/^the expected income is (\d+) with source "(\w+)"$/, (amount: string, source: string) => {
      expect(res.body.expected_pence).toBe(Number(amount));
      expect(res.body.source).toBe(source);
    });
  });
});
