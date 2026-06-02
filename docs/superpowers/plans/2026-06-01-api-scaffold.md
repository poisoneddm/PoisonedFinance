# PoisonedFinance — API Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Node.js/TypeScript backend in `api/` with Express, a `pg` database client, plain-SQL migrations, default category seed data, and a `/health` endpoint. At the end you have a server that connects to Postgres, runs migrations on boot, and responds to HTTP.

**Architecture:** Single Express app in `api/src/`. Migrations are plain `.sql` files executed in order by a custom `migrate.ts` runner that tracks state in a `_migrations` table. No ORM — raw `pg` queries throughout. The app factory lives in `app.ts` (no `listen`) so it can be imported in tests; `index.ts` calls `listen`.

**Tech Stack:** Node.js 20, TypeScript 5.4, Express 4, `pg` 8, `dotenv`, `cors`, `helmet`, Jest + `ts-jest` + `supertest`

---

## File Structure

```
api/
├── package.json                              # deps, scripts, jest config
├── tsconfig.json                             # strict, commonjs, @/ alias
├── .env.example                              # required env vars
└── src/
    ├── index.ts                              # boot: runMigrations() → app.listen()
    ├── app.ts                                # Express factory (no listen — testable)
    ├── db/
    │   ├── client.ts                         # pg.Pool singleton
    │   ├── migrate.ts                        # run pending .sql files in sorted order
    │   └── migrations/
    │       ├── 001_initial_schema.sql        # users, bank_connections, linked_accounts,
    │       │                                 # categories, categorisation_rules,
    │       │                                 # transactions, monthly_goals
    │       ├── 002_seed_categories.sql       # 11 default categories with colours
    │       └── 003_seed_user.sql             # single seed user for MVP auth bootstrap
    ├── lib/
    │   └── currentUser.ts                    # SEED_USER_ID constant
    ├── routes/
    │   └── health.ts                         # GET /health (pings DB)
    └── types/
        └── index.ts                          # Shared TS types (no tests needed)
```

Tests mirror source under `api/src/__tests__/`.

---

### Task 1: Project config

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/.env.example`

- [ ] **Step 1: Create `api/package.json`**

```json
{
  "name": "poisonedfinance-api",
  "version": "0.1.0",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc && cp -r src/db/migrations dist/db/migrations",
    "start": "node dist/index.js",
    "test": "jest --runInBand --forceExit"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "helmet": "^7.1.0",
    "pg": "^8.11.5"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.7",
    "@types/pg": "^8.11.5",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/src/$1"
    }
  }
}
```

- [ ] **Step 2: Create `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `api/.env.example`**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/poisonedfinance
PORT=3000
ENCRYPTION_KEY=<32-byte base64 key — run: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
TRUELAYER_REDIRECT_URI=http://localhost:3000/auth/callback
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: Install dependencies**

```bash
cd api && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add api/package.json api/tsconfig.json api/.env.example
git commit -m "feat(api): initialise Node.js/TypeScript API project"
```

---

### Task 2: Shared TypeScript types

**Files:**
- Create: `api/src/types/index.ts`

No tests for pure type declarations.

- [ ] **Step 1: Create `api/src/types/index.ts`**

```typescript
export type MetaBucket = 'needs' | 'wants' | 'savings';
export type CategorizationSource = 'rule' | 'ai' | 'manual' | 'confirmed';

export interface User {
  id: string;
  email: string;
  created_at: Date;
}

export interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: Date;
  created_at: Date;
}

export interface LinkedAccount {
  id: string;
  user_id: string;
  connection_id: string;
  provider: string;
  external_id: string;
  account_name: string;
  account_type: string;
  currency: string;
  last_synced_at: Date | null;
  created_at: Date;
}

export interface Category {
  id: string;
  name: string;
  meta_bucket: MetaBucket;
  color_hex: string;
}

export interface CategorizationRule {
  id: string;
  user_id: string;
  merchant_pattern: string;
  category_id: string;
  created_at: Date;
}

export interface Transaction {
  id: string;
  account_id: string;
  user_id: string;
  external_id: string;
  merchant_name: string | null;
  description: string;
  amount_pence: number;
  currency: string;
  transaction_date: Date;
  posted_date: Date | null;
  category_id: string | null;
  categorisation_source: CategorizationSource | null;
  needs_review: boolean;
  created_at: Date;
}

export interface MonthlyGoal {
  id: string;
  user_id: string;
  year: number;
  month: number;
  needs_pct: number;
  wants_pct: number;
  savings_pct: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/types/index.ts
git commit -m "feat(api): add shared TypeScript domain types"
```

