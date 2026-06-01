# PoisonedFinance — Categorisation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically categorise every new transaction via a two-stage pipeline: (1) exact-match rules engine, (2) Claude API batch fallback. Users confirm or correct AI suggestions via a Review Queue. Corrections optionally create a permanent rule so the same merchant is never queued again.

**Architecture:** Three modules under `api/src/categorisation/`: `rules.ts` (merchant lookup), `claude.ts` (batch API call), `pipeline.ts` (orchestrates both stages). A `routes/review.ts` router exposes the review queue to the mobile app. The pipeline is called at the end of `syncTransactions` from Plan C. Prerequisite: Plans B and C must be complete.

**Tech Stack:** `@anthropic-ai/sdk` (Claude API via tool use for reliable JSON output), model `claude-sonnet-4-6`, `pg`, Express 4.

---

## File Structure

```
api/src/
├── categorisation/
│   ├── types.ts                      # CategorizationResult, pipeline-internal types
│   ├── rules.ts                      # applyRules(userId, transactions) → partial results
│   ├── claude.ts                     # batchCategorise(transactions) → category per txn
│   └── pipeline.ts                   # runPipeline(userId, transactionIds) — orchestrates all
└── routes/
    └── review.ts                     # GET /review/:userId
                                      # POST /review/:txnId/confirm
                                      # POST /review/:txnId/change
```

Plus:
- `api/package.json` — add `@anthropic-ai/sdk`
- `api/src/truelayer/sync.ts` — call `runPipeline` after inserting transactions

---

### Task 1: Add Anthropic SDK dependency

**Files:**
- Modify: `api/package.json`

- [ ] **Step 1: Add `@anthropic-ai/sdk` to dependencies**

In `api/package.json`, add to `"dependencies"`:
```json
"@anthropic-ai/sdk": "^0.24.3"
```

- [ ] **Step 2: Install**

```bash
cd api && npm install
```

Expected: `@anthropic-ai/sdk` appears in `node_modules/`, no errors.

- [ ] **Step 3: Commit**

```bash
git add api/package.json api/package-lock.json
git commit -m "feat(api): add @anthropic-ai/sdk dependency"
```

---

### Task 2: Categorisation types

**Files:**
- Create: `api/src/categorisation/types.ts`

No tests — pure type declarations.

- [ ] **Step 1: Create `api/src/categorisation/types.ts`**

```typescript
export interface TxnForCategorisation {
  id: string;            // transaction UUID
  merchant_name: string | null;
  description: string;
}

export interface CategorizationResult {
  id: string;
  category_name: string;   // must match a name in the categories table
  source: 'rule' | 'ai';
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/categorisation/types.ts
git commit -m "feat(api): add categorisation pipeline types"
```

---

### Task 3: Rules engine

**Files:**
- Create: `api/src/categorisation/rules.ts`
- Create: `api/src/__tests__/categorisation/rules.test.ts`

The rules engine normalises the merchant string to UPPERCASE TRIMMED before matching. This matches how rules are stored (see Task 5: the rule is always created from the normalised merchant name).

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/categorisation/rules.test.ts`:

```typescript
import { applyRules, normaliseMerchant } from '@/categorisation/rules';
import type { TxnForCategorisation } from '@/categorisation/types';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const TXN = (merchant: string | null, description = 'desc'): TxnForCategorisation => ({
  id: 'txn-1',
  merchant_name: merchant,
  description,
});

describe('normaliseMerchant', () => {
  it('uppercases and trims', () => {
    expect(normaliseMerchant('  tesco stores  ')).toBe('TESCO STORES');
  });

  it('falls back to description when merchant is null', () => {
    expect(normaliseMerchant(null, 'DIRECT DEBIT BT')).toBe('DIRECT DEBIT BT');
  });
});

