# PoisonedFinance — TrueLayer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up TrueLayer Open Banking so users can link NatWest, Halifax, and Monzo accounts. OAuth tokens are stored AES-256-GCM encrypted. A sync job fetches accounts and transactions and upserts them into the database.

**Architecture:** Four modules under `api/src/truelayer/`: `types.ts` (TrueLayer API shapes), `oauth.ts` (auth URL, token exchange, refresh), `client.ts` (authenticated HTTP wrapper), `sync.ts` (fetch + upsert accounts and transactions). A crypto helper at `api/src/lib/crypto.ts` handles token encryption. Two Express routes handle the OAuth redirect and a manual sync trigger. Prerequisite: Plan B (API Scaffold) must be complete.

**Tech Stack:** Node.js built-in `fetch` (Node 20), Node.js built-in `crypto` (AES-256-GCM), Express 4, `pg` — no extra HTTP or crypto dependencies.

---

## File Structure

```
api/src/
├── lib/
│   └── crypto.ts                     # AES-256-GCM encrypt / decrypt
├── truelayer/
│   ├── types.ts                      # TrueLayer API response shapes
│   ├── oauth.ts                      # buildAuthUrl, exchangeCode, refreshToken
│   ├── client.ts                     # fetchWithAuth (attaches Bearer token, auto-refreshes)
│   └── sync.ts                       # syncAccounts, syncTransactions, syncUser
└── routes/
    ├── auth.ts                       # GET /auth/truelayer, GET /auth/callback
    └── sync.ts                       # POST /sync/:userId
```

Plus updates to `api/src/app.ts` (wire in new routers).

Tests under `api/src/__tests__/` mirroring the above.

---

### Task 1: Crypto helper

**Files:**
- Create: `api/src/lib/crypto.ts`
- Create: `api/src/__tests__/lib/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/lib/crypto.test.ts`:

```typescript
import { encrypt, decrypt } from '@/lib/crypto';

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

describe('encrypt / decrypt', () => {
  it('roundtrips a plain string', () => {
    const plain = 'super-secret-token-abc123';
    const ciphertext = encrypt(plain);
    expect(ciphertext).not.toBe(plain);
    expect(decrypt(ciphertext)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });

  it('throws on tampered ciphertext', () => {
    const ct = encrypt('hello');
    const tampered = ct.slice(0, -4) + 'XXXX';
    expect(() => decrypt(tampered)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd api && npm test -- --testPathPattern="lib/crypto"
```

Expected: FAIL — `Cannot find module '@/lib/crypto'`

- [ ] **Step 3: Create `api/src/lib/crypto.ts`**

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext format');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd api && npm test -- --testPathPattern="lib/crypto"
```

Expected: PASS — 3/3

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/crypto.ts api/src/__tests__/lib/crypto.test.ts
git commit -m "feat(api): add AES-256-GCM token encryption helper"
```

---

### Task 2: TrueLayer types

**Files:**
- Create: `api/src/truelayer/types.ts`

No tests — pure type declarations.

- [ ] **Step 1: Create `api/src/truelayer/types.ts`**

```typescript
export interface TrueLayerAccount {
  account_id: string;
  account_type: 'TRANSACTION' | 'SAVINGS' | 'CARD';
  display_name: string;
  currency: string;
  provider: { display_name: string; provider_id: string };
}

export interface TrueLayerTransaction {
  transaction_id: string;
  timestamp: string;           // ISO 8601 — this is the posted date
  transaction_type: 'DEBIT' | 'CREDIT';
  description: string;
  merchant_name?: string;
  amount: number;              // negative = debit, positive = credit
  currency: string;
  meta?: {
    transaction_time?: string; // ISO 8601 transaction date when available
  };
}

export interface TrueLayerTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
}

export interface TrueLayerApiResponse<T> {
  results: T[];
  status: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/truelayer/types.ts
git commit -m "feat(api): add TrueLayer API response types"
```

---

### Task 3: OAuth helpers

