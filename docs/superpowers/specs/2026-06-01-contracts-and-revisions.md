# PoisonedFinance — Contracts & Revisions
_2026-06-01 · canonical source of truth for all implementation plans_

This document locks the cross-cutting decisions that every plan depends on. Where a plan disagrees with this document, **this document wins**. It also lists the corrections to the original Phase 2 plans (A–D).

---

## 1. Seeded single user (auth bootstrap)

MVP is single-user. A migration seeds one fixed user; all endpoints key off this id until real auth is added.

```
SEED_USER_ID = '00000000-0000-0000-0000-000000000001'
SEED_USER_EMAIL = 'owner@poisonedfinance.local'
```

Migration `003_seed_user.sql`:
```sql
INSERT INTO users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'owner@poisonedfinance.local')
ON CONFLICT (id) DO NOTHING;
```

A helper `api/src/lib/currentUser.ts` exports `SEED_USER_ID` for routes/tests.

---

## 2. Bank connection / account model (FIX for Plan C chicken-and-egg)

**Problem in original plans:** OAuth tokens were stored per `linked_accounts` row, but one TrueLayer consent yields one token set covering *many* accounts, and the callback updated `linked_accounts` before any account row existed.

**Fix:** introduce `bank_connections`. Tokens live on the connection; accounts reference it.

Migration `001_initial_schema.sql` (revised) — replace the token columns on `linked_accounts` with a connection FK and add:

```sql
CREATE TABLE bank_connections (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           TEXT        NOT NULL,
  access_token_enc   TEXT        NOT NULL,
  refresh_token_enc  TEXT        NOT NULL,
  token_expires_at   TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- linked_accounts gains:
--   connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE
-- and DROPS: access_token_enc, refresh_token_enc, token_expires_at
```

**OAuth callback flow (revised):**
1. `exchangeCode(code)` → tokens.
2. `INSERT INTO bank_connections (...) RETURNING id`.
3. `syncAccounts(userId, connectionId, accessToken)` upserts `linked_accounts` with `connection_id`.

**Sync flow (revised):** iterate `bank_connections` for the user → refresh token if needed → for each linked account on that connection, `syncTransactions`.

---

## 3. Token refresh (FIX for Plan C)

Before using a connection's access token, check expiry and refresh if within 60s of expiry:

`api/src/truelayer/tokens.ts` → `getValidAccessToken(connectionId): Promise<string>`:
- Read `bank_connections` row.
- If `token_expires_at` > now + 60s → `decrypt(access_token_enc)`.
- Else → `refreshAccessToken(decrypt(refresh_token_enc))`, persist new encrypted tokens + expiry, return new access token.

---

## 4. Income detection

Income for `(year, month)` = sum of **credit** transactions in that month, excluding money moved *out of* savings.

```
income_pence(year, month) =
  SUM(amount_pence)
  WHERE amount_pence > 0
    AND transaction_date within month
    AND (category_id IS NULL OR category.meta_bucket <> 'savings')
```

All date filtering uses `transaction_date` (never `posted_date`).

---

## 5. Spend aggregation (per bucket, per month)

Outflows are stored negative. Bucket spend is the absolute value of debits whose category's `meta_bucket` matches:

```
bucket_spend_pence(bucket, year, month) =
  SUM(-amount_pence)
  WHERE amount_pence < 0
    AND transaction_date within month
    AND category.meta_bucket = bucket
```

`savings` bucket spend = money moved *into* savings (debits categorised `Savings`).

---

## 6. Goal amounts & auto-seeding

Per-month goals live in `monthly_goals` (defaults 40/20/40, CHECK sum = 100). On any read for a month with no row, **auto-seed** the default then return it:

`api/src/lib/goals.ts` → `getOrCreateGoal(userId, year, month): Promise<MonthlyGoal>`:
- `SELECT ... WHERE user_id, year, month`; if found, return.
- Else `INSERT (... 40, 20, 40) ON CONFLICT DO NOTHING RETURNING *`; return inserted-or-existing.

Goal amount in pence:
```
goal_pence(bucket) = ROUND(income_pence * bucket_pct / 100)
```

---

## 7. Pill status helper (pure, authoritative on the API)

`api/src/lib/pillStatus.ts`:

```typescript
export type PillLevel = 'green' | 'amber' | 'red' | 'none';
export type Bucket = 'needs' | 'wants' | 'savings';

export function pillStatus(amountPence: number, goalPence: number, bucket: Bucket): PillLevel
```

Rules:

- **goal == 0 (disabled)**: a goal of 0 disables the bucket — there is no budget to measure against, so the pill carries no status colour and returns `none` for every bucket, regardless of amount.
- For a non-zero goal, ratio = amount / goal:
  - **needs / wants** (spend — lower is better): ratio < 0.5 → `green`; 0.5 ≤ ratio < 1.0 → `amber`; ratio ≥ 1.0 → `red`.
  - **savings** (reversed — higher is better): ratio ≥ 0.9 → `green`; 0.5 ≤ ratio < 0.9 → `amber`; ratio < 0.5 → `red`.

Mobile maps `PillLevel` → colours via `theme.ts`:
```
green → bg pillGreenBg, text green
amber → bg pillAmberBg, text amber
red   → bg pillRedBg,   text red
none  → bg surface,     text textMuted   (goal disabled)
```

