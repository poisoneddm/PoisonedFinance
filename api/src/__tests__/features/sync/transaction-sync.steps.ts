import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import request from 'supertest';
import { createWorld, type BddWorld } from '../world';
import type { TrueLayerTransaction } from '@/truelayer/types';

// Real DB (pg-mem) + real syncTransactions; only the TrueLayer HTTP call and the
// AI categorisation pipeline are mocked.
const live: { query: BddWorld['query'] } = { query: async () => ({ rows: [] }) };
jest.mock('@/db/client', () => ({
  pool: { query: (sql: string, params?: unknown[]) => live.query(sql, params) },
}));
const mockFetch = jest.fn();
jest.mock('@/truelayer/client', () => ({ fetchTrueLayer: (...a: unknown[]) => mockFetch(...a) }));
jest.mock('@/categorisation/pipeline', () => ({ runPipeline: jest.fn() }));

import { syncTransactions } from '@/truelayer/sync';
import { createApp } from '@/app';

const feature = loadFeature(
  path.join(__dirname, '../../../../../features/sync/transaction-sync.feature'),
  { tagFilter: 'not @wip' },
);

const USER = '00000000-0000-0000-0000-000000000001';
const EXT_ACC = 'ext-acc-1';
const app = createApp();

function tlTxn(overrides: Partial<TrueLayerTransaction>): TrueLayerTransaction {
  return {
    transaction_id: 'txn-001',
    timestamp: '2026-05-31T10:00:00Z',
    transaction_type: 'DEBIT',
    description: 'TESCO STORES',
    merchant_name: 'Tesco Superstore',
    amount: -10,
    currency: 'GBP',
    ...overrides,
  };
}