**Files:**
- Create: `api/src/truelayer/oauth.ts`
- Create: `api/src/__tests__/truelayer/oauth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/truelayer/oauth.test.ts`:

```typescript
import { buildAuthUrl, exchangeCode, refreshAccessToken } from '@/truelayer/oauth';

const ENV = {
  TRUELAYER_CLIENT_ID: 'test-client-id',
  TRUELAYER_CLIENT_SECRET: 'test-secret',
  TRUELAYER_REDIRECT_URI: 'http://localhost:3000/auth/callback',
};

beforeEach(() => Object.assign(process.env, ENV));

describe('buildAuthUrl', () => {
  it('includes required OAuth params', () => {
    const url = new URL(buildAuthUrl('state-abc'));
    expect(url.hostname).toBe('auth.truelayer.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });

  it('requests the data scope', () => {
    const url = new URL(buildAuthUrl('x'));
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope).toContain('accounts');
    expect(scope).toContain('transactions');
  });
});

describe('exchangeCode', () => {
  it('POSTs to token endpoint with correct body', async () => {
    const mockResponse = {
      access_token: 'acc', refresh_token: 'ref',
      expires_in: 3600, token_type: 'Bearer', scope: 'accounts transactions',
    };
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    }) as jest.Mock;

    const result = await exchangeCode('auth-code-123');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://auth.truelayer.com/connect/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('code')).toBe('auth-code-123');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(result.access_token).toBe('acc');
  });
});

describe('refreshAccessToken', () => {
  it('POSTs refresh_token grant and returns new tokens', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600, token_type: 'Bearer', scope: '' }),
    }) as jest.Mock;

    const result = await refreshAccessToken('old-refresh-token');

    const body = new URLSearchParams((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh-token');
    expect(result.access_token).toBe('new-acc');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="truelayer/oauth"
```

Expected: FAIL — `Cannot find module '@/truelayer/oauth'`

- [ ] **Step 3: Create `api/src/truelayer/oauth.ts`**

```typescript
import type { TrueLayerTokenResponse } from './types';

const AUTH_BASE = 'https://auth.truelayer.com';
const SCOPES = 'accounts balance transactions offline_access';
const PROVIDERS = 'uk-ob-natwest uk-ob-halifax uk-monzo';

function getEnv() {
  const clientId = process.env.TRUELAYER_CLIENT_ID!;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET!;
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI!;
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getEnv();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    providers: PROVIDERS,
    state,
  });
  return `${AUTH_BASE}/?${params.toString()}`;
}

async function postTokenEndpoint(body: URLSearchParams): Promise<TrueLayerTokenResponse> {
  const res = await fetch(`${AUTH_BASE}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`TrueLayer token error: ${res.status}`);
  return res.json() as Promise<TrueLayerTokenResponse>;
}

export function exchangeCode(code: string): Promise<TrueLayerTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getEnv();
  return postTokenEndpoint(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  }));
}

