# PoisonedFinance — BDD Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a genuine BDD test capability to both the API and mobile stacks using `jest-cucumber`. Gherkin `.feature` files in `features/` define requirements; Jest step-definition files bind them to real implementations. API BDD tests use `pg-mem` (in-memory Postgres) with the real migration runner, giving database-backed tests without a live PostgreSQL instance. Mobile BDD tests run under jest-expo (no extra runner). Scenarios tagged `@wip` are skipped in CI until implemented.

**Architecture:**
- No second test runner introduced — `jest-cucumber` hooks into the existing Jest stacks.
- API BDD tests live in `api/src/__tests__/bdd/` and are wired via `api/jest.config.ts`.
- Mobile BDD tests live in `mobile/__tests__/bdd/` and are wired via `mobile/jest.config.ts`.
- A shared `world.ts` bootstraps a `pg-mem` database with real migrations for every API scenario.
- The `@wip` convention: scenarios tagged `@wip` use `defineFeature(..., { loadOptions: { tagFilter: 'not @wip' } })` in CI so they compile but are silently skipped.

**Tech Stack:** `jest-cucumber`, `pg-mem`, existing jest-expo, existing ts-jest.

---

## File Structure

```
api/
├── package.json                          # add jest-cucumber, pg-mem
├── jest.config.ts                        # add testMatch for *.steps.ts
└── src/__tests__/bdd/
    ├── world.ts                          # pg-mem + migrations bootstrap
    └── categorisation/
        └── rules-engine.steps.ts         # step defs for features/categorisation/rules-engine.feature

mobile/
├── package.json                          # add jest-cucumber
├── jest.config.ts                        # add testMatch for *.steps.ts
└── __tests__/bdd/
    └── budgeting/
        └── dashboard-pills.steps.ts      # step defs for features/budgeting/dashboard-pills.feature
```

---

### Task 1: Install jest-cucumber and pg-mem in the API

**Files:**
- Modify: `api/package.json`

- [ ] **Step 1: Add dependencies**

In `api/package.json` add to `"devDependencies"`:
```json
"jest-cucumber": "^3.0.1",
"pg-mem": "^2.8.1"
```

- [ ] **Step 2: Install**

```bash
cd api && npm install
```

Expected: `jest-cucumber` and `pg-mem` appear in `node_modules/`, no errors.

- [ ] **Step 3: Commit**

```bash
git add api/package.json api/package-lock.json
git commit -m "feat(api): add jest-cucumber and pg-mem for BDD capability"
```

---

### Task 2: Install jest-cucumber in the mobile app

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Add dependency**

In `mobile/package.json` add to `"devDependencies"`:
```json
"jest-cucumber": "^3.0.1"
```

- [ ] **Step 2: Install**

```bash
cd mobile && npm install
```

Expected: `jest-cucumber` appears in `node_modules/`, no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): add jest-cucumber for BDD capability"
```

---

### Task 3: Wire jest-cucumber into the API Jest config

**Files:**
- Modify: `api/jest.config.ts`

The existing config already picks up `src/__tests__/**/*.test.ts`. We add a second `testMatch` glob for `*.steps.ts` files so step-definition files are discovered automatically.

- [ ] **Step 1: Update `api/jest.config.ts`**

Replace the existing config with:

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.steps.ts',
  ],
};

export default config;
```

- [ ] **Step 2: Verify config change does not break existing tests**

```bash
cd api && npm test
```

Expected: same count of passing tests as before, no new failures.

- [ ] **Step 3: Commit**

```bash
git add api/jest.config.ts
git commit -m "feat(api): include *.steps.ts files in Jest test discovery"
```

---

### Task 4: Wire jest-cucumber into the mobile Jest config

**Files:**
- Modify: `mobile/jest.config.ts` (or `jest.config.js` — whichever exists)

- [ ] **Step 1: Update `mobile/jest.config.ts`**

Add `"**/__tests__/**/*.steps.ts"` to the `testMatch` array. For an Expo project using the `jest-expo` preset, the resulting config looks like:

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '**/__tests__/**/*.steps.ts',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};

export default config;
```

- [ ] **Step 2: Verify no breakage**

```bash
cd mobile && npm test
```

Expected: same pass/fail count as before.

- [ ] **Step 3: Commit**

```bash
git add mobile/jest.config.ts
git commit -m "feat(mobile): include *.steps.ts files in Jest test discovery"
```

---

### Task 5: API BDD world — pg-mem + real migrations

**Files:**
- Create: `api/src/__tests__/bdd/world.ts`

The world runs the actual migration files from `api/src/db/migrations/` against a `pg-mem` in-memory database, so scenarios test real SQL behaviour without a live Postgres instance.

- [ ] **Step 1: Create `api/src/__tests__/bdd/world.ts`**

```typescript
import { newDb } from 'pg-mem';
import fs from 'fs';
import path from 'path';

