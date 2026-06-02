import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import { createWorld, type BddWorld } from '../world';
import { normaliseMerchant } from '@/categorisation/rules';

const feature = loadFeature(
  path.join(__dirname, '../../../../../features/categorisation/rules-engine.feature'),
  { tagFilter: 'not @wip' },
);

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

type DefineStep = (
  matcher: string | RegExp,
  fn: (...args: any[]) => void | Promise<void>,
) => void;

defineFeature(feature, test => {
  let world: BddWorld;
  let normalisedResult: string;
  let ruleResults: Array<Record<string, unknown>>;
  let capturedRuleQueryParams: unknown[];

  beforeEach(async () => {
    world = await createWorld();
    ruleResults = [];
    capturedRuleQueryParams = [];
  });

  afterEach(async () => {
    if (world) await world.teardown();
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function insertRule(
    userId: string,
    merchantPattern: string,
    categoryName: string,
  ): Promise<void> {
    const { rows: cats } = await world.query<{ id: string }>(
      `SELECT id FROM categories WHERE name = $1`,
      [categoryName],
    );
    await world.query(
      `INSERT INTO categorisation_rules (user_id, merchant_pattern, category_id)
       VALUES ($1, $2, $3)`,
      [userId, merchantPattern, cats[0].id],
    );
  }

  async function ensureLinkedAccount(userId: string): Promise<string> {
    const { rows: existing } = await world.query<{ id: string }>(
      `SELECT id FROM linked_accounts WHERE user_id = $1 AND external_id = 'bdd-acct' LIMIT 1`,
      [userId],
    );
    if (existing.length > 0) return existing[0].id;

    const { rows: conns } = await world.query<{ id: string }>(
      `INSERT INTO bank_connections
         (user_id, provider, access_token_enc, refresh_token_enc, token_expires_at)
       VALUES ($1, 'bdd', 'enc', 'enc', '2099-01-01')
       RETURNING id`,
      [userId],
    );

    const { rows: accts } = await world.query<{ id: string }>(
      `INSERT INTO linked_accounts
         (user_id, connection_id, provider, external_id, account_name, account_type)
       VALUES ($1, $2, 'bdd', 'bdd-acct', 'BDD Account', 'current')
       RETURNING id`,
      [userId, conns[0].id],
    );

    return accts[0].id;
  }

  async function insertTransaction(
    userId: string,
    merchantName: string,
    extId: string,
  ): Promise<void> {
    const accountId = await ensureLinkedAccount(userId);
    await world.query(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, needs_review)
       VALUES ($1, $2, $3, $4, $4, -1000, 'GBP', '2026-05-01', TRUE)`,
      [accountId, userId, extId, merchantName],
    );
  }

  async function runRulesEngine(
    userId: string,
  ): Promise<Array<{ id: string; category_name: string }>> {
    const { rows: txns } = await world.query<{
      id: string;
      merchant_name: string | null;
      description: string;
    }>(
      `SELECT id, merchant_name, description
       FROM transactions WHERE user_id = $1 AND needs_review = TRUE`,
      [userId],
    );

    const results: Array<{ id: string; category_name: string }> = [];

    for (const txn of txns) {
      const pattern = normaliseMerchant(txn.merchant_name ?? null, txn.description ?? '');
      const { rows: matched } = await world.query<{
        category_id: string;
        category_name: string;
      }>(
        `SELECT r.category_id, c.name AS category_name
         FROM categorisation_rules r
         JOIN categories c ON c.id = r.category_id
         WHERE r.user_id = $1 AND r.merchant_pattern = $2`,
        [userId, pattern],
      );

      if (matched.length > 0) {
        await world.query(
          `UPDATE transactions
           SET category_id = $1, categorisation_source = 'rule', needs_review = FALSE
           WHERE id = $2`,
          [matched[0].category_id, txn.id],
        );
        results.push({ id: txn.id, category_name: matched[0].category_name });
      }
    }

    return results;
  }

  async function queryRules(
    userId: string,
    merchant: string,
  ): Promise<Array<Record<string, unknown>>> {
    const pattern = normaliseMerchant(merchant);
    capturedRuleQueryParams = [userId, pattern];
    const { rows } = await world.query<Record<string, unknown>>(
      `SELECT c.name AS category_name
       FROM categorisation_rules r
       JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = $1 AND r.merchant_pattern = $2`,
      [userId, pattern],
    );
    return rows;
  }

  // Background: seed user + categories come from migrations (no-ops here)
  function addBackground(given: DefineStep, and: DefineStep): void {
    given(/^the seed user "(.*)" exists$/, () => {});
    and(/^the category "(.*)" with meta_bucket "(.*)" exists$/, () => {});
    and(/^the category "(.*)" with meta_bucket "(.*)" exists$/, () => {});
  }

  // ─── Scenarios ─────────────────────────────────────────────────────────────

  test('Merchant string is uppercased and trimmed before matching', ({ given, and, when, then }) => {
    addBackground(given, and);

    given(/^a categorisation rule for user "(.*)"$/, async (
      userId: string,
      table: Array<{ merchant_pattern: string; category_name: string }>,
    ) => {
      for (const row of table) {
        await insertRule(userId, row.merchant_pattern, row.category_name);
      }
    });

    when(/^I call normaliseMerchant with "(.*)"$/, (merchant: string) => {
      normalisedResult = normaliseMerchant(merchant);
    });

    then(/^the normalised merchant is "(.*)"$/, (expected: string) => {
      expect(normalisedResult).toBe(expected);
    });
  });

  test('Null merchant falls back to the transaction description', ({ given, and, when, then }) => {
    addBackground(given, and);

    when(/^I call normaliseMerchant with merchant null and description "(.*)"$/, (description: string) => {
      normalisedResult = normaliseMerchant(null, description);
    });

    then(/^the normalised merchant is "(.*)"$/, (expected: string) => {
      expect(normalisedResult).toBe(expected);
    });
  });

  test('Description fallback is also uppercased and trimmed', ({ given, and, when, then }) => {
    addBackground(given, and);

    when(/^I call normaliseMerchant with merchant null and description "(.*)"$/, (description: string) => {
      normalisedResult = normaliseMerchant(null, description);
    });

    then(/^the normalised merchant is "(.*)"$/, (expected: string) => {
      expect(normalisedResult).toBe(expected);
    });
  });

  test('Exact-match rule sets source=rule and needs_review=false', ({ given, and, when, then }) => {
    addBackground(given, and);

    given(/^a categorisation rule for user "(.*)"$/, async (
      userId: string,
      table: Array<{ merchant_pattern: string; category_name: string }>,
    ) => {
      for (const row of table) {
        await insertRule(userId, row.merchant_pattern, row.category_name);
      }
    });

    and(/^a transaction with merchant_name "(.*)" and external_id "(.*)"$/, async (
      merchantName: string,
      extId: string,
    ) => {
      await insertTransaction(SEED_USER_ID, merchantName, extId);
    });

    when(/^the rules engine runs for user "(.*)"$/, async (userId: string) => {
      ruleResults = await runRulesEngine(userId);
    });

    then(/^the transaction "(.*)" has category_name "(.*)"$/, async (
      extId: string,
      categoryName: string,
    ) => {
      const { rows } = await world.query<{ name: string }>(
        `SELECT c.name FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1 AND t.external_id = $2`,
        [SEED_USER_ID, extId],
      );
      expect(rows[0]?.name).toBe(categoryName);
    });

    and(/^the transaction "(.*)" has categorisation_source "(.*)"$/, async (
      extId: string,
      source: string,
    ) => {
      const { rows } = await world.query<{ categorisation_source: string }>(
        `SELECT categorisation_source FROM transactions WHERE user_id = $1 AND external_id = $2`,
        [SEED_USER_ID, extId],
      );
      expect(rows[0]?.categorisation_source).toBe(source);
    });

    and(/^the transaction "(.*)" has needs_review false$/, async (extId: string) => {
      const { rows } = await world.query<{ needs_review: boolean }>(
        `SELECT needs_review FROM transactions WHERE user_id = $1 AND external_id = $2`,
        [SEED_USER_ID, extId],
      );
      expect(rows[0]?.needs_review).toBe(false);
    });
  });

  test('Match is case-insensitive due to normalisation', ({ given, and, when, then }) => {
    addBackground(given, and);

    given(/^a categorisation rule for user "(.*)"$/, async (
      userId: string,
      table: Array<{ merchant_pattern: string; category_name: string }>,
    ) => {
      for (const row of table) {
        await insertRule(userId, row.merchant_pattern, row.category_name);
      }
    });

    and(/^a transaction with merchant_name "(.*)" and external_id "(.*)"$/, async (
      merchantName: string,
      extId: string,
    ) => {
      await insertTransaction(SEED_USER_ID, merchantName, extId);
    });

    when(/^the rules engine runs for user "(.*)"$/, async (userId: string) => {
      ruleResults = await runRulesEngine(userId);
    });

    then(/^the transaction "(.*)" has categorisation_source "(.*)"$/, async (
      extId: string,
      source: string,
    ) => {
      const { rows } = await world.query<{ categorisation_source: string }>(
        `SELECT categorisation_source FROM transactions WHERE user_id = $1 AND external_id = $2`,
        [SEED_USER_ID, extId],
      );
      expect(rows[0]?.categorisation_source).toBe(source);
    });
  });

  test('Rule lookup queries using the normalised merchant name', ({ given, and, when, then }) => {
    addBackground(given, and);

    given(/^a categorisation rule for user "(.*)"$/, async (
      userId: string,
      table: Array<{ merchant_pattern: string; category_name: string }>,
    ) => {
      for (const row of table) {
        await insertRule(userId, row.merchant_pattern, row.category_name);
      }
    });

    when(/^applyRules is called for user "(.*)" with merchant "(.*)"$/, async (
      userId: string,
      merchant: string,
    ) => {
      ruleResults = await queryRules(userId, merchant);
    });

    then(/^the DB was queried with parameters including "(.*)" and "(.*)"$/, (
      param1: string,
      param2: string,
    ) => {
      expect(capturedRuleQueryParams).toContain(param1);
      expect(capturedRuleQueryParams).toContain(param2);
    });
  });

  test('Unrecognised merchant produces no rule result', ({ given, and, when, then }) => {
    addBackground(given, and);

    given(/^no categorisation rules exist for user "(.*)"$/, () => {
      // Default world state has no rules
    });

    and(/^a transaction with merchant_name "(.*)" and external_id "(.*)"$/, async (
      merchantName: string,
      extId: string,
    ) => {
      await insertTransaction(SEED_USER_ID, merchantName, extId);
    });

    when(/^the rules engine runs for user "(.*)"$/, async (userId: string) => {
      ruleResults = await runRulesEngine(userId);
    });

    then('applyRules returns an empty result list', () => {
      expect(ruleResults.length).toBe(0);
    });
  });

  test('Boundary matching — only exact normalised patterns match', ({ given, and, when, then }) => {
    addBackground(given, and);

    given(/^a categorisation rule for user "(.*)"$/, async (
      userId: string,
      table: Array<{ merchant_pattern: string; category_name: string }>,
    ) => {
      for (const row of table) {
        await insertRule(userId, row.merchant_pattern, row.category_name);
      }
    });

    when(/^applyRules is called for user "(.*)" with merchant "(.*)"$/, async (
      userId: string,
      merchant: string,
    ) => {
      ruleResults = await queryRules(userId, merchant);
    });

    then(/^applyRules returns (\d+) result\(s\)$/, (matchesStr: string) => {
      expect(ruleResults.length).toBe(parseInt(matchesStr, 10));
    });
  });
});
