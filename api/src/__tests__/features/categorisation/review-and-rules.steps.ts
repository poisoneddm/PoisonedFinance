import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import request from 'supertest';
import { createWorld, type BddWorld } from '../world';

// Delegate the app's pool to the active pg-mem world so the REAL /review routes
// (confirm / change / rule-creation / queue) run against a real schema.
const live: { query: BddWorld['query'] } = { query: async () => ({ rows: [] }) };
jest.mock('@/db/client', () => ({
  pool: { query: (sql: string, params?: unknown[]) => live.query(sql, params) },
}));

import { createApp } from '@/app';

const feature = loadFeature(
  path.join(__dirname, '../../../../../features/categorisation/review-and-rules.feature'),
  { tagFilter: 'not @wip' },
);

const USER = '00000000-0000-0000-0000-000000000001';
const app = createApp();

/**
 * jest-cucumber treats the first row of a 2-column vertical table as the header,
 * so reconstruct the original key→value dictionary (including that header pair).
 */
function kv(table: Array<Record<string, string>>): Record<string, string> {
  const cols = Object.keys(table[0]);
  const dict: Record<string, string> = { [cols[0]]: cols[1] };
  for (const row of table) dict[row[cols[0]]] = row[cols[1]];
  return dict;
}

const nullable = (v: string | undefined): string | null =>
  v === undefined || v === 'NULL' ? null : v;