export function refreshAccessToken(refreshToken: string): Promise<TrueLayerTokenResponse> {
  const { clientId, clientSecret } = getEnv();
  return postTokenEndpoint(new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="truelayer/oauth"
```

Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add api/src/truelayer/oauth.ts api/src/__tests__/truelayer/oauth.test.ts
git commit -m "feat(api): add TrueLayer OAuth helpers (buildAuthUrl, exchangeCode, refresh)"
```

---

### Task 4: TrueLayer API client

**Files:**
- Create: `api/src/truelayer/client.ts`
- Create: `api/src/__tests__/truelayer/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/truelayer/client.test.ts`:

```typescript
import { fetchTrueLayer } from '@/truelayer/client';

describe('fetchTrueLayer', () => {
  it('sends Authorization: Bearer header', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], status: 'Succeeded' }),
    }) as jest.Mock;

    await fetchTrueLayer('/data/v1/accounts', 'my-access-token');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.truelayer.com/data/v1/accounts');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-access-token');
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }) as jest.Mock;

    await expect(fetchTrueLayer('/data/v1/accounts', 'bad-token')).rejects.toThrow('TrueLayer API 401');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="truelayer/client"
```

Expected: FAIL — `Cannot find module '@/truelayer/client'`

- [ ] **Step 3: Create `api/src/truelayer/client.ts`**

```typescript
const API_BASE = 'https://api.truelayer.com';

export async function fetchTrueLayer<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TrueLayer API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="truelayer/client"
```

Expected: PASS — 2/2

- [ ] **Step 5: Commit**

```bash
git add api/src/truelayer/client.ts api/src/__tests__/truelayer/client.test.ts
git commit -m "feat(api): add TrueLayer authenticated API client"
```

---

### Task 5: Sync logic

**Files:**
- Create: `api/src/truelayer/sync.ts`
- Create: `api/src/__tests__/truelayer/sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/truelayer/sync.test.ts`:

```typescript
import { syncAccounts, syncTransactions } from '@/truelayer/sync';
import type { TrueLayerAccount, TrueLayerTransaction } from '@/truelayer/types';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const mockFetch = jest.fn();
jest.mock('@/truelayer/client', () => ({ fetchTrueLayer: mockFetch }));

const ACCOUNT: TrueLayerAccount = {
  account_id: 'acc-001',
  account_type: 'TRANSACTION',
  display_name: 'NatWest Current',
  currency: 'GBP',
  provider: { display_name: 'NatWest', provider_id: 'uk-ob-natwest' },
};

const TRANSACTION: TrueLayerTransaction = {
  transaction_id: 'txn-001',
  timestamp: '2026-05-31T10:00:00Z',
  transaction_type: 'DEBIT',
  description: 'TESCO STORES',
  merchant_name: 'Tesco Superstore',
  amount: -67.42,
  currency: 'GBP',
};

beforeEach(() => { mockQuery.mockReset(); mockFetch.mockReset(); });

describe('syncAccounts', () => {
  it('upserts each account returned by TrueLayer', async () => {
    mockFetch.mockResolvedValueOnce({ results: [ACCOUNT], status: 'Succeeded' });
    mockQuery.mockResolvedValue({ rows: [] });

    await syncAccounts('user-1', 'linked-acc-id-1', 'access-token');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      expect.arrayContaining(['acc-001', 'NatWest Current']),
    );
  });
});

describe('syncTransactions', () => {
  it('upserts transactions with amount converted to pence', async () => {
    mockFetch.mockResolvedValueOnce({ results: [TRANSACTION], status: 'Succeeded' });
    mockQuery.mockResolvedValue({ rows: [] });

    await syncTransactions('user-1', 'linked-acc-id-1', 'acc-001', 'access-token');

    const upsertCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('ON CONFLICT'),
    );
    expect(upsertCall).toBeDefined();
    // amount_pence should be -6742 (£-67.42 × 100, rounded)
    expect(upsertCall![1]).toContain(-6742);
  });

  it('uses transaction_date from meta.transaction_time when available', async () => {
    const txnWithMeta: TrueLayerTransaction = {
      ...TRANSACTION,
      meta: { transaction_time: '2026-05-30T08:00:00Z' },
    };
    mockFetch.mockResolvedValueOnce({ results: [txnWithMeta], status: 'Succeeded' });
    mockQuery.mockResolvedValue({ rows: [] });

    await syncTransactions('user-1', 'linked-acc-id-1', 'acc-001', 'access-token');

    const upsertCall = mockQuery.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('ON CONFLICT'),
    )!;
    // transaction_date should be 2026-05-30 (from meta), posted_date 2026-05-31 (from timestamp)
    expect(upsertCall[1]).toContain('2026-05-30');
    expect(upsertCall[1]).toContain('2026-05-31');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="truelayer/sync"
```

Expected: FAIL — `Cannot find module '@/truelayer/sync'`

- [ ] **Step 3: Create `api/src/truelayer/sync.ts`**

```typescript
import { pool } from '@/db/client';
import { fetchTrueLayer } from './client';
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

  for (const txn of data.results) {
    const postedDate = txn.timestamp.slice(0, 10);
    const transactionDate = txn.meta?.transaction_time
      ? txn.meta.transaction_time.slice(0, 10)
      : postedDate;
    const amountPence = Math.round(txn.amount * 100);

    await pool.query(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, needs_review)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, TRUE)
       ON CONFLICT (account_id, external_id) DO NOTHING`,
      [
        linkedAccountId, userId, txn.transaction_id,
        txn.merchant_name ?? null, txn.description,
        amountPence, txn.currency,
        transactionDate, postedDate,
      ],
    );
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="truelayer/sync"
```

Expected: PASS — 3/3

- [ ] **Step 5: Commit**

```bash
git add api/src/truelayer/sync.ts api/src/__tests__/truelayer/sync.test.ts
git commit -m "feat(api): add TrueLayer account and transaction sync"
```

---

### Task 6: Auth + sync routes

**Files:**
- Create: `api/src/routes/auth.ts`
- Create: `api/src/routes/sync.ts`
- Create: `api/src/__tests__/routes/auth.test.ts`
- Create: `api/src/__tests__/routes/sync.test.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/src/__tests__/routes/auth.test.ts`:

```typescript
import request from 'supertest';
import { createApp } from '@/app';

jest.mock('@/db/client', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));
jest.mock('@/truelayer/oauth', () => ({
  buildAuthUrl: jest.fn(() => 'https://auth.truelayer.com/?state=test'),
  exchangeCode: jest.fn().mockResolvedValue({
    access_token: 'acc', refresh_token: 'ref', expires_in: 3600,
  }),
}));
jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn(s => `enc:${s}`),
}));

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