---

### Task 3: Database client

**Files:**
- Create: `api/src/db/client.ts`
- Create: `api/src/__tests__/db/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/db/client.test.ts`:

```typescript
import { Pool } from 'pg';

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({})),
}));

describe('db client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://test:test@localhost/testdb' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a Pool with DATABASE_URL and max:10', () => {
    require('@/db/client');
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://test:test@localhost/testdb',
      max: 10,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd api && npm test -- --testPathPattern="db/client"
```

Expected: FAIL — `Cannot find module '@/db/client'`

- [ ] **Step 3: Create `api/src/db/client.ts`**

```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd api && npm test -- --testPathPattern="db/client"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/db/client.ts api/src/__tests__/db/client.test.ts
git commit -m "feat(api): add pg Pool singleton"
```

---

### Task 4: SQL migrations

**Files:**
- Create: `api/src/db/migrations/001_initial_schema.sql`
- Create: `api/src/db/migrations/002_seed_categories.sql`
- Create: `api/src/db/migrate.ts`
- Create: `api/src/__tests__/db/migrate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/db/migrate.test.ts`:

```typescript
import path from 'path';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

// Provide two fake migration files
jest.mock('fs', () => ({
  readdirSync: jest.fn(() => ['002_second.sql', '001_first.sql']),
  readFileSync: jest.fn((p: string) => `-- content of ${path.basename(p)}`),
}));

import { runMigrations } from '@/db/migrate';

beforeEach(() => {
  mockQuery.mockReset();
  // Default: _migrations table already exists, files not yet run
  mockQuery.mockResolvedValue({ rows: [] });
});

it('creates _migrations tracking table', async () => {
  await runMigrations();
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS _migrations'),
  );
});

it('runs migrations in sorted (alphabetical) order', async () => {
  const executed: string[] = [];
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (Array.isArray(params) && typeof params[0] === 'string' && sql.includes('INSERT INTO _migrations')) {
      executed.push(params[0] as string);
    }
    return { rows: [] };
  });

  await runMigrations();

  expect(executed).toEqual(['001_first.sql', '002_second.sql']);
});

it('skips migrations already recorded in _migrations', async () => {
  mockQuery.mockImplementation(async (sql: string) => {
    // Return a row when checking if migration is already run
    if (sql.includes('SELECT 1 FROM _migrations')) return { rows: [{ exists: true }] };
    return { rows: [] };
  });

  await runMigrations();

  // readFileSync should never be called because both files are skipped
  const fs = require('fs');
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

it('issues BEGIN before running each migration', async () => {
  await runMigrations();
  const calls = (mockQuery.mock.calls as [string, ...unknown[]][]).map(c => c[0]);
  expect(calls).toContain('BEGIN');
});

it('rolls back and rethrows when a migration SQL errors', async () => {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('-- content of')) throw new Error('syntax error');
    return { rows: [] };
  });

  await expect(runMigrations()).rejects.toThrow('syntax error');
  const calls = (mockQuery.mock.calls as [string, ...unknown[]][]).map(c => c[0]);
  expect(calls).toContain('ROLLBACK');
  // COMMIT must not have been issued
  expect(calls).not.toContain('COMMIT');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="db/migrate"
```

Expected: FAIL — `Cannot find module '@/db/migrate'`

