# PoisonedFinance — Developer Specification
_Last updated: 2026-06-01 · Authoritative reference for all development work_

---

## Table of Contents

1. [App Overview](#1-app-overview)
2. [Tech Stack](#2-tech-stack)
3. [Implementation Phases](#3-implementation-phases)
4. [Repository Structure](#4-repository-structure)
5. [Database Schema](#5-database-schema)
6. [Business Logic](#6-business-logic)
7. [API Reference](#7-api-reference)
8. [Mobile Screens & User Stories](#8-mobile-screens--user-stories)
9. [Categorisation Pipeline](#9-categorisation-pipeline)
10. [BDD Feature Specs](#10-bdd-feature-specs)
11. [Environment Setup](#11-environment-setup)
12. [Testing Guide](#12-testing-guide)
13. [Deployment Guide](#13-deployment-guide)
14. [Key Conventions](#14-key-conventions)
15. [Security Constraints](#15-security-constraints)

---

## 1. App Overview

PoisonedFinance is a personal finance app for UK users. It connects to UK bank accounts via Open Banking (TrueLayer), automatically categorises transactions using a rules engine and Claude AI, and tracks spending against a 40/20/40 Needs/Wants/Savings budget model.

**Core value proposition:** Connect your bank → transactions are auto-categorised → see at a glance whether you're on track for your savings goal this month.

**MVP scope:** Single user (seeded in the database). No registration/login flow in v1. Multi-user auth is a future phase.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile frontend | React Native (Expo SDK 51) | Expo Router for navigation |
| Backend | Node.js + TypeScript | Express, compiled to `dist/` |
| Database | PostgreSQL | Hosted on Fly.io Postgres |
| Open Banking | TrueLayer | UK banks: NatWest, Halifax, Monzo |
| AI categorisation | Claude API | Model: `claude-sonnet-4-6`, batch mode |
| Hosting | Fly.io | Free tier, region `lhr` (London) |
| Testing | Jest + jest-cucumber | BDD feature specs in Gherkin |
| CI | GitHub Actions | Tests on every push, deploy on `main` |

---

## 3. Implementation Phases

### Phase 1 — Repo & Tooling ✅
- Interactive HTML mockup (`mockup/index.html`) — visual prototype of all screens
- `.claude/settings.json` + session-start hook for Claude Code integration
- Design spec and contracts documents (`docs/superpowers/specs/`)
- CI/CD pipeline (GitHub Actions for tests + deploy)

### Phase 2 — Backend Scaffold ✅
- Expo app skeleton with bottom tab navigation (5 tabs, stub screens)
- Node.js/TypeScript API project with Express
- PostgreSQL schema migrations (7 tables)
- TrueLayer OAuth flow: redirect → consent → callback → token storage
- Account and transaction sync (180-day initial window)
- Categorisation pipeline: rules engine + Claude API batch

### Phase 3 — Core Features ✅
- Dashboard, Spending, Transactions, Forecast screens wired to real API data
- Review Queue: AI-suggested categories the user confirms or changes
- Category Edit: change a transaction's category + create a rule for future matches
- Goal configuration: override default 40/20/40 percentages per month
- PDF statement upload as a fallback sync method

### Phase 4 — Forecast & Polish ✅
- Savings forecast with 4 tiers (Goal / Realistic / Stretch / Actual)
- Spending trend callouts (consistent, increasing, suggestion)
- Fly.io deployment with transactional migration runner
- BDD feature specs (jest-cucumber) for all capabilities

### Phase 5 — Future (not yet started)
- Multi-user auth (real registration/login)
- Push notifications for budget alerts
- Recurring transaction detection
- Export to CSV/PDF

---

## 4. Repository Structure

```
PoisonedFinance/
├── api/                        # Node.js backend
│   ├── src/
│   │   ├── routes/             # Express route handlers
│   │   │   ├── auth.ts         # TrueLayer OAuth
│   │   │   ├── dashboard.ts    # Dashboard endpoint
│   │   │   ├── forecast.ts     # Savings forecast
│   │   │   ├── goals.ts        # Monthly goals
│   │   │   ├── health.ts       # DB health check
│   │   │   ├── importPdf.ts    # PDF upload
│   │   │   ├── review.ts       # Review queue
│   │   │   ├── spending.ts     # Spending breakdown
│   │   │   ├── sync.ts         # TrueLayer sync
│   │   │   └── transactions.ts # Transaction list
│   │   ├── db/
│   │   │   ├── migrations/     # SQL migration files (run in order)
│   │   │   │   ├── 001_initial_schema.sql
│   │   │   │   ├── 002_seed_categories.sql
│   │   │   │   └── 003_seed_user.sql
│   │   │   ├── pool.ts         # pg connection pool
│   │   │   └── migrate-cli.ts  # Migration runner (used by Fly.io release_command)
│   │   ├── categorisation/
│   │   │   ├── rules.ts        # normaliseMerchant + rules lookup
│   │   │   └── aiCategorise.ts # Claude API batch categorisation
│   │   ├── forecast/
│   │   │   ├── forecast.ts     # 4-tier forecast calculations
│   │   │   └── insights.ts     # Trend callout logic
│   │   ├── truelayer/
│   │   │   └── tokens.ts       # getValidAccessToken (refresh if near expiry)
│   │   ├── lib/
│   │   │   ├── currentUser.ts  # SEED_USER_ID constant
│   │   │   ├── goals.ts        # getOrCreateGoal (auto-seed 40/20/40)
│   │   │   └── pillStatus.ts   # Pure pill status function (shared with mobile)
│   │   └── __tests__/
│   │       └── features/       # BDD step definitions (API scenarios)
│   │           ├── world.ts    # pg-mem test world
│   │           └── categorisation/rules-engine.steps.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── mobile/                     # React Native (Expo) app
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx     # Tab bar config (5 tabs)
│   │   │   ├── index.tsx       # Dashboard screen
│   │   │   ├── spending.tsx    # Spending screen
│   │   │   ├── forecast.tsx    # Forecast screen
│   │   │   ├── transactions.tsx # Transactions screen
│   │   │   └── settings.tsx   # Settings (PDF upload)
│   │   ├── review.tsx          # Review Queue screen
│   │   ├── category-edit.tsx   # Category Edit screen
│   │   └── _layout.tsx         # Root layout
│   ├── lib/
│   │   ├── api.ts              # apiGet / apiPost / apiPut helpers
│   │   ├── format.ts           # formatPence / formatPenceShort
│   │   └── statusColors.ts     # PillLevel → theme color tokens
│   ├── constants/
│   │   └── theme.ts            # Color palette
│   └── __tests__/
│       └── features/           # BDD step definitions (mobile scenarios)
│           └── budgeting/dashboard-pills.steps.ts
│
├── features/                   # Gherkin feature files (shared)
│   ├── categorisation/
│   │   ├── rules-engine.feature
│   │   ├── ai-fallback.feature
│   │   └── review-and-rules.feature
│   ├── sync/
│   │   ├── truelayer-oauth.feature
│   │   ├── transaction-sync.feature
│   │   └── pdf-import.feature
│   ├── budgeting/
│   │   ├── dashboard-pills.feature
│   │   ├── goal-config.feature
│   │   └── spending-buckets.feature
│   └── forecast/
│       ├── savings-forecast.feature
│       └── spending-trends.feature
│
├── docs/
│   └── superpowers/specs/
│       ├── 2026-06-01-poisonedfinance-design.md
│       └── 2026-06-01-contracts-and-revisions.md  ← canonical source of truth
│
├── mockup/
│   └── index.html              # Interactive HTML prototype (open in browser)
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # Tests on every push/PR
│       └── deploy.yml          # Deploy to Fly.io on merge to main
│
├── fly.toml                    # Fly.io app configuration
└── SPEC.md                     # This document
```

---

## 5. Database Schema

All migrations live in `api/src/db/migrations/` and run in filename order. The migration runner wraps each file in `BEGIN`/`COMMIT`; a failure triggers `ROLLBACK` and aborts the deploy.

### Table: `users`
```sql
CREATE TABLE users (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
Seeded by `003_seed_user.sql`:
- `id = '00000000-0000-0000-0000-000000000001'`
- `email = 'owner@poisonedfinance.local'`

### Table: `bank_connections`
```sql
CREATE TABLE bank_connections (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          TEXT        NOT NULL,               -- e.g. 'truelayer'
  access_token_enc  TEXT        NOT NULL,               -- AES-256-GCM encrypted
  refresh_token_enc TEXT        NOT NULL,               -- AES-256-GCM encrypted
  token_expires_at  TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
One row per TrueLayer consent grant. Tokens are encrypted as `iv_hex:tag_hex:cipher_hex`.

### Table: `linked_accounts`
```sql
CREATE TABLE linked_accounts (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id  UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  provider       TEXT        NOT NULL DEFAULT 'truelayer',
  external_id    TEXT        NOT NULL,               -- TrueLayer account ID
  account_name   TEXT        NOT NULL,               -- e.g. 'NatWest Current'
  account_type   TEXT        NOT NULL,               -- 'current' | 'savings' | 'credit'
  currency       TEXT        NOT NULL DEFAULT 'GBP',
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, external_id)
);
```

### Table: `categories`
```sql
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  meta_bucket TEXT NOT NULL CHECK (meta_bucket IN ('needs', 'wants', 'savings')),
  color_hex   TEXT NOT NULL
);
```
Seeded by `002_seed_categories.sql` with 11 categories:

| Category | Meta-bucket |
|---|---|
| Groceries | needs |
| Transport | needs |
| Fuel | needs |
| Bills & Utilities | needs |
| Health | needs |
| Eating Out | wants |
| Shopping | wants |
| Subscriptions | wants |
| Entertainment | wants |
| Travel | wants |
| Savings | savings |

### Table: `categorisation_rules`
```sql
CREATE TABLE categorisation_rules (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_pattern TEXT        NOT NULL,      -- normalised (uppercase, trimmed)
  category_id      UUID        NOT NULL REFERENCES categories(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_pattern)
);
```
Rules are exact-match after normalisation. Created automatically when the user corrects a category.

### Table: `transactions`
```sql
CREATE TABLE transactions (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id            UUID        NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id           TEXT        NOT NULL,        -- TrueLayer transaction ID
  merchant_name         TEXT,                        -- nullable (raw from bank)
  description           TEXT        NOT NULL,
  amount_pence          INTEGER     NOT NULL,        -- positive = credit, negative = debit
  currency              TEXT        NOT NULL DEFAULT 'GBP',
  transaction_date      DATE        NOT NULL,        -- used for ALL date analysis
  posted_date           DATE,                        -- informational only
  category_id           UUID        REFERENCES categories(id),
  categorisation_source TEXT        CHECK (categorisation_source IN
                                      ('rule', 'ai', 'manual', 'confirmed')),
  needs_review          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, external_id)
);

CREATE INDEX idx_transactions_user_date    ON transactions (user_id, transaction_date);
CREATE INDEX idx_transactions_needs_review ON transactions (user_id, needs_review)
  WHERE needs_review = TRUE;
```

### Table: `monthly_goals`
```sql
CREATE TABLE monthly_goals (
  id          UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  needs_pct   INTEGER NOT NULL DEFAULT 40,
  wants_pct   INTEGER NOT NULL DEFAULT 20,
  savings_pct INTEGER NOT NULL DEFAULT 40,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month),
  CONSTRAINT pct_sum_100 CHECK (needs_pct + wants_pct + savings_pct = 100)
);
```
Auto-seeded with defaults (40/20/40) on first read for a given month.

---

## 6. Business Logic

### 6.1 Income Detection

Income for a given month = sum of **credit** (positive `amount_pence`) transactions in that month, excluding anything categorised as Savings (to avoid counting savings transfers as income):

```
income_pence(year, month) =
  SUM(amount_pence)
  WHERE amount_pence > 0
    AND transaction_date BETWEEN first_day AND last_day_of_month
    AND (category_id IS NULL OR categories.meta_bucket <> 'savings')
```

### 6.2 Spend Aggregation

Outflows are stored as negative integers. Bucket spend = absolute value of debits in the matching meta-bucket:

```
bucket_spend_pence(bucket, year, month) =
  SUM(-amount_pence)
  WHERE amount_pence < 0
    AND transaction_date within month
    AND categories.meta_bucket = bucket
```

Savings spend = money moved into savings accounts (debits categorised as "Savings").

### 6.3 Goal Amounts

```
goal_pence(bucket) = ROUND(income_pence * bucket_pct / 100)
```

On any read for a month with no goal row, `getOrCreateGoal` auto-inserts defaults (40/20/40).

### 6.4 Pill Status

Implemented in `api/src/lib/pillStatus.ts` and shared with mobile via direct import:

```typescript
export type PillLevel = 'green' | 'amber' | 'red';
export type Bucket    = 'needs' | 'wants' | 'savings';

export function pillStatus(amountPence: number, goalPence: number, bucket: Bucket): PillLevel
```

**Ratio calculation:**
```
ratio = amountPence / goalPence
// Special case: if goalPence === 0
//   ratio = Infinity  when amountPence > 0
//   ratio = 0         when amountPence === 0
```

**Needs & Wants** (spend buckets — lower is better):

| Ratio | Status |
|---|---|
| < 0.5 | `green` |
| 0.5 – 0.99 | `amber` |
| ≥ 1.0 | `red` |

**Savings** (reversed — higher is better):

| Ratio | Status |
|---|---|
| ≥ 0.9 | `green` |
| 0.5 – 0.89 | `amber` |
| < 0.5 | `red` |

**Pill colours** (dark-mode optimised):

| Status | Background | Text |
|---|---|---|
| green | `#0d2e1a` | green |
| amber | `#2d2208` | amber |
| red | `#2d0a0a` | red |

### 6.5 Savings Forecast Formulas

Let `avg6(x)` = mean monthly value of `x` over the trailing 6 months (use all available months if fewer than 6):

```
goal_pence      = ROUND(income_this_month × savings_pct / 100)
actual_pence    = savings bucket spend this month so far
realistic_pence = ROUND(avg6(income) − avg6(needs_spend) − avg6(wants_spend))
stretch_pence   = ROUND(avg6(income) − avg6(needs_spend) − 0.70 × avg6(wants_spend))
annual_pence(t) = t × 12
```

`realistic_pence` and `stretch_pence` clamp to ≥ 0.

**Tier badges** (compare tier monthly to `goal_pence`):
- tier ≥ goal → `on-track`
- tier < goal → `behind`
- Stretch tier always shows badge `stretch` regardless of value

### 6.6 Merchant Normalisation

Before any rule lookup or rule creation, merchant strings are normalised:

```typescript
function normaliseMerchant(merchant: string | null, description = ''): string {
  const raw = merchant ?? description;
  return raw.trim().toUpperCase();
}
```

Rules are stored and matched on the normalised form. This makes matching case-insensitive.

### 6.7 Token Encryption

OAuth tokens stored as AES-256-GCM ciphertext in the format: `iv_hex:tag_hex:cipher_hex`

- Key: `ENCRYPTION_KEY` env var (32 bytes, base64-encoded)
- 60-second refresh threshold: if `token_expires_at < now + 60s`, refresh before use

---

## 7. API Reference

All responses with money fields use **integer pence** with a `_pence` suffix.  
Base URL (production): `https://poisonedfinance-api.fly.dev`  
Base URL (local): `http://localhost:3000`

### GET `/health`
DB ping.

**Response:**
```json
{ "ok": true, "db": "connected" }
```

---

### GET `/auth/truelayer?userId=<uuid>`
Redirects the user to TrueLayer's consent screen.

**Response:** HTTP 302 redirect to TrueLayer OAuth URL.

---

### GET `/auth/callback?code=<string>&state=<string>`
Exchanges the TrueLayer auth code for tokens, stores the connection, and triggers an initial sync.

**Flow:**
1. Exchange `code` for tokens via TrueLayer
2. `INSERT INTO bank_connections` with encrypted tokens
3. `syncAccounts(userId, connectionId, accessToken)` — upserts `linked_accounts`
4. Initial transaction sync (180-day window)

**Response:**
```json
{ "ok": true }
```

---

### POST `/sync/:userId`
Manual full sync for all of the user's bank connections.

**Response:**
```json
{ "ok": true, "synced": 47 }
```
(`synced` = number of new transactions inserted)

---

### POST `/import/pdf`
Multipart form upload. Fields: `file` (PDF), `userId` (string).

Parses a PDF bank statement and inserts transactions.

**Response:**
```json
{ "ok": true, "imported": 23 }
```

---

### GET `/dashboard/:userId?year=<int>&month=<int>`
Main dashboard data. Defaults to current month if `year`/`month` omitted.

**Response:**
```json
{
  "income_pence": 320000,
  "pills": {
    "needs":   { "spent_pence": 95000, "goal_pence": 128000, "status": "green" },
    "wants":   { "spent_pence": 74000, "goal_pence": 64000,  "status": "red"   },
    "savings": { "spent_pence": 40000, "goal_pence": 128000, "status": "red"   }
  },
  "review_count": 3,
  "recent": [
    {
      "id": "uuid",
      "merchant_name": "TESCO",
      "description": "TESCO STORES",
      "amount_pence": -4250,
      "transaction_date": "2026-06-01",
      "category_name": "Groceries",
      "needs_review": false
    }
  ]
}
```

---

### GET `/spending/:userId?year=<int>&month=<int>`
Goal progress bars + category breakdown.

**Response:**
```json
{
  "goal_bars": [
    { "bucket": "needs",   "spent_pence": 95000, "goal_pence": 128000, "status": "green" },
    { "bucket": "wants",   "spent_pence": 74000, "goal_pence": 64000,  "status": "red"   },
    { "bucket": "savings", "spent_pence": 40000, "goal_pence": 128000, "status": "red"   }
  ],
  "category_breakdown": [
    { "category_name": "Groceries", "meta_bucket": "needs",  "total_pence": 52000 },
    { "category_name": "Transport", "meta_bucket": "needs",  "total_pence": 18000 },
    { "category_name": "Eating Out","meta_bucket": "wants",  "total_pence": 31000 }
  ]
}
```

---

### GET `/transactions/:userId?year=<int>&month=<int>&account=<uuid>&bucket=<string>&q=<string>`
Filtered transaction list. All query params optional.

- `bucket`: `needs` | `wants` | `savings`
- `q`: search string (merchant name or description, case-insensitive)

**Response:** Array of transaction objects:
```json
[
  {
    "id": "uuid",
    "merchant_name": "AMAZON MKTPLACE",
    "description": "AMAZON MKTPLACE",
    "amount_pence": -2999,
    "transaction_date": "2026-06-02",
    "category_name": "Shopping",
    "categorisation_source": "rule",
    "needs_review": false,
    "account_name": "NatWest Current"
  }
]
```

---

### GET `/goals/:userId?year=<int>&month=<int>`
Returns the goal for the given month. Auto-seeds 40/20/40 if no row exists.

**Response:**
```json
{
  "id": "uuid",
  "user_id": "...",
  "year": 2026,
  "month": 6,
  "needs_pct": 40,
  "wants_pct": 20,
  "savings_pct": 40
}
```

---

### PUT `/goals/:userId`
Update goal percentages for a month. Percentages must sum to 100.

**Request body:**
```json
{
  "year": 2026,
  "month": 6,
  "needs_pct": 50,
  "wants_pct": 20,
  "savings_pct": 30
}
```

**Response:** Updated goal object (same shape as GET `/goals`).

---

### GET `/forecast/:userId?year=<int>&month=<int>`
Savings forecast tiers + spending trend callouts.

**Response:**
```json
{
  "tiers": [
    { "label": "Goal",      "monthly_pence": 128000, "annual_pence": 1536000, "badge": "on-track" },
    { "label": "Realistic", "monthly_pence": 110000, "annual_pence": 1320000, "badge": "behind"   },
    { "label": "Stretch",   "monthly_pence": 135000, "annual_pence": 1620000, "badge": "stretch"  },
    { "label": "Actual",    "monthly_pence": 40000,  "annual_pence": 480000,  "badge": "behind"   }
  ],
  "trends": [
    { "type": "increasing", "category": "Eating Out", "change_pct": 22 },
    { "type": "suggestion", "message": "Cutting Wants by 30% saves an extra £208/month" }
  ]
}
```

---

### GET `/review/:userId`
Transactions awaiting user review. Uses `LEFT JOIN categories` so transactions with no category (AI failed) still appear as "Uncategorised".

**Response:**
```json
[
  {
    "id": "uuid",
    "merchant_name": "DELIVEROO",
    "description": "DELIVEROO*ORDER",
    "amount_pence": -1850,
    "transaction_date": "2026-06-01",
    "category_name": null,
    "ai_suggested_category": "Eating Out"
  }
]
```

---

### POST `/review/:txnId/confirm`
Accept the AI-suggested category for a transaction. Sets `categorisation_source = 'confirmed'` and `needs_review = false`.

**Response:**
```json
{ "ok": true }
```

---

### POST `/review/:txnId/change`
Change a transaction's category. Optionally create a rule for future matching.

**Request body:**
```json
{
  "category_name": "Shopping",
  "create_rule": true,
  "user_id": "00000000-0000-0000-0000-000000000001"
}
```

Sets `categorisation_source = 'manual'`, `needs_review = false`. If `create_rule = true`, inserts a `categorisation_rules` row with the normalised merchant name.

**Response:**
```json
{ "ok": true }
```

---

## 8. Mobile Screens & User Stories

### Tab 1: Dashboard (Home)

**User story:** As a user, I want to see my monthly income, how I'm tracking against my Needs/Wants/Savings goals, any transactions needing review, and recent transactions — all on one screen.

```
┌─────────────────────────────────────┐
│  PoisonedFinance        June 2026   │
│  ─────────────────────────────────  │
│                                     │
│  Monthly Income                     │
│  ┌─────────────────────────────┐    │
│  │         £3,200.00           │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌───────────┐ ┌───────────┐ ┌────┐ │
│  │  Needs    │ │  Wants    │ │Sav.│ │
│  │  £950     │ │  £740     │ │£400│ │
│  │ / £1,280  │ │ / £640    │ │/£1.2k│ │
│  │  ● green  │ │  ● red    │ │● red│ │
│  └───────────┘ └───────────┘ └────┘ │
│                                     │
│  ⚠  3 transactions need review  →   │
│                                     │
│  Recent Transactions                │
│  ─────────────────────────────────  │
│  TESCO            -£42.50  Groc.   │
│  DELIVEROO        -£18.50  Eat Out │
│  AMAZON           -£29.99  Shop.   │
│  SALARY           +£3,200  Income  │
│                                     │
├──────┬──────┬──────┬──────┬─────────┤
│ Home │Spend │Fcst  │Txns  │Settings │
└──────┴──────┴──────┴──────┴─────────┘
```

**Behaviour:**
- Pills tap through to Spending screen
- Review alert taps through to Review Queue
- Recent transactions list is limited to ~5 most recent
- Defaults to current month; no month switcher on this screen

---

### Tab 2: Spending

**User story:** As a user, I want to see detailed progress bars for each bucket and a breakdown of spending by category so I understand where my money is going.

```
┌─────────────────────────────────────┐
│  Spending              June 2026    │
│  ─────────────────────────────────  │
│                                     │
│  NEEDS    £950 / £1,280             │
│  ████████████░░░░░░  74%  ● green   │
│                                     │
│  WANTS    £740 / £640               │
│  ████████████████████ 116% ● red    │
│                                     │
│  SAVINGS  £400 / £1,280             │
│  ████░░░░░░░░░░░░░░░  31%  ● red    │
│                                     │
│  ─── Needs ─────────────────────── │
│  Groceries          £520            │
│  Transport          £180            │
│  Bills & Utilities  £250            │
│                                     │
│  ─── Wants ─────────────────────── │
│  Eating Out         £310            │
│  Shopping           £290            │
│  Subscriptions       £90            │
│  Entertainment       £50            │
│                                     │
│  ─── Savings ───────────────────── │
│  Savings            £400            │
│                                     │
├──────┬──────┬──────┬──────┬─────────┤
│ Home │Spend │Fcst  │Txns  │Settings │
└──────┴──────┴──────┴──────┴─────────┘
```

---

### Tab 3: Forecast

**User story:** As a user, I want to see how much I'm projected to save this month (and annually) under different spending scenarios, and get callouts about notable spending trends.

```
┌─────────────────────────────────────┐
│  Savings Forecast      June 2026    │
│  ─────────────────────────────────  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Goal                       │    │
│  │  £1,280 / month             │    │
│  │  £15,360 / year    on-track │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Realistic                  │    │
│  │  £1,100 / month             │    │
│  │  £13,200 / year     behind  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Stretch                    │    │
│  │  £1,350 / month             │    │
│  │  £16,200 / year     stretch │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Actual (this month)        │    │
│  │  £400 / month               │    │
│  │  £4,800 / year      behind  │    │
│  └─────────────────────────────┘    │
│                                     │
│  Trends                             │
│  ↑ Eating Out up 22% vs last month  │
│  💡 Cutting Wants 30% = +£208/mo    │
│                                     │
├──────┬──────┬──────┬──────┬─────────┤
│ Home │Spend │Fcst  │Txns  │Settings │
└──────┴──────┴──────┴──────┴─────────┘
```

---

### Tab 4: Transactions

**User story:** As a user, I want to search and filter my full transaction history by month, account, spending bucket, or keyword.

```
┌─────────────────────────────────────┐
│  Transactions          June 2026    │
│  ─────────────────────────────────  │
│  🔍 Search merchant or description  │
│                                     │
│  All accounts ▾   All buckets ▾     │
│                                     │
│  01 Jun  TESCO STORES               │
│           Groceries          -£42.50│
│                                     │
│  01 Jun  DELIVEROO*ORDER            │
│           Eating Out         -£18.50│
│                                     │
│  31 May  AMAZON MKTPLACE            │
│           Shopping           -£29.99│
│                                     │
│  29 May  EMPLOYER LTD               │
│           (income)         +£3,200  │
│                                     │
│  [load more...]                     │
│                                     │
├──────┬──────┬──────┬──────┬─────────┤
│ Home │Spend │Fcst  │Txns  │Settings │
└──────┴──────┴──────┴──────┴─────────┘
```

---

### Tab 5: Settings

**User story:** As a user, I want to upload a PDF bank statement when my bank isn't supported by TrueLayer.

```
┌─────────────────────────────────────┐
│  Settings                           │
│  ─────────────────────────────────  │
│                                     │
│  Bank Connections                   │
│  NatWest Current    ✓ Connected     │
│  [ Connect another bank ]           │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Import PDF Statement               │
│  Upload a PDF bank statement to     │
│  import transactions manually.      │
│                                     │
│  [ Choose PDF... ]                  │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Monthly Goals                      │
│  June 2026: 40 / 20 / 40            │
│  [ Edit goals ]                     │
│                                     │
├──────┬──────┬──────┬──────┬─────────┤
│ Home │Spend │Fcst  │Txns  │Settings │
└──────┴──────┴──────┴──────┴─────────┘
```

---

### Modal: Review Queue

**User story:** As a user, I want to see transactions the AI has categorised and either confirm the suggestion or pick the right category myself.

```
┌─────────────────────────────────────┐
│  ← Review Queue          3 pending  │
│  ─────────────────────────────────  │
│                                     │
│  DELIVEROO*ORDER                    │
│  -£18.50 · 1 Jun 2026               │
│  Suggested: Eating Out              │
│                                     │
│  [ ✓ Confirm ]  [ ✗ Change ]        │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  NETFLIX.COM                        │
│  -£15.99 · 31 May 2026              │
│  Suggested: Subscriptions           │
│                                     │
│  [ ✓ Confirm ]  [ ✗ Change ]        │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  UNRECOGNISED TXN 4821              │
│  -£7.50 · 30 May 2026               │
│  Suggested: (uncategorised)         │
│                                     │
│  [ ✓ Confirm ]  [ ✗ Change ]        │
└─────────────────────────────────────┘
```

---

### Modal: Category Edit

**User story:** As a user, I want to change a transaction's category and optionally create a rule so future transactions from the same merchant are auto-categorised.

```
┌─────────────────────────────────────┐
│  ← Choose Category                  │
│  DELIVEROO*ORDER · -£18.50          │
│  ─────────────────────────────────  │
│                                     │
│  — Needs ──────────────────────     │
│  ○ Groceries                        │
│  ○ Transport                        │
│  ○ Fuel                             │
│  ○ Bills & Utilities                │
│  ○ Health                           │
│                                     │
│  — Wants ──────────────────────     │
│  ● Eating Out             ← current │
│  ○ Shopping                         │
│  ○ Subscriptions                    │
│  ○ Entertainment                    │
│  ○ Travel                           │
│                                     │
│  — Savings ─────────────────────    │
│  ○ Savings                          │
│                                     │
│  [ Save ]                           │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Save rule: always categorise│    │
│  │ DELIVEROO as Eating Out?    │    │
│  │ [ Yes ]          [ No ]     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

**Important:** The merchant name shown in the rule prompt is always the **raw merchant string from the transaction** — never the category name or description.

---

## 9. Categorisation Pipeline

```
New transactions inserted (needs_review = TRUE)
      │
      ▼
Rules Engine
  normaliseMerchant(merchant_name ?? description)
  → UPPER(TRIM(raw))
  Lookup: categorisation_rules WHERE user_id AND merchant_pattern = normalised
      │
      ├── MATCH → category_id = rule.category_id
      │           categorisation_source = 'rule'
      │           needs_review = FALSE
      │
      └── NO MATCH
            │
            ▼
         Claude AI Batch
           Chunk transactions into groups of 40
           For each chunk: one API call to claude-sonnet-4-6
           Per-chunk try/catch: failed chunk leaves transactions
             with category_id = NULL, needs_review = TRUE
           Successful: category_id = matched, categorisation_source = 'ai'
                       needs_review = TRUE (awaits user confirmation)
            │
            ▼
         Review Queue (GET /review/:userId)
           User sees AI suggestion for each transaction
           ├── Confirm → categorisation_source = 'confirmed', needs_review = FALSE
           └── Change  → categorisation_source = 'manual', needs_review = FALSE
                         optionally: INSERT INTO categorisation_rules
```

### Categorisation Sources

| Value | Meaning |
|---|---|
| `rule` | Matched an exact rule; no review needed |
| `ai` | Claude API suggestion; awaiting user review |
| `confirmed` | User confirmed the AI suggestion |
| `manual` | User changed the category |

---

## 10. BDD Feature Specs

Feature files are written in Gherkin and live in the top-level `features/` directory. Step definitions are in the relevant workspace's `__tests__/features/` folder.

### @wip Convention

Scenarios tagged `@wip` are **not yet implemented**. CI runs them as non-blocking (`continue-on-error: true`). Remove the `@wip` tag once the step definitions are written and passing.

### Feature Files

| File | Status | Step Definition |
|---|---|---|
| `features/categorisation/rules-engine.feature` | Implemented | `api/src/__tests__/features/categorisation/rules-engine.steps.ts` |
| `features/budgeting/dashboard-pills.feature` | Implemented | `mobile/__tests__/features/budgeting/dashboard-pills.steps.ts` |
| `features/categorisation/ai-fallback.feature` | @wip | TBD |
| `features/categorisation/review-and-rules.feature` | @wip | TBD |
| `features/sync/truelayer-oauth.feature` | @wip | TBD |
| `features/sync/transaction-sync.feature` | @wip | TBD |
| `features/sync/pdf-import.feature` | @wip | TBD |
| `features/budgeting/goal-config.feature` | @wip | TBD |
| `features/budgeting/spending-buckets.feature` | @wip | TBD |
| `features/forecast/savings-forecast.feature` | @wip | TBD |
| `features/forecast/spending-trends.feature` | @wip | TBD |

### Writing New Step Definitions

**Critical:** jest-cucumber v3 does NOT support `{string}` or `{int}` parameter syntax. Use RegExp matchers:

```typescript
// ❌ WRONG — not supported in jest-cucumber v3
given('the user has {int} transactions', (count) => { ... })

// ✅ CORRECT — use RegExp
given(/^the user has (\d+) transactions$/, (countStr: string) => {
  const count = parseInt(countStr, 10);
  ...
})
```

Data tables are passed as plain arrays (not Cucumber.js's `table.hashes()`):

```typescript
// Data table comes as last arg, plain array of parsed objects
given(/^a categorisation rule for user "(.*)"$/, async (
  userId: string,
  table: Array<{ merchant_pattern: string; category_name: string }>,
) => {
  for (const row of table) {
    await insertRule(userId, row.merchant_pattern, row.category_name);
  }
});
```

API BDD tests use the `pg-mem` world from `api/src/__tests__/features/world.ts` which:
1. Creates an in-memory PostgreSQL database
2. Registers `uuid_generate_v4()` as a custom function
3. Runs all migrations (with preprocessing to strip unsupported syntax)
4. Returns `query()` and `teardown()` helpers

---

## 11. Environment Setup

### Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL (for local API dev)
- Expo Go app on your phone (for mobile dev), or iOS Simulator / Android Emulator

### Local API Setup

```bash
cd api
npm install

# Create local .env (never commit this)
cp .env.example .env
# Edit .env with your local values:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/poisonedfinance
#   PORT=3000
#   ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
#   TRUELAYER_CLIENT_ID=<from TrueLayer console>
#   TRUELAYER_CLIENT_SECRET=<from TrueLayer console>
#   TRUELAYER_REDIRECT_URI=http://localhost:3000/auth/callback
#   ANTHROPIC_API_KEY=<from Anthropic console>

# Run database migrations
npx ts-node src/db/migrate-cli.ts

# Start the API
npm run dev      # or: npm start
```

### Local Mobile Setup

```bash
cd mobile
npm install

# Create local .env
echo "EXPO_PUBLIC_API_URL=http://localhost:3000" > .env

# Start Expo dev server
npm start
# Then press 'i' for iOS simulator, 'a' for Android emulator,
# or scan the QR code with Expo Go
```

### Environment Variables Reference

| Variable | Where | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | API | Yes | PostgreSQL connection string |
| `PORT` | API | No | Default: `3000` |
| `ENCRYPTION_KEY` | API | Yes | 32 bytes base64 — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `TRUELAYER_CLIENT_ID` | API | Yes | From TrueLayer developer console |
| `TRUELAYER_CLIENT_SECRET` | API | Yes | **Secret** — never commit |
| `TRUELAYER_REDIRECT_URI` | API | Yes | `http://localhost:3000/auth/callback` locally |
| `ANTHROPIC_API_KEY` | API | Yes | **Secret** — never commit |
| `EXPO_PUBLIC_API_URL` | Mobile | Yes | API base URL |

**Production secrets** are set via Fly.io, not environment files:
```bash
fly secrets set DATABASE_URL="..." ENCRYPTION_KEY="..." ANTHROPIC_API_KEY="..." \
  TRUELAYER_CLIENT_ID="..." TRUELAYER_CLIENT_SECRET="..."
```

---

## 12. Testing Guide

### Running Unit Tests

```bash
# API unit tests
cd api && npm test

# Mobile unit tests
cd mobile && npm test
```

### Running BDD Feature Specs

```bash
# API BDD (implemented scenarios only)
cd api && npm test -- --testPathPattern="__tests__/features"

# Mobile BDD
cd mobile && npm test -- --testPathPattern="__tests__/features"
```

### CI Test Matrix

GitHub Actions runs three jobs on every push/PR:

| Job | Command | Blocking? |
|---|---|---|
| `test (api)` | `cd api && npm test` | Yes |
| `test (mobile)` | `cd mobile && npm test` | Yes |
| `bdd` (non-@wip) | API BDD excluding @wip | Yes |
| `bdd` (@wip) | API BDD @wip only | No (`continue-on-error: true`) |

### Test Architecture

- **API tests:** Jest + ts-jest. BDD tests use `pg-mem` (in-memory PostgreSQL) — no live database needed.
- **Mobile tests:** jest-expo. BDD tests import `pillStatus` directly from the API source via relative path (pure function, no Node.js-specific deps).
- **No mocking of the DB in BDD:** scenarios run real SQL against pg-mem seeded with real migrations. This catches schema drift early.

---

## 13. Deployment Guide

Deployment is automated via GitHub Actions on push to `main`.

### First-Time Fly.io Setup

```bash
# Install flyctl
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh

# Log in
fly auth login

# Create the app (one-time)
fly apps create poisonedfinance-api --org personal

# Attach a Postgres database (one-time)
fly postgres create --name poisonedfinance-pg
fly postgres attach poisonedfinance-pg --app poisonedfinance-api

# Set secrets (one-time, or when rotating)
fly secrets set \
  ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  TRUELAYER_CLIENT_ID="..." \
  TRUELAYER_CLIENT_SECRET="..." \
  --app poisonedfinance-api

# Add FLY_API_TOKEN to GitHub repo secrets (Settings → Secrets → Actions)
fly tokens create deploy -x 999999h --app poisonedfinance-api
```

### Deploy Flow

1. Push to `main` (or merge a PR)
2. GitHub Actions `deploy.yml` runs `flyctl deploy --remote-only`
3. Fly.io builds Docker image from `api/Dockerfile`
4. Before shifting traffic: `node dist/db/migrate-cli.js` (the `release_command` in `fly.toml`)
5. If migrations fail → deploy aborted, previous release stays live
6. If migrations succeed → new release goes live

### Manual Deploy

```bash
fly deploy --remote-only --app poisonedfinance-api
```

Or trigger via GitHub Actions: Actions tab → "Deploy to Fly.io" → "Run workflow".

### Infrastructure Spec (Fly.io free tier)

| Setting | Value |
|---|---|
| Region | `lhr` (London) |
| VM | 1 shared CPU, 256 MB RAM |
| Auto-stop | Yes (scales to zero when idle) |
| HTTPS | Enforced |
| Connections | Hard limit 25, soft limit 20 |

---

## 14. Key Conventions

### Money
- All monetary values are stored and transmitted as **integer pence** (e.g. £12.50 → `1250`)
- Database column names always end in `_pence` (e.g. `amount_pence`, `goal_pence`)
- Mobile formats via `lib/format.ts`:
  - `formatPence(pence)` → `"£1,234.56"`
  - `formatPenceShort(pence)` → `"£1,234"`

### Dates
- All date-based analysis uses **`transaction_date`**, never `posted_date`
- `posted_date` is stored but only informational
- Month boundaries are inclusive: `transaction_date >= first_day AND transaction_date <= last_day`

### Single User MVP
- `SEED_USER_ID = '00000000-0000-0000-0000-000000000001'`
- All endpoints take `:userId` in the path — wire to `SEED_USER_ID` in the mobile app for MVP
- Exported from `api/src/lib/currentUser.ts`

### Categorisation Source Lifecycle
```
rules engine hit → 'rule' (final, no review)
AI suggestion    → 'ai' (needs_review = true)
user confirms    → 'confirmed' (needs_review = false)
user changes     → 'manual' (needs_review = false)
```

### Sync Window
- Initial sync: **180 days** (required for 6-month forecast averages)
- Subsequent syncs: incremental or full 180 days with `ON CONFLICT DO NOTHING`

### Merchant Normalisation
```
normaliseMerchant(merchant_name ?? description) = UPPER(TRIM(raw))
```
Rules are stored and matched on the normalised form. The rule prompt shows the **raw** merchant string to the user, but stores the **normalised** form.

### BDD @wip Tags
- `@wip` = scenario exists in Gherkin but step definitions are not written yet
- CI runs `@wip` as non-blocking (`continue-on-error: true`)
- Remove `@wip` when the scenario's step definitions are complete and passing

---

## 15. Security Constraints

These constraints are **non-negotiable** and must be preserved in all future work:

1. **OAuth token encryption:** All `access_token_enc` and `refresh_token_enc` values in `bank_connections` must be AES-256-GCM encrypted. Format: `iv_hex:tag_hex:cipher_hex`. Key: `ENCRYPTION_KEY` env var (32 bytes, base64).

2. **No secrets in `.env.example`:** The file at `api/.env.example` contains only placeholder text. Never put real keys, tokens, or passwords in any committed file.

3. **No `.env` files committed:** `api/.env` and `mobile/.env` are in `.gitignore`. Never commit them.

4. **Production secrets via Fly.io only:** `ANTHROPIC_API_KEY`, `TRUELAYER_CLIENT_SECRET`, `DATABASE_URL`, and `ENCRYPTION_KEY` are set via `fly secrets set` — not environment files or code.

5. **60-second refresh threshold:** Before using an OAuth access token, check `token_expires_at`. If it expires within 60 seconds, refresh it first. See `api/src/truelayer/tokens.ts`.

6. **SQL parameters only:** All database queries must use parameterised statements (`$1`, `$2`, ...). Never interpolate user input into SQL strings.

7. **Input validation at API boundaries:** Validate `year`, `month`, and percentage sums (must equal 100) before writing to the database. Express route handlers are the validation boundary.