const app = createApp();

describe('GET /auth/truelayer', () => {
  it('redirects to TrueLayer auth URL', async () => {
    const res = await request(app).get('/auth/truelayer?userId=user-1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('auth.truelayer.com');
  });
});

describe('GET /auth/callback', () => {
  it('returns 400 when code is missing', async () => {
    const res = await request(app).get('/auth/callback?state=user-1');
    expect(res.status).toBe(400);
  });

  it('exchanges code and stores tokens', async () => {
    const { pool } = require('@/db/client');
    const res = await request(app).get('/auth/callback?code=auth-code&state=user-1');
    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE linked_accounts'),
      expect.arrayContaining(['enc:acc', 'enc:ref']),
    );
  });
});
```

Create `api/src/__tests__/routes/sync.test.ts`:

```typescript
import request from 'supertest';
import { createApp } from '@/app';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));
jest.mock('@/truelayer/sync', () => ({
  syncAccounts: jest.fn().mockResolvedValue(undefined),
  syncTransactions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/crypto', () => ({ decrypt: jest.fn(s => s.replace('enc:', '')) }));

const app = createApp();

describe('POST /sync/:userId', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 404 when no linked accounts found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/sync/user-1');
    expect(res.status).toBe(404);
  });

  it('returns 200 and syncs each account', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'la-1', external_id: 'acc-001', access_token_enc: 'enc:token' }],
    });
    const { syncAccounts, syncTransactions } = require('@/truelayer/sync');
    const res = await request(app).post('/sync/user-1');
    expect(res.status).toBe(200);
    expect(syncTransactions).toHaveBeenCalledWith('user-1', 'la-1', 'acc-001', 'token');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd api && npm test -- --testPathPattern="routes/(auth|sync)"
```

Expected: FAIL — modules not found

- [ ] **Step 3: Create `api/src/routes/auth.ts`**

```typescript
import { Router } from 'express';
import crypto from 'crypto';
import { buildAuthUrl, exchangeCode } from '@/truelayer/oauth';
import { encrypt } from '@/lib/crypto';
import { pool } from '@/db/client';

const router = Router();

// GET /auth/truelayer?userId=<uuid>
// Redirects user to TrueLayer consent screen. userId is passed as state.
router.get('/auth/truelayer', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  const state = `${userId}:${crypto.randomBytes(8).toString('hex')}`;
  res.redirect(buildAuthUrl(state));
});