- [ ] **Step 3: Create `api/src/db/migrations/001_initial_schema.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT        NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bank_connections (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           TEXT        NOT NULL,
  access_token_enc   TEXT        NOT NULL,
  refresh_token_enc  TEXT        NOT NULL,
  token_expires_at   TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE linked_accounts (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  provider       TEXT        NOT NULL DEFAULT 'truelayer',
  external_id    TEXT        NOT NULL,
  account_name   TEXT        NOT NULL,
  account_type   TEXT        NOT NULL,
  currency       TEXT        NOT NULL DEFAULT 'GBP',
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  meta_bucket TEXT NOT NULL CHECK (meta_bucket IN ('needs', 'wants', 'savings')),
  color_hex   TEXT NOT NULL
);

CREATE TABLE categorisation_rules (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_pattern TEXT        NOT NULL,
  category_id      UUID        NOT NULL REFERENCES categories(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_pattern)
);

CREATE TABLE transactions (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id             UUID        NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
  user_id                UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id            TEXT        NOT NULL,
  merchant_name          TEXT,
  description            TEXT        NOT NULL,
  amount_pence           INTEGER     NOT NULL,
  currency               TEXT        NOT NULL DEFAULT 'GBP',
  transaction_date       DATE        NOT NULL,
  posted_date            DATE,
  category_id            UUID        REFERENCES categories(id),
  categorisation_source  TEXT        CHECK (categorisation_source IN ('rule', 'ai', 'manual', 'confirmed')),
  needs_review           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, external_id)
);

CREATE INDEX idx_transactions_user_date ON transactions (user_id, transaction_date);
CREATE INDEX idx_transactions_needs_review ON transactions (user_id, needs_review) WHERE needs_review = TRUE;

CREATE TABLE monthly_goals (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  needs_pct  INTEGER NOT NULL DEFAULT 40,
  wants_pct  INTEGER NOT NULL DEFAULT 20,
  savings_pct INTEGER NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month),
  CONSTRAINT pct_sum_100 CHECK (needs_pct + wants_pct + savings_pct = 100)
);
```

- [ ] **Step 4: Create `api/src/db/migrations/002_seed_categories.sql`**

```sql
INSERT INTO categories (name, meta_bucket, color_hex) VALUES
  ('Groceries',         'needs',   '#60a5fa'),
  ('Transport',         'needs',   '#bfdbfe'),
  ('Fuel',              'needs',   '#dbeafe'),
  ('Bills & Utilities', 'needs',   '#93c5fd'),
  ('Health',            'needs',   '#a5f3fc'),
  ('Eating Out',        'wants',   '#f472b6'),
  ('Shopping',          'wants',   '#c084fc'),
  ('Subscriptions',     'wants',   '#fbcfe8'),
  ('Entertainment',     'wants',   '#fce7f3'),
  ('Travel',            'wants',   '#99f6e4'),
  ('Savings',           'savings', '#4ade80')
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 5: Create `api/src/db/migrations/003_seed_user.sql`**

```sql
INSERT INTO users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'owner@poisonedfinance.local')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 6: Create `api/src/db/migrate.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import { pool } from './client';

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      run_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _migrations WHERE filename = $1',
      [filename],
    );
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
      await pool.query('COMMIT');
      console.log(`[migrate] ran ${filename}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="db/migrate"
```

Expected: PASS — 5/5

- [ ] **Step 8: Commit**

```bash
git add api/src/db/migrate.ts api/src/db/migrations/ api/src/__tests__/db/migrate.test.ts
git commit -m "feat(api): add SQL migration runner and initial schema + category seed"
```

---

### Task 5: Express app and health route

**Files:**
- Create: `api/src/routes/health.ts`
- Create: `api/src/app.ts`
- Create: `api/src/__tests__/routes/health.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/routes/health.test.ts`:

```typescript
import request from 'supertest';
import { createApp } from '@/app';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const app = createApp();

describe('GET /health', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 with ok:true when DB responds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'connected' });
  });

  it('returns 503 with ok:false when DB throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: 'unavailable' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="routes/health"
```

Expected: FAIL — `Cannot find module '@/app'`

- [ ] **Step 3: Create `api/src/routes/health.ts`**

```typescript
import { Router } from 'express';
import { pool } from '@/db/client';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'unavailable' });
  }
});

export default router;
```

- [ ] **Step 4: Create `api/src/app.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  return app;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="routes/health"
```

Expected: PASS — 2/2

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/health.ts api/src/app.ts api/src/__tests__/routes/health.test.ts
git commit -m "feat(api): add Express app factory and GET /health endpoint"
```

---

### Task 6: Seed user helper