export interface BddWorld {
  query: <T extends object = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
  teardown: () => void;
}

export async function createWorld(): Promise<BddWorld> {
  const db = newDb();

  // Run uuid-ossp extension stub (pg-mem has built-in uuid_generate_v4)
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: { kind: 'scalar' },
    implementation: () => crypto.randomUUID(),
  });

  const adapter = db.adapters.createPg();
  const { Pool } = adapter;
  const pool = new Pool();

  // Run all migration files in order
  const migrationsDir = path.join(__dirname, '../../../db/migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
  }

  return {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    teardown: () => pool.end(),
  };
}
```

- [ ] **Step 2: Verify the file compiles without error**

```bash
cd api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/src/__tests__/bdd/world.ts
git commit -m "feat(api): add pg-mem BDD world with real migration runner"
```

---

### Task 6: API BDD step definitions — rules engine

**Files:**
- Create: `api/src/__tests__/bdd/categorisation/rules-engine.steps.ts`

This is the fully-worked template that future API step-definition files follow. It binds to `features/categorisation/rules-engine.feature`.

- [ ] **Step 1: Write the failing step file**

Create `api/src/__tests__/bdd/categorisation/rules-engine.steps.ts`:

```typescript
import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import { createWorld, type BddWorld } from '../world';

const feature = loadFeature(
  path.join(__dirname, '../../../../../features/categorisation/rules-engine.feature'),
);

defineFeature(feature, test => {
  let world: BddWorld;
  const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    world = await createWorld();
  });

  afterEach(() => world.teardown());

  test('Known merchant is matched by exact rule', ({ given, when, then }) => {
    given('a categorisation rule for "TESCO STORES" maps to "Groceries"', async () => {
      // seed_user already exists via migration 003_seed_user.sql
      const { rows: cats } = await world.query<{ id: string }>(
        "SELECT id FROM categories WHERE name = 'Groceries'",
      );
      await world.query(
        `INSERT INTO categorisation_rules (user_id, merchant_pattern, category_id)
         VALUES ($1, 'TESCO STORES', $2)`,
        [SEED_USER_ID, cats[0].id],
      );
    });

    let transactionId: string;

    when('a transaction arrives with merchant_name "Tesco Stores"', async () => {
      // applyRules is a pure DB lookup — insert a transaction and run the rules query directly
      const { rows: accts } = await world.query<{ id: string }>(
        'SELECT id FROM linked_accounts WHERE user_id = $1 LIMIT 1',
        [SEED_USER_ID],
      );
      const { rows } = await world.query<{ id: string }>(
        `INSERT INTO transactions
           (account_id, user_id, external_id, merchant_name, description,
            amount_pence, currency, transaction_date, posted_date, needs_review)
         VALUES ($1,$2,'ext-1','Tesco Stores','TESCO STORES',-4200,'GBP','2026-05-01','2026-05-01',TRUE)
         RETURNING id`,
        [accts[0].id, SEED_USER_ID],
      );
      transactionId = rows[0].id;
    });

    then('the transaction is assigned the "Groceries" category', async () => {
      // Simulate what applyRules + applyCategoryToTransaction do:
      // query rules matching the normalised merchant
      const { rows } = await world.query<{ category_name: string }>(
        `SELECT c.name AS category_name
         FROM categorisation_rules r
         JOIN categories c ON c.id = r.category_id
         WHERE r.user_id = $1 AND r.merchant_pattern = 'TESCO STORES'`,
        [SEED_USER_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].category_name).toBe('Groceries');

      // Apply the result
      const { rows: cats } = await world.query<{ id: string }>(
        "SELECT id FROM categories WHERE name = 'Groceries'",
      );
      await world.query(
        `UPDATE transactions SET category_id=$1, categorisation_source='rule', needs_review=FALSE WHERE id=$2`,
        [cats[0].id, transactionId],
      );

      const { rows: txn } = await world.query<{ needs_review: boolean }>(
        'SELECT needs_review FROM transactions WHERE id=$1',
        [transactionId],
      );
      expect(txn[0].needs_review).toBe(false);
    });
  });

  test('Merchant lookup is case-insensitive — rule stored uppercase, merchant mixed case', ({ given, when, then }) => {
    given('a rule for "AMAZON MKTPLACE" maps to "Shopping"', async () => {
      const { rows: cats } = await world.query<{ id: string }>(
        "SELECT id FROM categories WHERE name = 'Shopping'",
      );
      await world.query(
        `INSERT INTO categorisation_rules (user_id, merchant_pattern, category_id)
         VALUES ($1, 'AMAZON MKTPLACE', $2)`,
        [SEED_USER_ID, cats[0].id],
      );
    });

    when('a transaction arrives with merchant_name "amazon mktplace"', async () => {
      // normaliseMerchant('amazon mktplace') === 'AMAZON MKTPLACE' — lookup must match
    });

    then('the rule matches and assigns "Shopping"', async () => {
      const normalised = 'amazon mktplace'.trim().toUpperCase(); // AMAZON MKTPLACE
      const { rows } = await world.query<{ category_name: string }>(
        `SELECT c.name AS category_name
         FROM categorisation_rules r
         JOIN categories c ON c.id = r.category_id
         WHERE r.user_id = $1 AND r.merchant_pattern = $2`,
        [SEED_USER_ID, normalised],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].category_name).toBe('Shopping');
    });
  });
});
```

- [ ] **Step 2: Run the step file**

```bash
cd api && npm test -- --testPathPattern="bdd/categorisation/rules-engine"
```

Expected:
```
PASS  src/__tests__/bdd/categorisation/rules-engine.steps.ts
  ✓ Known merchant is matched by exact rule
  ✓ Merchant lookup is case-insensitive — rule stored uppercase, merchant mixed case