describe('applyRules', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns result with category_name when rule matches', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ merchant_pattern: 'TESCO STORES', category_name: 'Groceries' }],
    });

    const results = await applyRules('user-1', [TXN('Tesco Stores')]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: 'txn-1', category_name: 'Groceries', source: 'rule' });
  });

  it('returns empty array when no rules match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const results = await applyRules('user-1', [TXN('Unknown Merchant')]);
    expect(results).toHaveLength(0);
  });

  it('queries using the normalised merchant name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await applyRules('user-1', [TXN('  amazon mktplace  ')]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['user-1', 'AMAZON MKTPLACE']),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="categorisation/rules"
```

Expected: FAIL — `Cannot find module '@/categorisation/rules'`

- [ ] **Step 3: Create `api/src/categorisation/rules.ts`**

```typescript
import { pool } from '@/db/client';
import type { TxnForCategorisation, CategorizationResult } from './types';

export function normaliseMerchant(merchant: string | null, fallback = ''): string {
  return (merchant ?? fallback).trim().toUpperCase();
}

export async function applyRules(
  userId: string,
  transactions: TxnForCategorisation[],
): Promise<CategorizationResult[]> {
  const results: CategorizationResult[] = [];

  for (const txn of transactions) {
    const pattern = normaliseMerchant(txn.merchant_name, txn.description);
    const { rows } = await pool.query<{ merchant_pattern: string; category_name: string }>(
      `SELECT r.merchant_pattern, c.name AS category_name
       FROM categorisation_rules r
       JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = $1 AND r.merchant_pattern = $2`,
      [userId, pattern],
    );
    if (rows.length > 0) {
      results.push({ id: txn.id, category_name: rows[0].category_name, source: 'rule' });
    }
  }

  return results;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="categorisation/rules"
```

Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add api/src/categorisation/rules.ts api/src/categorisation/types.ts \
        api/src/__tests__/categorisation/rules.test.ts
git commit -m "feat(api): add rules engine with merchant normalisation"
```

---

### Task 4: Claude batch categorisation

**Files:**
- Create: `api/src/categorisation/claude.ts`
- Create: `api/src/__tests__/categorisation/claude.test.ts`

Uses Claude's tool-use API with `tool_choice: { type: 'tool' }` to guarantee structured JSON output. Model: `claude-sonnet-4-6`.

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/categorisation/claude.test.ts`:

```typescript
import { batchCategorise } from '@/categorisation/claude';
import type { TxnForCategorisation } from '@/categorisation/types';

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const TRANSACTIONS: TxnForCategorisation[] = [
  { id: 'txn-1', merchant_name: 'AMAZON MKTPLACE', description: 'AMAZON MKTPLACE PMTS' },
  { id: 'txn-2', merchant_name: 'McDonald\'s', description: 'MCDONALDS' },
];

beforeEach(() => {
  mockCreate.mockReset();
  mockQuery.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

it('returns one result per transaction with category from Claude', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [
      { name: 'Shopping' }, { name: 'Groceries' }, { name: 'Eating Out' },
      { name: 'Transport' }, { name: 'Fuel' }, { name: 'Bills & Utilities' },
      { name: 'Health' }, { name: 'Subscriptions' }, { name: 'Entertainment' },
      { name: 'Travel' }, { name: 'Savings' },
    ],
  });
  mockCreate.mockResolvedValueOnce({
    content: [{
      type: 'tool_use',
      input: {
        results: [
          { id: 'txn-1', category: 'Shopping' },
          { id: 'txn-2', category: 'Eating Out' },
        ],
      },
    }],
  });

  const results = await batchCategorise(TRANSACTIONS);

  expect(results).toHaveLength(2);
  expect(results.find(r => r.id === 'txn-1')?.category_name).toBe('Shopping');
  expect(results.find(r => r.id === 'txn-2')?.category_name).toBe('Eating Out');
  expect(results.every(r => r.source === 'ai')).toBe(true);
});

it('passes category names from DB as the allowed enum values', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [{ name: 'Groceries' }, { name: 'Eating Out' }],
  });
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'tool_use', input: { results: [{ id: 'txn-1', category: 'Groceries' }] } }],
  });

  await batchCategorise([TRANSACTIONS[0]]);

  const callArgs = mockCreate.mock.calls[0][0];
  const toolSchema = callArgs.tools[0].input_schema;
  const enumValues = toolSchema.properties.results.items.properties.category.enum;
  expect(enumValues).toEqual(['Groceries', 'Eating Out']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="categorisation/claude"
```

Expected: FAIL — `Cannot find module '@/categorisation/claude'`

- [ ] **Step 3: Create `api/src/categorisation/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '@/db/client';
import type { TxnForCategorisation, CategorizationResult } from './types';

const MODEL = 'claude-sonnet-4-6';

async function getCategoryNames(): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM categories ORDER BY name');
  return rows.map(r => r.name);
}