// GET /auth/callback?code=<code>&state=<userId:nonce>
router.get('/auth/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!code || !state) { res.status(400).json({ error: 'code and state required' }); return; }

  const userId = state.split(':')[0];
  try {
    const tokens = await exchangeCode(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await pool.query(
      `UPDATE linked_accounts
       SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3
       WHERE user_id = $4`,
      [encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt, userId],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

- [ ] **Step 4: Create `api/src/routes/sync.ts`**

```typescript
import { Router } from 'express';
import { pool } from '@/db/client';
import { decrypt } from '@/lib/crypto';
import { syncAccounts, syncTransactions } from '@/truelayer/sync';

const router = Router();

// POST /sync/:userId — manually trigger a full sync for all linked accounts
router.post('/sync/:userId', async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, external_id, access_token_enc FROM linked_accounts WHERE user_id = $1`,
    [userId],
  );
  if (rows.length === 0) { res.status(404).json({ error: 'No linked accounts' }); return; }

  try {
    for (const acct of rows) {
      const accessToken = decrypt(acct.access_token_enc as string);
      await syncAccounts(userId, acct.id as string, accessToken);
      await syncTransactions(userId, acct.id as string, acct.external_id as string, accessToken);
    }
    await pool.query(
      `UPDATE linked_accounts SET last_synced_at = NOW() WHERE user_id = $1`,
      [userId],
    );
    res.json({ ok: true, synced: rows.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

- [ ] **Step 5: Update `api/src/app.ts` to mount new routes**

Replace the existing `app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import authRouter from '@/routes/auth';
import syncRouter from '@/routes/sync';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(syncRouter);
  return app;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd api && npm test -- --testPathPattern="routes/(auth|sync)"
```

Expected: PASS — 5/5

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/auth.ts api/src/routes/sync.ts api/src/app.ts \
        api/src/__tests__/routes/auth.test.ts api/src/__tests__/routes/sync.test.ts
git commit -m "feat(api): add TrueLayer OAuth callback and manual sync routes"
```

---

### Task 7: Full suite + push

- [ ] **Step 1: Run the full test suite**

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

Test Suites: 9 passed, 9 total
Tests:       ~22 passed, 0 failed
```

Fix any failures before pushing.

- [ ] **Step 2: Push**

```bash
git push origin claude/sleepy-ride-4eN6l
```

---

## Self-Review

### Spec coverage
- [x] TrueLayer OAuth (NatWest, Halifax, Monzo providers) → Task 3 (`buildAuthUrl` includes provider list)
- [x] Token storage encrypted → Task 1 (AES-256-GCM) + Task 6 (stored via `encrypt()`)
- [x] Account sync → Task 5 (`syncAccounts`)
- [x] Transaction sync with `transaction_date` + `posted_date` → Task 5 (`syncTransactions` uses `meta.transaction_time` for transaction_date, `timestamp` for posted_date)
- [x] New transactions marked `needs_review = TRUE` → Task 5 (`syncTransactions` INSERT)
- [x] Manual sync trigger → Task 6 (`POST /sync/:userId`)

### Placeholder scan
No TBD, TODO, or vague instructions present.

### Type consistency
- `TrueLayerAccount`, `TrueLayerTransaction`, `TrueLayerTokenResponse`, `TrueLayerApiResponse<T>` defined in `truelayer/types.ts`, imported in `oauth.ts`, `sync.ts`, and tests — same type names throughout.
- `encrypt` / `decrypt` from `@/lib/crypto` — same import path in `routes/auth.ts`, `routes/sync.ts`, and tests.
- `pool` from `@/db/client` — same import path as Plan B.
- `syncAccounts(userId, linkedAccountId, accessToken)` and `syncTransactions(userId, linkedAccountId, externalAccountId, accessToken)` — signatures defined in Task 5, called with same parameter order in Task 6 route and tests.