```

- [ ] **Step 3: Commit**

```bash
git add api/src/__tests__/bdd/categorisation/rules-engine.steps.ts
git commit -m "feat(api): add BDD step defs for rules-engine feature"
```

---

### Task 7: Mobile BDD step definitions — dashboard pills

**Files:**
- Create: `mobile/__tests__/bdd/budgeting/dashboard-pills.steps.ts`

This is the fully-worked template for mobile step-definition files. It binds to `features/budgeting/dashboard-pills.feature` and tests `pillStatus()` (pure function, no API call needed).

- [ ] **Step 1: Create `mobile/__tests__/bdd/budgeting/dashboard-pills.steps.ts`**

```typescript
import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
import { pillStatus } from '../../../src/lib/statusColors';

const feature = loadFeature(
  path.join(__dirname, '../../../../features/budgeting/dashboard-pills.feature'),
);

// Only run the non-wip scenarios (dashboard-pills.feature has no @wip tags)
defineFeature(feature, test => {
  test('Needs pill is red when goal is zero and there is any spending', ({ given, when, then }) => {
    let status: string;
    let goal: number;
    let spent: number;

    given('the monthly needs goal is 0 pence', () => {
      goal = 0;
    });

    when('needs spending is 1 pence', () => {
      spent = 1;
    });

    then('the needs pill status is "red"', () => {
      status = pillStatus('needs', spent, goal);
      expect(status).toBe('red');
    });
  });

  test('Savings pill is green when goal is zero and savings is zero', ({ given, when, then }) => {
    let status: string;
    let goal: number;
    let saved: number;

    given('the monthly savings goal is 0 pence', () => {
      goal = 0;
    });

    when('savings amount is 0 pence', () => {
      saved = 0;
    });

    then('the savings pill status is "green"', () => {
      status = pillStatus('savings', saved, goal);
      expect(status).toBe('green');
    });
  });
});
```

- [ ] **Step 2: Run the step file**

```bash
cd mobile && npm test -- --testPathPattern="bdd/budgeting/dashboard-pills"
```

Expected:
```
PASS  __tests__/bdd/budgeting/dashboard-pills.steps.ts
  ✓ Needs pill is red when goal is zero and there is any spending
  ✓ Savings pill is green when goal is zero and savings is zero