export async function batchCategorise(
  transactions: TxnForCategorisation[],
): Promise<CategorizationResult[]> {
  if (transactions.length === 0) return [];

  const client = new Anthropic();
  const categoryNames = await getCategoryNames();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: 'categorise_transactions',
        description: 'Categorise UK bank transactions into the provided categories.',
        input_schema: {
          type: 'object' as const,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  category: { type: 'string', enum: categoryNames },
                },
                required: ['id', 'category'],
              },
            },
          },
          required: ['results'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'categorise_transactions' },
    messages: [
      {
        role: 'user',
        content: `Categorise these UK bank transactions. Use the merchant name where available, otherwise the description.\n\n${JSON.stringify(
          transactions.map(t => ({ id: t.id, merchant: t.merchant_name ?? t.description })),
          null,
          2,
        )}`,
      },
    ],
  });

  const toolUse = message.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not return tool_use');

  const { results } = toolUse.input as { results: Array<{ id: string; category: string }> };
  return results.map(r => ({ id: r.id, category_name: r.category, source: 'ai' as const }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="categorisation/claude"
```

Expected: PASS — 2/2

- [ ] **Step 5: Commit**

```bash
git add api/src/categorisation/claude.ts api/src/__tests__/categorisation/claude.test.ts
git commit -m "feat(api): add Claude batch categorisation via tool-use API"
```

---

### Task 5: Pipeline orchestrator

**Files:**
- Create: `api/src/categorisation/pipeline.ts`
- Create: `api/src/__tests__/categorisation/pipeline.test.ts`

The pipeline:
1. Fetch uncategorised transaction rows for the given IDs.
2. Run `applyRules` — apply results immediately.
3. Pass remaining (unmatched) transactions to `batchCategorise`.
4. Apply AI results, mark `needs_review = TRUE`.
5. All DB writes in one pass per result.

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/categorisation/pipeline.test.ts`:

```typescript
import { runPipeline } from '@/categorisation/pipeline';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const mockApplyRules = jest.fn();
jest.mock('@/categorisation/rules', () => ({ applyRules: mockApplyRules }));

const mockBatchCategorise = jest.fn();
jest.mock('@/categorisation/claude', () => ({ batchCategorise: mockBatchCategorise }));

const UNCATEGORISED = [
  { id: 'txn-1', merchant_name: 'TESCO', description: 'TESCO STORES' },
  { id: 'txn-2', merchant_name: 'AMAZON', description: 'AMAZON MKTPLACE' },
];

beforeEach(() => {
  mockQuery.mockReset();
  mockApplyRules.mockReset();
  mockBatchCategorise.mockReset();
});

it('applies rule results without marking needs_review', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: UNCATEGORISED })           // fetch uncategorised
    .mockResolvedValueOnce({ rows: [{ id: 'cat-groceries' }] }) // category lookup txn-1
    .mockResolvedValueOnce({ rows: [] })                        // UPDATE txn-1
    .mockResolvedValueOnce({ rows: [{ id: 'cat-shopping' }] }) // category lookup txn-2
    .mockResolvedValueOnce({ rows: [] });                       // UPDATE txn-2

  mockApplyRules.mockResolvedValueOnce([
    { id: 'txn-1', category_name: 'Groceries', source: 'rule' },
    { id: 'txn-2', category_name: 'Shopping', source: 'rule' },
  ]);
  mockBatchCategorise.mockResolvedValueOnce([]);

  await runPipeline('user-1', ['txn-1', 'txn-2']);

  const updateCall = mockQuery.mock.calls.find(
    c => typeof c[0] === 'string' && c[0].includes('categorisation_source') && c[1]?.includes('rule'),
  );
  expect(updateCall).toBeDefined();
  // needs_review should be FALSE for rule-matched transactions
  expect(updateCall![0]).toContain('needs_review = FALSE');
});

it('sends only unmatched transactions to Claude', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: UNCATEGORISED })
    .mockResolvedValue({ rows: [{ id: 'cat-1' }] });

  mockApplyRules.mockResolvedValueOnce([
    { id: 'txn-1', category_name: 'Groceries', source: 'rule' },
  ]);
  mockBatchCategorise.mockResolvedValueOnce([
    { id: 'txn-2', category_name: 'Shopping', source: 'ai' },
  ]);

  await runPipeline('user-1', ['txn-1', 'txn-2']);

  expect(mockBatchCategorise).toHaveBeenCalledWith([UNCATEGORISED[1]]);
});

it('marks AI-categorised transactions as needs_review = TRUE', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [UNCATEGORISED[1]] })
    .mockResolvedValue({ rows: [{ id: 'cat-shopping' }] });

  mockApplyRules.mockResolvedValueOnce([]);
  mockBatchCategorise.mockResolvedValueOnce([
    { id: 'txn-2', category_name: 'Shopping', source: 'ai' },
  ]);

  await runPipeline('user-1', ['txn-2']);

  const aiUpdateCall = mockQuery.mock.calls.find(
    c => typeof c[0] === 'string' && c[0].includes('needs_review = TRUE'),
  );
  expect(aiUpdateCall).toBeDefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="categorisation/pipeline"
```

Expected: FAIL — `Cannot find module '@/categorisation/pipeline'`

- [ ] **Step 3: Create `api/src/categorisation/pipeline.ts`**

```typescript
import { pool } from '@/db/client';
import { applyRules } from './rules';
import { batchCategorise } from './claude';
import type { TxnForCategorisation } from './types';

async function applyCategoryToTransaction(
  txnId: string,
  categoryName: string,
  source: 'rule' | 'ai',
): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM categories WHERE name = $1',
    [categoryName],
  );
  if (rows.length === 0) return; // unknown category — leave for manual review

  const needsReview = source === 'ai';
  await pool.query(
    `UPDATE transactions
     SET category_id = $1,
         categorisation_source = $2,
         needs_review = ${needsReview ? 'TRUE' : 'FALSE'}
     WHERE id = $3`,
    [rows[0].id, source, txnId],
  );
}

export async function runPipeline(userId: string, transactionIds: string[]): Promise<void> {
  if (transactionIds.length === 0) return;

  const { rows } = await pool.query<TxnForCategorisation>(
    `SELECT id, merchant_name, description
     FROM transactions
     WHERE id = ANY($1) AND category_id IS NULL`,
    [transactionIds],
  );
  if (rows.length === 0) return;

  const ruleResults = await applyRules(userId, rows);
  const ruleMatchedIds = new Set(ruleResults.map(r => r.id));
  const unmatched = rows.filter(t => !ruleMatchedIds.has(t.id));

  const aiResults = await batchCategorise(unmatched);

  for (const result of [...ruleResults, ...aiResults]) {
    await applyCategoryToTransaction(result.id, result.category_name, result.source);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="categorisation/pipeline"
```

Expected: PASS — 3/3

- [ ] **Step 5: Commit**

```bash
git add api/src/categorisation/pipeline.ts api/src/__tests__/categorisation/pipeline.test.ts
git commit -m "feat(api): add categorisation pipeline (rules → Claude → mark for review)"
```

---

### Task 6: Wire pipeline into sync

**Files:**
- Modify: `api/src/truelayer/sync.ts`
- Modify: `api/src/__tests__/truelayer/sync.test.ts`

After `syncTransactions` inserts rows, collect their IDs and call `runPipeline`.

- [ ] **Step 1: Update `api/src/__tests__/truelayer/sync.test.ts` — add pipeline call test**

Add this test to the existing `describe('syncTransactions')` block:

```typescript
it('calls runPipeline with the IDs of newly inserted transactions', async () => {
  const mockPipeline = jest.fn().mockResolvedValue(undefined);
  jest.mock('@/categorisation/pipeline', () => ({ runPipeline: mockPipeline }));

  // Simulate INSERT returning an id
  mockFetch.mockResolvedValueOnce({ results: [TRANSACTION], status: 'Succeeded' });
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-txn-uuid' }] }); // INSERT ... RETURNING id

  await syncTransactions('user-1', 'linked-acc-id-1', 'acc-001', 'access-token');

  expect(mockPipeline).toHaveBeenCalledWith('user-1', ['new-txn-uuid']);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

```bash
cd api && npm test -- --testPathPattern="truelayer/sync"
```

Expected: the new test FAILS — pipeline not called yet.

- [ ] **Step 3: Update `api/src/truelayer/sync.ts` to call runPipeline**

Replace the existing `syncTransactions` function:

```typescript
import { pool } from '@/db/client';
import { fetchTrueLayer } from './client';
import { runPipeline } from '@/categorisation/pipeline';
import type { TrueLayerAccount, TrueLayerApiResponse, TrueLayerTransaction } from './types';

export async function syncAccounts(
  userId: string,
  linkedAccountId: string,
  accessToken: string,
): Promise<void> {
  const data = await fetchTrueLayer<TrueLayerApiResponse<TrueLayerAccount>>(
    '/data/v1/accounts',
    accessToken,
  );
  for (const acct of data.results) {
    await pool.query(
      `INSERT INTO linked_accounts (user_id, external_id, account_name, account_type, currency)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, external_id) DO UPDATE
         SET account_name = EXCLUDED.account_name,
             account_type = EXCLUDED.account_type`,
      [userId, acct.account_id, acct.display_name, acct.account_type, acct.currency],
    );
  }
}

export async function syncTransactions(
  userId: string,
  linkedAccountId: string,
  externalAccountId: string,
  accessToken: string,
): Promise<void> {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const data = await fetchTrueLayer<TrueLayerApiResponse<TrueLayerTransaction>>(
    `/data/v1/accounts/${externalAccountId}/transactions?from=${from}&to=${to}`,
    accessToken,
  );

  const newIds: string[] = [];

  for (const txn of data.results) {
    const postedDate = txn.timestamp.slice(0, 10);
    const transactionDate = txn.meta?.transaction_time
      ? txn.meta.transaction_time.slice(0, 10)
      : postedDate;
    const amountPence = Math.round(txn.amount * 100);

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, needs_review)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, TRUE)
       ON CONFLICT (account_id, external_id) DO NOTHING
       RETURNING id`,
      [
        linkedAccountId, userId, txn.transaction_id,
        txn.merchant_name ?? null, txn.description,
        amountPence, txn.currency,
        transactionDate, postedDate,
      ],
    );
    if (rows.length > 0) newIds.push(rows[0].id);
  }

  if (newIds.length > 0) {
    await runPipeline(userId, newIds);
  }
}
```

- [ ] **Step 4: Run the full sync test suite to verify all pass**

```bash
cd api && npm test -- --testPathPattern="truelayer/sync"
```

Expected: PASS — all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add api/src/truelayer/sync.ts api/src/__tests__/truelayer/sync.test.ts
git commit -m "feat(api): run categorisation pipeline after transaction sync"
```

---

### Task 7: Review Queue routes

**Files:**
- Create: `api/src/routes/review.ts`
- Create: `api/src/__tests__/routes/review.test.ts`
- Modify: `api/src/app.ts`

The rule-suggestion spec: when a user changes a category, the rule prompt always uses the **merchant name** (normalised), never the old category name.

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/routes/review.test.ts`:

```typescript
import request from 'supertest';
import { createApp } from '@/app';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const app = createApp();

const PENDING_TXN = {
  id: 'txn-1',
  merchant_name: 'AMAZON MKTPLACE',
  description: 'AMAZON MKTPLACE PMTS',
  amount_pence: -3499,
  transaction_date: '2026-05-29',
  category_name: 'Shopping',
  meta_bucket: 'wants',
  account_name: 'Halifax',
  categorisation_source: 'ai',
};

beforeEach(() => mockQuery.mockReset());

describe('GET /review/:userId', () => {
  it('returns pending transactions', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [PENDING_TXN] });
    const res = await request(app).get('/review/user-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].merchant_name).toBe('AMAZON MKTPLACE');
  });
});

describe('POST /review/:txnId/confirm', () => {
  it('sets source=confirmed and needs_review=false', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'txn-1', category_id: 'cat-1' }] }) // fetch txn
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app).post('/review/txn-1/confirm');
    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('categorisation_source'),
    )!;
    expect(updateCall[0]).toContain("categorisation_source = 'confirmed'");
    expect(updateCall[0]).toContain('needs_review = FALSE');
  });
});

describe('POST /review/:txnId/change', () => {
  it('updates category, sets source=manual, needs_review=false', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cat-groceries' }] }) // lookup new category
      .mockResolvedValueOnce({ rows: [] });                        // UPDATE transaction

    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'Groceries' });

    expect(res.status).toBe(200);
    const updateCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('categorisation_source'),
    )!;
    expect(updateCall[1]).toContain('manual');
  });

  it('creates a rule using the MERCHANT NAME (not the old category)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'cat-groceries' }] }) // category lookup
      .mockResolvedValueOnce({ rows: [] })                        // UPDATE transaction
      .mockResolvedValueOnce({ rows: [{ merchant_name: 'AMAZON MKTPLACE', user_id: 'user-1' }] }) // fetch txn for rule
      .mockResolvedValueOnce({ rows: [] }); // INSERT rule

    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'Groceries', create_rule: true, user_id: 'user-1' });

    expect(res.status).toBe(200);

    const ruleInsert = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO categorisation_rules'),
    )!;
    expect(ruleInsert).toBeDefined();
    // merchant_pattern must be the normalised MERCHANT NAME, not a category name
    expect(ruleInsert[1]).toContain('AMAZON MKTPLACE');
    expect(ruleInsert[1]).not.toContain('Shopping');
    expect(ruleInsert[1]).not.toContain('Groceries');
  });

  it('returns 404 when category_name is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // category not found
    const res = await request(app)
      .post('/review/txn-1/change')
      .send({ category_name: 'DoesNotExist' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="routes/review"
```

Expected: FAIL — `Cannot find module '@/routes/review'` (or similar)

- [ ] **Step 3: Create `api/src/routes/review.ts`**

```typescript
import { Router } from 'express';
import { pool } from '@/db/client';
import { normaliseMerchant } from '@/categorisation/rules';

const router = Router();

// GET /review/:userId — pending transactions (AI-categorised, not yet confirmed)
router.get('/review/:userId', async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT t.id, t.merchant_name, t.description, t.amount_pence,
            t.transaction_date, t.categorisation_source,
            c.name AS category_name, c.meta_bucket,
            la.account_name
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     JOIN linked_accounts la ON la.id = t.account_id
     WHERE t.user_id = $1 AND t.needs_review = TRUE
     ORDER BY t.transaction_date DESC`,
    [userId],
  );
  res.json(rows);
});