**Files:**
- Create: `api/src/lib/currentUser.ts`
- Create: `api/src/__tests__/lib/currentUser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/lib/currentUser.test.ts`:

```typescript
import { SEED_USER_ID } from '@/lib/currentUser';

describe('SEED_USER_ID', () => {
  it('is the fixed UUID from contracts §1', () => {
    expect(SEED_USER_ID).toBe('00000000-0000-0000-0000-000000000001');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd api && npm test -- --testPathPattern="lib/currentUser"
```

Expected: FAIL — `Cannot find module '@/lib/currentUser'`

- [ ] **Step 3: Create `api/src/lib/currentUser.ts`**

```typescript
/** Fixed seed user UUID — MVP single-user auth bootstrap (contracts §1). */
export const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd api && npm test -- --testPathPattern="lib/currentUser"
```

Expected: PASS — 1/1

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/currentUser.ts api/src/__tests__/lib/currentUser.test.ts
git commit -m "feat(api): add SEED_USER_ID constant for MVP auth bootstrap"
```

---

### Task 7: Entry point

**Files:**
- Create: `api/src/index.ts`

No unit tests — this is the boot shim. Verified manually.

- [ ] **Step 1: Create `api/src/index.ts`**

```typescript
import 'dotenv/config';
import { createApp } from '@/app';
import { runMigrations } from '@/db/migrate';

const PORT = process.env.PORT ?? '3000';

async function main() {
  await runMigrations();
  const app = createApp();
  app.listen(Number(PORT), () => {
    console.log(`[api] listening on :${PORT}`);
  });
}

main().catch(err => {
  console.error('[api] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/src/index.ts
git commit -m "feat(api): add boot entry point (migrations → listen)"
```

---

### Task 8: Full suite + push

- [ ] **Step 1: Run the full test suite**

```bash
cd api && npm test
```

Expected:
```
 PASS  src/__tests__/db/client.test.ts
 PASS  src/__tests__/db/migrate.test.ts
 PASS  src/__tests__/routes/health.test.ts
 PASS  src/__tests__/lib/currentUser.test.ts

Test Suites: 4 passed, 4 total
Tests:       9 passed, 0 failed
```

Fix any failures before pushing.

- [ ] **Step 2: Push**

```bash
git push origin claude/sleepy-ride-4eN6l
```

---

## Self-Review

### Spec coverage
- [x] Node.js/TypeScript project → Task 1
- [x] PostgreSQL schema (users, bank_connections, linked_accounts with connection_id FK, categories, rules, transactions, monthly_goals) → Task 4
- [x] `bank_connections` table with token columns; `linked_accounts` references it via `connection_id` (no token columns on linked_accounts) → Task 4 (`001_initial_schema.sql`)
- [x] `BankConnection` interface and updated `LinkedAccount` (connection_id, no token fields) → Task 2
- [x] Default category seed (all 11 categories with correct meta-buckets and colours) → Task 4 (`002_seed_categories.sql`)
- [x] Seed user migration → Task 4 (`003_seed_user.sql`)
- [x] Migration runner (idempotent, sorted, tracked, BEGIN/COMMIT/ROLLBACK per file) → Task 4
- [x] Migration tests assert BEGIN is issued and ROLLBACK fires on error → Task 4
- [x] `lib/currentUser.ts` exporting SEED_USER_ID → Task 6
- [x] Express server with health check → Tasks 5 and 7

### Placeholder scan
No TBD, TODO, or vague instructions. Every step includes complete file content or exact commands.

### Type consistency
- `pool` exported from `@/db/client` — imported identically in `migrate.ts`, `routes/health.ts`, and all tests via mock path `@/db/client`.
- `MetaBucket`, `CategorizationSource` defined in `@/types/index.ts` — will be imported by Plan C and Plan D without redefinition.
- `BankConnection` and `LinkedAccount` types in `@/types/index.ts` match the `bank_connections` and `linked_accounts` schema columns exactly.
- `SEED_USER_ID` exported from `@/lib/currentUser` — imported by routes/tests in Plans C and D via the same path.
- `createApp()` defined in `app.ts`, imported in `index.ts` and in health test — same path `@/app`.