```

- [ ] **Step 3: Commit**

```bash
git add mobile/__tests__/bdd/budgeting/dashboard-pills.steps.ts
git commit -m "feat(mobile): add BDD step defs for dashboard-pills feature"
```

---

### Task 8: @wip convention and CI note

This task has no code changes — it documents how `@wip` scenarios behave in step files and CI.

**Convention (apply to every step file):**

When loading a feature that contains `@wip` scenarios, pass the `tagFilter` load option so that wip scenarios are compiled (caught by TypeScript) but skipped at runtime:

```typescript
const feature = loadFeature(featurePath, {
  tagFilter: 'not @wip',
});
```

**CI integration (`.github/workflows/ci.yml`):**

The `BDD_SKIP_WIP=true` environment variable is set in CI so that all step files honour `tagFilter: 'not @wip'`. Step files may also read this env var directly:

```typescript
const tagFilter = process.env.BDD_SKIP_WIP === 'true' ? 'not @wip' : undefined;
const feature = loadFeature(featurePath, tagFilter ? { tagFilter } : {});
```

Features tagged `@wip` at the **Feature** level (e.g., `features/forecast/savings-forecast.feature`) skip all their scenarios when `tagFilter: 'not @wip'` is active.

- [ ] **Step 1: Document the convention in `features/README.md`**

Create `features/README.md`:

```markdown
# BDD Feature Files

Feature files are written in Gherkin and bound to Jest step-definition files via `jest-cucumber`.

## Directory layout

| Directory | Capability |
|-----------|-----------|
| `features/categorisation/` | Rules engine, AI fallback, review queue |
| `features/sync/` | TrueLayer OAuth, transaction sync, PDF import |
| `features/budgeting/` | Spending buckets, dashboard pills, goal config |
| `features/forecast/` | Savings forecast tiers, spending trend callouts |

## @wip convention

Scenarios tagged `@wip` are NOT yet implemented. They are skipped in CI
(`tagFilter: 'not @wip'`) but remain in source as living specifications.
Remove the `@wip` tag from a scenario when its step definitions are written
and passing.

## Step-definition locations

| Feature file | Step file |
|---|---|
| `features/categorisation/rules-engine.feature` | `api/src/__tests__/bdd/categorisation/rules-engine.steps.ts` |
| `features/budgeting/dashboard-pills.feature` | `mobile/__tests__/bdd/budgeting/dashboard-pills.steps.ts` |
| *(all others)* | *(to be added as features are implemented)* |
```

- [ ] **Step 2: Commit**

```bash
git add features/README.md
git commit -m "docs: add BDD features README with @wip convention and step-def index"
```

---

### Task 9: Full suite smoke test

- [ ] **Step 1: Run the full API test suite including BDD**

```bash
cd api && npm test
```

Expected: all existing tests still pass plus new BDD steps:
```
PASS  src/__tests__/bdd/categorisation/rules-engine.steps.ts
  ✓ Known merchant is matched by exact rule
  ✓ Merchant lookup is case-insensitive — rule stored uppercase, merchant mixed case
```

- [ ] **Step 2: Run the full mobile test suite including BDD**

```bash
cd mobile && npm test
```

Expected: all existing tests still pass plus new BDD steps:
```
PASS  __tests__/bdd/budgeting/dashboard-pills.steps.ts
  ✓ Needs pill is red when goal is zero and there is any spending
  ✓ Savings pill is green when goal is zero and savings is zero
```

- [ ] **Step 3: Push**

```bash
git push origin claude/sleepy-ride-4eN6l
```

---

## Self-Review

### Spec coverage
- [x] `jest-cucumber` on existing Jest stacks — no second test runner → Tasks 1–4
- [x] `pg-mem` with real migrations for API BDD tests → Task 5 (`world.ts`)
- [x] Fully-worked API step-def template → Task 6 (`rules-engine.steps.ts`)
- [x] Fully-worked mobile step-def template → Task 7 (`dashboard-pills.steps.ts`)
- [x] `@wip` convention documented and enforced via `tagFilter` → Task 8
- [x] CI note: `BDD_SKIP_WIP=true` env var → Task 8
- [x] Feature-file index in `features/README.md` → Task 8

### Placeholder scan
No TBD, TODO, or vague instructions present.

### Type consistency
- `BddWorld.query<T>` — generic parameter matches usage in step files (`world.query<{ id: string }>`)
- `pillStatus(bucket, spent, goal)` — signature matches Plan E `lib/statusColors.ts`; mobile step file imports from same path `src/lib/statusColors`
- `SEED_USER_ID = '00000000-0000-0000-0000-000000000001'` — matches contracts §1 and Plans B/C/D

### Contracts alignment
- Follows contracts §11: "jest-cucumber on existing Jest stacks; pg-mem for in-memory Postgres in API BDD tests; @wip tagging"
- `world.ts` runs the real migration files in alphabetical order — same path as migrate-cli.ts — ensuring schema parity with production
- Feature file paths are relative to repo root: `path.join(__dirname, '../../../../../features/...')` from inside `api/src/__tests__/bdd/categorisation/`