function isoDate(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

defineFeature(feature, test => {
  let world: BddWorld;
  let linkedAccountId: string;

  beforeEach(async () => {
    world = await createWorld();
    live.query = world.query;
    mockFetch.mockReset();
  });
  afterEach(async () => {
    if (world) await world.teardown();
  });

  async function getByExt(extId: string): Promise<Record<string, unknown>> {
    const { rows } = await world.query(
      `SELECT transaction_date, posted_date, amount_pence, needs_review
       FROM transactions WHERE external_id = $1`,
      [extId],
    );
    return rows[0];
  }

  async function sync(results: TrueLayerTransaction[]): Promise<void> {
    mockFetch.mockResolvedValueOnce({ results, status: 'Succeeded' });
    await syncTransactions(USER, linkedAccountId, EXT_ACC, 'access-token');
  }

  // Background -----------------------------------------------------------------
  function background(given: any): void {
    given('a seeded user with a bank connection exists', async () => {
      const { rows: conns } = await world.query<{ id: string }>(
        `INSERT INTO bank_connections
           (user_id, provider, access_token_enc, refresh_token_enc, token_expires_at)
         VALUES ($1, 'bdd', 'enc', 'enc', '2099-01-01') RETURNING id`,
        [USER],
      );
      const { rows: accts } = await world.query<{ id: string }>(
        `INSERT INTO linked_accounts
           (user_id, connection_id, provider, external_id, account_name, account_type)
         VALUES ($1, $2, 'bdd', $3, 'NatWest', 'current') RETURNING id`,
        [USER, conns[0].id, EXT_ACC],
      );
      linkedAccountId = accts[0].id;
    });
  }

  test('transaction_date uses meta.transaction_time when present', ({ given, when, then }) => {
    background(given);
    when(/^a transaction syncs with timestamp "(.*)" and meta.transaction_time "(.*)"$/, async (ts: string, mt: string) => {
      await sync([tlTxn({ timestamp: ts, meta: { transaction_time: mt } })]);
    });
    then(/^it is stored with transaction_date "(.*)" and posted_date "(.*)"$/, async (td: string, pd: string) => {
      const row = await getByExt('txn-001');
      expect(isoDate(row.transaction_date)).toBe(td);
      expect(isoDate(row.posted_date)).toBe(pd);
    });
  });

  test('transaction_date falls back to timestamp when meta is absent', ({ given, when, then }) => {
    background(given);
    when(/^a transaction syncs with timestamp "(.*)" and no meta.transaction_time$/, async (ts: string) => {
      await sync([tlTxn({ timestamp: ts })]);
    });
    then(/^it is stored with transaction_date "(.*)" and posted_date "(.*)"$/, async (td: string, pd: string) => {
      const row = await getByExt('txn-001');
      expect(isoDate(row.transaction_date)).toBe(td);
      expect(isoDate(row.posted_date)).toBe(pd);
    });
  });

  test('Debit amount is stored as negative integer pence', ({ given, when, then }) => {
    background(given);
    when(/^a debit transaction syncs with amount (-?\d+\.?\d*)$/, async (amount: string) => {
      await sync([tlTxn({ transaction_type: 'DEBIT', amount: Number(amount) })]);
    });
    then(/^it is stored with amount_pence (-?\d+)$/, async (pence: string) => {
      expect((await getByExt('txn-001')).amount_pence).toBe(Number(pence));
    });
  });

  test('Credit amount is stored as positive integer pence', ({ given, when, then }) => {
    background(given);
    when(/^a credit transaction syncs with amount (-?\d+\.?\d*)$/, async (amount: string) => {
      await sync([tlTxn({ transaction_type: 'CREDIT', amount: Number(amount) })]);
    });
    then(/^it is stored with amount_pence (-?\d+)$/, async (pence: string) => {
      expect((await getByExt('txn-001')).amount_pence).toBe(Number(pence));
    });
  });

  test('Duplicate external_id is not re-inserted on re-sync', ({ given, when, then }) => {
    background(given);
    given(/^a transaction with external_id "(.*)" already exists$/, async (extId: string) => {
      await sync([tlTxn({ transaction_id: extId })]);
    });
    when(/^the sync runs again with the same external_id "(.*)"$/, async (extId: string) => {
      await sync([tlTxn({ transaction_id: extId })]);
    });
    then(/^there is still exactly 1 row with external_id "(.*)"$/, async (extId: string) => {
      const { rows } = await world.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM transactions WHERE external_id = $1`,
        [extId],
      );
      expect(Number(rows[0].count)).toBe(1);
    });
  });

  test('New transactions are marked needs_review true after sync', ({ given, when, then }) => {
    background(given);
    when(/^(\d+) new transactions are synced$/, async (n: string) => {
      const txns = Array.from({ length: Number(n) }, (_, i) =>
        tlTxn({ transaction_id: `new-${i}` }),
      );
      await sync(txns);
    });
    then(/^all (\d+) transactions have needs_review = true$/, async (n: string) => {
      const { rows } = await world.query<{ needs_review: boolean }>(
        `SELECT needs_review FROM transactions WHERE user_id = $1`,
        [USER],
      );
      expect(rows).toHaveLength(Number(n));
      expect(rows.every(r => r.needs_review === true)).toBe(true);
    });
  });

  test('All monthly aggregations use transaction_date not posted_date', ({ given, when, then, and }) => {
    background(given);
    let mayNeeds = -1;
    given(/^a transaction with transaction_date "(.*)" and posted_date "(.*)"$/, async (td: string, pd: string) => {
      const { rows: cat } = await world.query<{ id: string }>(
        `SELECT id FROM categories WHERE name = 'Groceries'`,
      );
      await world.query(
        `INSERT INTO transactions
           (account_id, user_id, external_id, merchant_name, description,
            amount_pence, currency, transaction_date, posted_date, category_id, needs_review)
         VALUES ($1, $2, 'boundary-1', 'Tesco', 'Tesco', -5000, 'GBP', $3, $4, $5, TRUE)`,
        [linkedAccountId, USER, td, pd, cat[0].id],
      );
    });
    when('spending for May 2026 is calculated', async () => {
      const res = await request(app).get(`/spending/${USER}?year=2026&month=5`);
      mayNeeds = res.body.goal_bars.find((b: { bucket: string }) => b.bucket === 'needs').spent_pence;
    });
    then('that transaction is excluded from May totals', () => {
      expect(mayNeeds).toBe(0);
    });
    and('that transaction is included in April totals', async () => {
      const res = await request(app).get(`/spending/${USER}?year=2026&month=4`);
      const aprNeeds = res.body.goal_bars.find((b: { bucket: string }) => b.bucket === 'needs').spent_pence;
      expect(aprNeeds).toBe(5000);
    });
  });
});
