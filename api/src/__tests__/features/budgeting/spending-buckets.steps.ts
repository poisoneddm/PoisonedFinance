import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import request from 'supertest';
import { createWorld, type BddWorld } from '../world';

// Delegate the app's pool singleton to the active pg-mem world, so these BDD
// tests run the REAL /spending and /dashboard Express routes and REAL SQL
// against a real (in-memory) Postgres schema — not mocks.
const live: { query: BddWorld['query'] } = {
  query: async () => ({ rows: [] }),
};
jest.mock('@/db/client', () => ({
  pool: { query: (sql: string, params?: unknown[]) => live.query(sql, params) },
}));

import { createApp } from '@/app';

const feature = loadFeature(
  path.join(__dirname, '../../../../../features/budgeting/spending-buckets.feature'),
  { tagFilter: 'not @wip' },
);

const USER = '00000000-0000-0000-0000-000000000001';
const app = createApp();

interface TxnRow {
  merchant: string;
  category: string;
  amount_pence: string;
}

defineFeature(feature, test => {
  let world: BddWorld;
  let res: request.Response;

  let accountId: string | null = null;

  beforeEach(async () => {
    world = await createWorld();
    live.query = world.query;
    accountId = null; // each scenario gets a fresh pg-mem world
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

  async function categoryId(name: string): Promise<string | null> {
    if (!name || name.toLowerCase() === 'null') return null;
    const { rows } = await world.query<{ id: string }>(
      `SELECT id FROM categories WHERE name = $1`,
      [name],
    );
    return rows[0]?.id ?? null;
  }

  async function insertTxn(
    merchant: string,
    category: string,
    amountPence: number,
    isoDate: string,
    extId: string,
  ): Promise<void> {
    const acct = await account();
    const catId = await categoryId(category);
    await world.query(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, category_id, needs_review)
       VALUES ($1, $2, $3, $4, $4, $5, 'GBP', $6, $6, $7, TRUE)`,
      [acct, USER, extId, merchant, amountPence, isoDate, catId],
    );
  }

  async function bucketSpend(month: number, bucket: string): Promise<number> {
    res = await request(app).get(`/spending/${USER}?year=2026&month=${month}`);
    return res.body.goal_bars.find((b: { bucket: string }) => b.bucket === bucket).spent_pence;
  }

  // Background steps (jest-cucumber merges these into each scenario).
  function background(given: any, and: any): void {
    given('a seeded user', () => {});
    and('the following May 2026 transactions exist:', async (table: TxnRow[]) => {
      let i = 0;
      for (const row of table) {
        await insertTxn(row.merchant, row.category, Number(row.amount_pence), '2026-05-15', `bg-${i++}`);
      }
    });
  }

  test('Needs bucket is the sum of debit Groceries, Bills, Fuel, Transport, Health', ({ given, and, when, then }) => {
    background(given, and);
    when('I request spending for May 2026', async () => {
      res = await request(app).get(`/spending/${USER}?year=2026&month=5`);
    });
    then(/^the needs total_pence is (\d+)$/, (v: string) => {
      expect(res.body.goal_bars.find((b: { bucket: string }) => b.bucket === 'needs').spent_pence).toBe(Number(v));
    });
  });

  test('Wants bucket is the sum of debit Eating Out, Shopping, Subscriptions, Entertainment, Travel', ({ given, and, when, then }) => {
    background(given, and);
    when('I request spending for May 2026', async () => {
      res = await request(app).get(`/spending/${USER}?year=2026&month=5`);
    });
    then(/^the wants total_pence is (\d+)$/, (v: string) => {
      expect(res.body.goal_bars.find((b: { bucket: string }) => b.bucket === 'wants').spent_pence).toBe(Number(v));
    });
  });

  test('Savings bucket is money moved to the Savings category', ({ given, and, when, then }) => {
    background(given, and);
    when('I request spending for May 2026', async () => {
      res = await request(app).get(`/spending/${USER}?year=2026&month=5`);
    });
    then(/^the savings total_pence is (\d+)$/, (v: string) => {
      expect(res.body.goal_bars.find((b: { bucket: string }) => b.bucket === 'savings').spent_pence).toBe(Number(v));
    });
  });

  test('Income is the sum of credit transactions excluding Savings', ({ given, and, when, then }) => {
    background(given, and);
    when('I request income for May 2026', async () => {
      res = await request(app).get(`/dashboard/${USER}?year=2026&month=5`);
    });
    then(/^income_pence is (\d+)$/, (v: string) => {
      expect(res.body.income_pence).toBe(Number(v));
    });
  });

  test("A refund (credit) in a spend category reduces that bucket's spend", ({ given, and, when, then }) => {
    background(given, and);
    given(/^a credit refund from Tesco of amount_pence \+?(\d+) categorised as (.+) in May 2026$/, async (
      amount: string,
      category: string,
    ) => {
      await insertTxn('Tesco Refund', category, Number(amount), '2026-05-18', 'refund-1');
    });
    when('I request spending for May 2026', async () => {
      res = await request(app).get(`/spending/${USER}?year=2026&month=5`);
    });
    then(/^the needs total_pence is (\d+)$/, (v: string) => {
      expect(res.body.goal_bars.find((b: { bucket: string }) => b.bucket === 'needs').spent_pence).toBe(Number(v));
    });
  });

  test('transaction_date boundary — transaction posted in May but dated April is excluded', ({ given, and, when, then }) => {
    background(given, and);
    given(/^a transaction with transaction_date "(.*)" and posted_date "(.*)" categorised as (.*)$/, async (
      txnDate: string,
      _postedDate: string,
      category: string,
    ) => {
      await insertTxn('April Groceries', category, -9999, txnDate, 'april-1');
    });
    when('I request spending for May 2026', async () => {
      res = await request(app).get(`/spending/${USER}?year=2026&month=5`);
    });
    then('the needs total_pence does not include that transaction', () => {
      // May needs is just the background needs (78730); the April-dated txn is excluded.
      expect(res.body.goal_bars.find((b: { bucket: string }) => b.bucket === 'needs').spent_pence).toBe(78730);
    });
    and('when I request spending for April 2026 it IS included', async () => {
      const aprilNeeds = await bucketSpend(4, 'needs');
      expect(aprilNeeds).toBe(9999);
    });
  });

  test('Uncategorised transactions do not contribute to any bucket', ({ given, and, when, then }) => {
    background(given, and);
    given(/^a transaction with amount_pence (-?\d+) and no category in May 2026$/, async (amount: string) => {
      await insertTxn('Mystery', 'null', Number(amount), '2026-05-20', 'uncat-1');
    });
    when('I request spending for May 2026', async () => {
      res = await request(app).get(`/spending/${USER}?year=2026&month=5`);
    });
    then('the needs, wants, and savings totals are unchanged', () => {
      const bars = res.body.goal_bars as { bucket: string; spent_pence: number }[];
      expect(bars.find(b => b.bucket === 'needs')!.spent_pence).toBe(78730);
      expect(bars.find(b => b.bucket === 'wants')!.spent_pence).toBe(19949);
      expect(bars.find(b => b.bucket === 'savings')!.spent_pence).toBe(30000);
    });
  });
});