defineFeature(feature, test => {
  let world: BddWorld;
  let res: request.Response;
  let handles: Map<string, string>;
  let lastHandle: string;
  let accountId: string | null;

  beforeEach(async () => {
    world = await createWorld();
    live.query = world.query;
    handles = new Map();
    lastHandle = '';
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
       VALUES ($1, $2, 'bdd', 'bdd-acct', 'Halifax', 'current') RETURNING id`,
      [USER, conns[0].id],
    );
    accountId = accts[0].id;
    return accountId;
  }

  async function categoryId(name: string | null): Promise<string | null> {
    if (!name || name === 'NULL') return null;
    const { rows } = await world.query<{ id: string }>(
      `SELECT id FROM categories WHERE name = $1`,
      [name],
    );
    return rows[0]?.id ?? null;
  }

  async function seedTxn(
    handle: string,
    opts: {
      source?: string | null;
      needsReview?: boolean;
      categoryName?: string | null;
      merchantName?: string | null;
      description?: string;
    },
  ): Promise<string> {
    const acct = await account();
    const catId = await categoryId(opts.categoryName ?? null);
    const merchant = nullable(opts.merchantName ?? undefined);
    const description = opts.description ?? merchant ?? 'TXN';
    const source = nullable(opts.source ?? undefined);
    const needsReview = opts.needsReview ?? true;
    const { rows } = await world.query<{ id: string }>(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, category_id,
          categorisation_source, needs_review)
       VALUES ($1, $2, $3, $4, $5, -1000, 'GBP', '2026-05-01', $6, $7, $8)
       RETURNING id`,
      [acct, USER, handle, merchant, description, catId, source, needsReview],
    );
    handles.set(handle, rows[0].id);
    lastHandle = handle;
    return rows[0].id;
  }

  async function txnRow(handle: string): Promise<Record<string, unknown>> {
    const { rows } = await world.query(
      `SELECT t.categorisation_source, t.needs_review, c.name AS category_name
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [handles.get(handle)],
    );
    return rows[0];
  }

  async function rules(): Promise<Array<{ merchant_pattern: string }>> {
    const { rows } = await world.query<{ merchant_pattern: string }>(
      `SELECT merchant_pattern FROM categorisation_rules WHERE user_id = $1`,
      [USER],
    );
    return rows;
  }

  // ── Background (seed user + categories come from migrations) ────────────────
  function background(given: any, and: any): void {
    given(/^the seed user "(.*)" exists$/, () => {});
    and(/^the category "(.*)" with meta_bucket "(.*)" exists$/, () => {});
    and(/^the category "(.*)" with meta_bucket "(.*)" exists$/, () => {});
    and(/^the category "(.*)" with meta_bucket "(.*)" exists$/, () => {});
  }

  // Shared step registrations -------------------------------------------------
  const givenSimpleTxn = (given: any) =>
    given(
      /^a transaction "([^"]+)" with categorisation_source "([^"]+)" and needs_review (true|false)$/,
      async (handle: string, source: string, nr: string) => {
        await seedTxn(handle, { source, needsReview: nr === 'true' });
      },
    );

  const givenTableTxn = (given: any) =>
    given(/^a transaction "([^"]+)" with$/, async (handle: string, table: any) => {
      const d = kv(table);
      await seedTxn(handle, {
        merchantName: d.merchant_name,
        description: d.description,
        source: d.categorisation_source,
        categoryName: d.category_name,
        needsReview: (d.needs_review ?? 'true') === 'true',
      });
    });

  const andSuggested = (and: any) =>
    and(/^its suggested category_name is "([^"]+)"$/, async (cat: string) => {
      await world.query(`UPDATE transactions SET category_id = $1 WHERE id = $2`, [
        await categoryId(cat),
        handles.get(lastHandle),
      ]);
    });

  const whenConfirm = (when: any) =>
    when(/^I POST to "\/review\/([^/]+)\/confirm"$/, async (handle: string) => {
      res = await request(app).post(`/review/${handles.get(handle)}/confirm`).send({ user_id: USER });
    });

  const whenChange = (when: any) =>
    when(/^I POST to "\/review\/([^/]+)\/change" with body$/, async (handle: string, body: string) => {
      const parsed = JSON.parse(body);
      if (!parsed.user_id) parsed.user_id = USER;
      res = await request(app).post(`/review/${handles.get(handle)}/change`).send(parsed);
    });

  const whenGetQueue = (when: any) =>
    when(/^I GET "\/review\/(.+)"$/, async () => {
      res = await request(app).get(`/review/${USER}`);
    });

  // ── Scenarios ──────────────────────────────────────────────────────────────

  test('Confirming an AI suggestion sets source=confirmed and needs_review=false', ({ given, and, when, then }) => {
    background(given, and);
    givenSimpleTxn(given);
    andSuggested(and);
    whenConfirm(when);
    then(/^the transaction "([^"]+)" has categorisation_source "([^"]+)"$/, async (h: string, v: string) => {
      expect((await txnRow(h)).categorisation_source).toBe(v);
    });
    and(/^the transaction "([^"]+)" has needs_review (true|false)$/, async (h: string, v: string) => {
      expect((await txnRow(h)).needs_review).toBe(v === 'true');
    });
  });

  test('Confirm returns 200 ok', ({ given, and, when, then }) => {
    background(given, and);
    givenSimpleTxn(given);
    whenConfirm(when);
    then('the response status is 200', () => expect(res.status).toBe(200));
    and('the response body contains "ok": true', () => expect(res.body.ok).toBe(true));
  });

  test('Changing a category sets source=manual and needs_review=false', ({ given, and, when, then }) => {
    background(given, and);
    givenSimpleTxn(given);
    andSuggested(and);
    whenChange(when);
    then(/^the transaction "([^"]+)" has categorisation_source "([^"]+)"$/, async (h: string, v: string) => {
      expect((await txnRow(h)).categorisation_source).toBe(v);
    });
    and(/^the transaction "([^"]+)" has needs_review (true|false)$/, async (h: string, v: string) => {
      expect((await txnRow(h)).needs_review).toBe(v === 'true');
    });
    and(/^the transaction "([^"]+)" has category_name "([^"]+)"$/, async (h: string, v: string) => {
      expect((await txnRow(h)).category_name).toBe(v);
    });
  });

  test('Change returns 404 when category_name is not found', ({ given, and, when, then }) => {
    background(given, and);
    givenSimpleTxn(given);
    whenChange(when);
    then('the response status is 404', () => expect(res.status).toBe(404));
  });

  test('Creating a rule on change uses the normalised MERCHANT NAME as the pattern', ({ given, and, when, then }) => {
    background(given, and);
    givenTableTxn(given);
    whenChange(when);
    then(/^a categorisation_rule is inserted with merchant_pattern "([^"]+)"$/, async (p: string) => {
      const all = await rules();
      expect(all.map(r => r.merchant_pattern)).toContain(p);
    });
    and(/^the categorisation_rule merchant_pattern is NOT "([^"]+)"$/, async (p: string) => {
      expect((await rules()).map(r => r.merchant_pattern)).not.toContain(p);
    });
    and(/^the categorisation_rule merchant_pattern is NOT "([^"]+)"$/, async (p: string) => {
      expect((await rules()).map(r => r.merchant_pattern)).not.toContain(p);
    });
    and(/^the categorisation_rule merchant_pattern is NOT "([^"]+)"$/, async (p: string) => {
      expect((await rules()).map(r => r.merchant_pattern)).not.toContain(p);
    });
  });

  test('Rule pattern equals normalised merchant — not old nor new category name', ({ given, and, when, then }) => {
    background(given, and);
    givenTableTxn(given);
    whenChange(when);
    then(/^a categorisation_rule is inserted with merchant_pattern "([^"]+)"$/, async (p: string) => {
      expect((await rules()).map(r => r.merchant_pattern)).toContain(p);
    });
    and(/^the categorisation_rule merchant_pattern is NOT "([^"]+)"$/, async (p: string) => {
      expect((await rules()).map(r => r.merchant_pattern)).not.toContain(p);
    });
    and(/^the categorisation_rule merchant_pattern is NOT "([^"]+)"$/, async (p: string) => {
      expect((await rules()).map(r => r.merchant_pattern)).not.toContain(p);
    });
  });

  test('Rule falls back to normalised description when merchant_name is null', ({ given, and, when, then }) => {
    background(given, and);
    givenTableTxn(given);
    whenChange(when);
    then(/^a categorisation_rule is inserted with merchant_pattern "([^"]+)"$/, async (p: string) => {
      expect((await rules()).map(r => r.merchant_pattern)).toContain(p);
    });
  });

  test('No rule is created when create_rule is false', ({ given, and, when, then }) => {
    background(given, and);
    givenSimpleTxn(given);
    whenChange(when);
    then('no categorisation_rule is inserted', async () => {
      expect(await rules()).toHaveLength(0);
    });
  });

  test('Transactions with NULL category_id still appear in the review queue', ({ given, and, when, then }) => {
    background(given, and);
    givenTableTxn(given);
    whenGetQueue(when);
    then(/^the response contains a transaction with id "([^"]+)"$/, (h: string) => {
      expect(res.body.map((t: { id: string }) => t.id)).toContain(handles.get(h));
    });
    and(/^that transaction's category_name is "([^"]+)"$/, (v: string) => {
      const tx = res.body.find((t: { id: string }) => t.id === handles.get('txn-null-cat-01'));
      expect(tx.category_name).toBe(v);
    });
  });

  test('Review queue uses LEFT JOIN so AI-failed transactions are not silently dropped', ({ given, and, when, then }) => {
    background(given, and);
    given(/^(\d+) transactions with needs_review true and category_id NULL$/, async (n: string) => {
      for (let i = 0; i < Number(n); i++) await seedTxn(`null-cat-${i}`, { needsReview: true });
    });
    and(/^(\d+) transactions with needs_review true and a valid category_id$/, async (n: string) => {
      for (let i = 0; i < Number(n); i++) {
        await seedTxn(`valid-cat-${i}`, { needsReview: true, categoryName: 'Groceries' });
      }
    });
    whenGetQueue(when);
    then(/^the response contains (\d+) transactions total$/, (n: string) => {
      expect(res.body).toHaveLength(Number(n));
    });
  });
});