---

## 8. Savings forecast formulas (pence/month)

Let `avg6(x)` = mean monthly value of `x` over the trailing 6 months (use available months if < 6).

```
goal_pence      = ROUND(income_this_month * savings_pct / 100)
actual_pence    = savings bucket spend THIS month so far          (see §5)
realistic_pence = ROUND(avg6(income) - avg6(needs) - avg6(wants))
stretch_pence   = ROUND(avg6(income) - avg6(needs) - 0.70 * avg6(wants))
annual_pence(t) = t * 12
```

Badge per tier (compare tier monthly vs `goal_pence`):
- tier ≥ goal → `on-track`
- tier < goal → `behind`
- the Stretch tier always carries badge label `stretch` regardless.

`realistic`/`stretch` clamp to ≥ 0.

---

## 9. Canonical HTTP endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | DB ping |
| GET | `/auth/truelayer?userId=` | redirect to consent |
| GET | `/auth/callback` | store connection + initial sync |
| POST | `/sync/:userId` | manual full sync |
| POST | `/import/pdf` (multipart, field `file`, `userId`) | PDF statement fallback |
| GET | `/dashboard/:userId?year=&month=` | income, pills, review count, recent txns |
| GET | `/spending/:userId?year=&month=` | 3 goal bars + category breakdown |
| GET | `/transactions/:userId?year=&month=&account=&bucket=&q=` | filtered list |
| GET | `/goals/:userId?year=&month=` | current goal (auto-seeded) |
| PUT | `/goals/:userId` (body `{year,month,needs_pct,wants_pct,savings_pct}`) | update; validates sum=100 |
| GET | `/forecast/:userId?year=&month=` | 4 tiers + trend callouts |
| GET | `/review/:userId` | pending review (LEFT JOIN — see §10) |
| POST | `/review/:txnId/confirm` | accept AI suggestion |
| POST | `/review/:txnId/change` | change category + optional rule |

Response money fields are always integer pence with a `_pence` suffix. Mobile formats via `lib/format.ts`.

---

## 10. Categorisation fixes (Plan D)

- **Review queue LEFT JOIN:** `GET /review` must `LEFT JOIN categories` so AI-failed / unknown-category transactions (with `category_id IS NULL` but `needs_review = TRUE`) still surface as "Uncategorised".
- **Claude batch chunking:** `batchCategorise` chunks `transactions` into groups of **40**; each chunk is an independent API call wrapped in try/catch so one failed chunk doesn't lose the rest. Failed-chunk transactions are left `category_id NULL, needs_review TRUE`.

---

## 11. Migration runner fix (Plan B)

Each migration file runs inside a transaction:
```
BEGIN;  <file SQL>  INSERT INTO _migrations ...;  COMMIT;
```
On error → `ROLLBACK` and rethrow, so a failed migration leaves no partial state and is not recorded.

---

## 12. Sync window

Initial sync pulls **180 days** (forecast/trends need ≥ 6 months). Subsequent syncs may be incremental but 180 days with `ON CONFLICT DO NOTHING` is acceptable for MVP.

---

## 13. Mobile data layer

- `mobile/lib/api.ts` — typed `apiGet`/`apiPost`/`apiPut` using `process.env.EXPO_PUBLIC_API_URL`.
- `mobile/lib/format.ts` — `formatPence(pence): string` → `£1,234.56`; `formatPenceShort` → `£1,234`.
- `mobile/lib/statusColors.ts` — maps `PillLevel` → `{ bg, text }` theme tokens.
- Data fetching uses plain hooks (`useEffect` + state) for MVP — no React Query dependency.

---

## 14. BDD capability (jest-cucumber)

- Runner: **jest-cucumber** on the existing Jest stacks (jest-expo for mobile, ts-jest for API). No second runner.
- Feature files (Gherkin) live in a top-level `features/` tree, grouped by capability:
  ```
  features/
    categorisation/   rules-engine.feature  ai-fallback.feature  review-and-rules.feature
    sync/             truelayer-oauth.feature  transaction-sync.feature  pdf-import.feature
    budgeting/        spending-buckets.feature  dashboard-pills.feature  goal-config.feature
    forecast/         savings-forecast.feature  spending-trends.feature
  ```
- Step definitions: API scenarios under `api/src/__tests__/features/`; mobile scenarios under `mobile/__tests__/features/`. Each step-def file uses `loadFeature` pointing at the relevant `.feature`.
- Requirements not yet implemented are tagged `@wip`; CI runs `@wip` as non-blocking until the corresponding plan lands.
- API integration scenarios use **pg-mem** (in-memory Postgres) seeded with migrations + the seed user, so scenarios exercise real SQL without a live database.

---

## 15. Revision checklist for original plans

- [ ] **Plan B:** add `bank_connections` table; remove token columns from `linked_accounts`, add `connection_id`; add `003_seed_user.sql`; transactional migration runner (§11); add `lib/currentUser.ts`, `lib/goals.ts`, `lib/pillStatus.ts` references.
- [ ] **Plan C:** connection-based OAuth callback + sync (§2); `tokens.ts` refresh (§3); 180-day window (§12); `syncAccounts(userId, connectionId, accessToken)` writes `connection_id`.
- [ ] **Plan D:** LEFT JOIN review queue; Claude chunking of 40 (§10).