// POST /review/:txnId/confirm — accept AI suggestion as-is
router.post('/review/:txnId/confirm', async (req, res) => {
  const { txnId } = req.params;
  const { rows } = await pool.query(
    'SELECT id, category_id FROM transactions WHERE id = $1',
    [txnId],
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Transaction not found' }); return; }

  await pool.query(
    `UPDATE transactions
     SET categorisation_source = 'confirmed', needs_review = FALSE
     WHERE id = $1`,
    [txnId],
  );
  res.json({ ok: true });
});

// POST /review/:txnId/change — change category, optionally create rule
// Body: { category_name: string, create_rule?: boolean, user_id?: string }
router.post('/review/:txnId/change', async (req, res) => {
  const { txnId } = req.params;
  const { category_name, create_rule, user_id } = req.body as {
    category_name: string;
    create_rule?: boolean;
    user_id?: string;
  };

  const { rows: catRows } = await pool.query<{ id: string }>(
    'SELECT id FROM categories WHERE name = $1',
    [category_name],
  );
  if (catRows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }
  const categoryId = catRows[0].id;

  await pool.query(
    `UPDATE transactions
     SET category_id = $1, categorisation_source = 'manual', needs_review = FALSE
     WHERE id = $2`,
    [categoryId, txnId],
  );

  if (create_rule && user_id) {
    const { rows: txnRows } = await pool.query<{ merchant_name: string | null; user_id: string }>(
      'SELECT merchant_name, description, user_id FROM transactions WHERE id = $1',
      [txnId],
    );
    if (txnRows.length > 0) {
      const txn = txnRows[0];
      const pattern = normaliseMerchant(
        txn.merchant_name,
        (txn as unknown as { description: string }).description,
      );
      await pool.query(
        `INSERT INTO categorisation_rules (user_id, merchant_pattern, category_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, merchant_pattern) DO UPDATE SET category_id = EXCLUDED.category_id`,
        [user_id, pattern, categoryId],
      );
    }
  }

  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 4: Update `api/src/app.ts` to mount the review router**

Replace the existing `app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import authRouter from '@/routes/auth';
import syncRouter from '@/routes/sync';
import reviewRouter from '@/routes/review';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(syncRouter);
  app.use(reviewRouter);
  return app;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="routes/review"
```

Expected: PASS — 5/5

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/review.ts api/src/app.ts api/src/__tests__/routes/review.test.ts
git commit -m "feat(api): add Review Queue routes (list, confirm, change + rule creation)"
```

---

### Task 8: Full suite + push

- [ ] **Step 1: Run the full API test suite**

```bash
cd api && npm test
```

Expected:
```
 PASS  src/__tests__/db/client.test.ts
 PASS  src/__tests__/db/migrate.test.ts
 PASS  src/__tests__/routes/health.test.ts
 PASS  src/__tests__/lib/crypto.test.ts
 PASS  src/__tests__/truelayer/oauth.test.ts
 PASS  src/__tests__/truelayer/client.test.ts
 PASS  src/__tests__/truelayer/sync.test.ts
 PASS  src/__tests__/routes/auth.test.ts
 PASS  src/__tests__/routes/sync.test.ts
 PASS  src/__tests__/categorisation/rules.test.ts
 PASS  src/__tests__/categorisation/claude.test.ts
 PASS  src/__tests__/categorisation/pipeline.test.ts
 PASS  src/__tests__/routes/review.test.ts

Test Suites: 13 passed, 13 total
Tests:       ~35 passed, 0 failed
```

Fix any failures before pushing.

- [ ] **Step 2: Push**

```bash
git push origin claude/sleepy-ride-4eN6l
```

---

## Self-Review

### Spec coverage
- [x] Rules engine first, merchant normalised to UPPERCASE TRIM → Task 3
- [x] Claude API batch fallback → Task 4 (tool-use for reliable JSON)
- [x] Corrections create rules → Task 7 (`create_rule: true` in POST /change)
- [x] Rule prompt always shows merchant name, never old category → Task 7 (`normaliseMerchant(txn.merchant_name, txn.description)`) and tested explicitly in "creates a rule using the MERCHANT NAME (not the old category)" test
- [x] AI-categorised transactions marked `needs_review = TRUE` → Task 5
- [x] Rule-matched transactions marked `needs_review = FALSE` → Task 5
- [x] Review Queue: list pending, confirm, change → Task 7
- [x] Pipeline called after sync → Task 6

### Placeholder scan
No TBD, TODO, or vague instructions present.

### Type consistency
- `TxnForCategorisation { id, merchant_name, description }` — defined in `categorisation/types.ts`, used identically in `rules.ts`, `claude.ts`, `pipeline.ts`, and their tests.
- `CategorizationResult { id, category_name, source }` — defined in `categorisation/types.ts`, returned by `applyRules` and `batchCategorise`, consumed by `pipeline.ts`.
- `normaliseMerchant(merchant, fallback)` — defined and exported from `categorisation/rules.ts`, imported in `routes/review.ts` for rule creation. Same signature in both places.
- `runPipeline(userId, transactionIds)` — defined in `categorisation/pipeline.ts`, called in `truelayer/sync.ts` with same parameter order.
- `pool` from `@/db/client` — same import path throughout, consistent with Plans B and C.
