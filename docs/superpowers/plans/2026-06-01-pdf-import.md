# PoisonedFinance — PDF Statement Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the PDF statement upload fallback (§9 `POST /import/pdf`, design spec "Sync → Fallback"). Users upload a UK bank statement PDF; the server extracts transaction lines, deduplicates, inserts them with `needs_review = TRUE`, runs the categorisation pipeline, and returns the count of newly imported rows. A mobile Settings screen action triggers the upload via `expo-document-picker`.

**Architecture:** Two new modules under `api/src/pdf/`: `parse.ts` (pure text → `ParsedTxn[]`) and `import.ts` (`importStatement` — find-or-create a `provider='pdf'` sentinel connection + linked account, bulk-insert, call `runPipeline`). A new Express router `api/src/routes/importPdf.ts` handles multipart upload via `multer` (memory storage), calls `pdf-parse`, then `importStatement`. The mobile Settings screen gains an "Upload statement (PDF)" button powered by `expo-document-picker`; a new `apiUpload` helper in `mobile/lib/api.ts` performs the multipart POST. Prerequisite: Plans B, C, and D must be complete.

**Tech Stack:** `multer` (multipart/memory-storage), `pdf-parse` (PDF text extraction), Node.js built-in `crypto` (SHA-256 for synthetic external_id deduplication), `pg`, Express 4, supertest — on the API. `expo-document-picker` on mobile.

---

## File Structure

```
api/src/
├── pdf/
│   ├── parse.ts                    # parseStatementText(text): ParsedTxn[]
│   └── import.ts                   # importStatement(userId, label, parsed[])
└── routes/
    └── importPdf.ts                # POST /import/pdf (multer + pdf-parse + importStatement)

api/src/__tests__/
├── pdf/
│   ├── parse.test.ts
│   └── import.test.ts
└── routes/
    └── importPdf.test.ts

mobile/
├── lib/
│   └── api.ts                      # Modify: add apiUpload helper
├── app/(tabs)/
│   └── settings.tsx                # Modify: add "Upload statement (PDF)" action
└── __tests__/
    └── lib/
        └── api.test.ts             # Modify: add apiUpload test
```

Plus:
- `api/package.json` — add `multer`, `pdf-parse`, `@types/multer`, `@types/pdf-parse`
- `api/src/app.ts` — mount `importPdf` router
- `mobile/package.json` — add `expo-document-picker`

---

### Task 1: Add API dependencies (`multer`, `pdf-parse`)

**Files:**
- Modify: `api/package.json`

- [ ] **Step 1: Add `multer` and `pdf-parse` to `api/package.json` dependencies**

In `api/package.json`, add to `"dependencies"`:
```json
"multer": "^1.4.5-lts.1",
"pdf-parse": "^1.1.1"
```

Add to `"devDependencies"`:
```json
"@types/multer": "^1.4.11",
"@types/pdf-parse": "^1.1.4"
```

- [ ] **Step 2: Install**

```bash
cd api && npm install
```

Expected: `multer` and `pdf-parse` appear in `node_modules/`, no errors.

- [ ] **Step 3: Commit**

```bash
git add api/package.json api/package-lock.json
git commit -m "feat(api): add multer and pdf-parse dependencies for PDF import"
```

---

### Task 2: PDF text parser

**Files:**
- Create: `api/src/pdf/parse.ts`
- Create: `api/src/__tests__/pdf/parse.test.ts`

The parser converts raw extracted PDF text into structured transaction records. It must handle two date formats common in UK bank statements (`DD/MM/YYYY` and `DD MMM YYYY`), optional `CR` suffix for credits, and a leading minus for debits. Lines that don't match the pattern are silently skipped.

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/pdf/parse.test.ts`:

```typescript
import { parseStatementText } from '@/pdf/parse';

// Multi-line fixture covering:
//   • DD/MM/YYYY debit (negative amount_pence)
//   • DD/MM/YYYY credit with CR suffix (positive amount_pence)
//   • DD MMM YYYY date format
//   • A junk line that must be ignored
const FIXTURE = `
Account Statement — NatWest Current Account

Date          Description                          Amount
12/03/2026    TESCO STORES 3471                   -45.67
25/03/2026    SALARY BACS PAYMENT                 1500.00CR
08 Apr 2026   AMAZON MKTPLACE PMT                 -12.99
this line is junk and should be ignored entirely
`.trim();

describe('parseStatementText', () => {
  let results: ReturnType<typeof parseStatementText>;

  beforeAll(() => {
    results = parseStatementText(FIXTURE);
  });

  it('returns exactly 3 parsed transactions (junk line excluded)', () => {
    expect(results).toHaveLength(3);
  });

  it('parses DD/MM/YYYY debit: correct date, description, negative pence', () => {
    const txn = results.find(r => r.description === 'TESCO STORES 3471');
    expect(txn).toBeDefined();
    expect(txn!.date).toBe('2026-03-12');
    expect(txn!.amount_pence).toBe(-4567);
  });

  it('parses DD/MM/YYYY credit (CR suffix): positive pence', () => {
    const txn = results.find(r => r.description === 'SALARY BACS PAYMENT');
    expect(txn).toBeDefined();
    expect(txn!.date).toBe('2026-03-25');
    expect(txn!.amount_pence).toBe(150000);
  });

  it('parses DD MMM YYYY date format', () => {
    const txn = results.find(r => r.description === 'AMAZON MKTPLACE PMT');
    expect(txn).toBeDefined();
    expect(txn!.date).toBe('2026-04-08');
    expect(txn!.amount_pence).toBe(-1299);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd api && npm test -- --testPathPattern="pdf/parse"
```

Expected: FAIL — `Cannot find module '@/pdf/parse'`

- [ ] **Step 3: Create `api/src/pdf/parse.ts`**

```typescript
export interface ParsedTxn {
  date: string;          // YYYY-MM-DD
  description: string;
  amount_pence: number;  // negative = debit, positive = credit
}

// Month name → zero-padded two-digit month number
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
};

// Matches lines like:
//   12/03/2026    TESCO STORES 3471    -45.67
//   25/03/2026    SALARY BACS PAYMENT  1500.00CR
//   08 Apr 2026   AMAZON MKTPLACE PMT  -12.99
//
// Named capture groups:
//   dmy   — DD/MM/YYYY  (group 1) OR
//   dmy2  — DD MMM YYYY (group 2)
//   desc  — description (trimmed, may contain spaces)
//   neg   — leading minus (optional)
//   amt   — numeric amount (digits and dot)
//   cr    — "CR" suffix (optional, means credit)
const LINE_RE =
  /^(?:(\d{2})\/(\d{2})\/(\d{4})|(\d{2})\s+([A-Za-z]{3})\s+(\d{4}))\s{2,}(.+?)\s{2,}(-?)(\d+\.\d{2})(CR)?$/;

function parseLine(line: string): ParsedTxn | null {
  const m = LINE_RE.exec(line.trim());
  if (!m) return null;

  let date: string;
  if (m[1]) {
    // DD/MM/YYYY
    date = `${m[3]}-${m[2]}-${m[1]}`;
  } else {
    // DD MMM YYYY
    const monthNum = MONTH_MAP[m[5].toLowerCase()];
    if (!monthNum) return null;
    date = `${m[6]}-${monthNum}-${m[4]}`;
  }

  const description = m[7].trim();
  const isDebit = m[8] === '-';
  const isCredit = m[10] === 'CR';
  const pence = Math.round(parseFloat(m[9]) * 100);

  // A leading minus with no CR suffix = debit (negative).
  // CR suffix = credit (positive), regardless of leading minus.
  const amount_pence = isCredit ? pence : isDebit ? -pence : pence;

  return { date, description, amount_pence };
}

export function parseStatementText(text: string): ParsedTxn[] {
  const results: ParsedTxn[] = [];
  for (const line of text.split('\n')) {
    const txn = parseLine(line);
    if (txn) results.push(txn);
  }
  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd api && npm test -- --testPathPattern="pdf/parse"
```

Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add api/src/pdf/parse.ts api/src/__tests__/pdf/parse.test.ts
git commit -m "feat(api): add PDF statement text parser (DD/MM/YYYY, DD MMM YYYY, CR credits)"
```

---

### Task 3: Statement importer (`importStatement`)

**Files:**
- Create: `api/src/pdf/import.ts`
- Create: `api/src/__tests__/pdf/import.test.ts`

`importStatement` find-or-creates a sentinel `bank_connections` row with `provider = 'pdf'` (storing `encrypt('')` as both token fields, with a far-future expiry — satisfying the `NOT NULL` constraint from contracts §2 without any real OAuth tokens). It then find-or-creates a `linked_accounts` row for that connection labelled `"PDF Import"`. For each `ParsedTxn` it computes a deterministic `external_id = sha256(date + '|' + description + '|' + String(amount_pence))` for deduplication, inserts with `needs_review = TRUE`, `transaction_date` and `posted_date` both set to the parsed date, `merchant_name = NULL`. It collects newly-inserted IDs and calls `runPipeline(userId, newIds)`.

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/pdf/import.test.ts`:

```typescript
import { importStatement } from '@/pdf/import';
import type { ParsedTxn } from '@/pdf/parse';

const mockQuery = jest.fn();
jest.mock('@/db/client', () => ({ pool: { query: mockQuery } }));

const mockEncrypt = jest.fn((s: string) => `enc:${s}`);
jest.mock('@/lib/crypto', () => ({ encrypt: mockEncrypt }));

const mockRunPipeline = jest.fn();
jest.mock('@/categorisation/pipeline', () => ({ runPipeline: mockRunPipeline }));

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

const USER_ID = '00000000-0000-0000-0000-000000000001';
const LABEL = 'NatWest PDF';

const PARSED: ParsedTxn[] = [
  { date: '2026-03-12', description: 'TESCO STORES 3471', amount_pence: -4567 },
  { date: '2026-03-25', description: 'SALARY BACS PAYMENT', amount_pence: 150000 },
];

beforeEach(() => {
  mockQuery.mockReset();
  mockRunPipeline.mockReset();
  mockEncrypt.mockClear();
});

describe('importStatement', () => {
  it('find-or-creates the pdf bank_connection with provider=pdf', async () => {
    // find-or-create connection — returns existing row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    // find-or-create linked_account — returns existing row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    // INSERT txn 1 — new row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    // INSERT txn 2 — duplicate (DO NOTHING returns no row)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // runPipeline — no DB call (mocked)

    await importStatement(USER_ID, LABEL, PARSED);

    // First query must select (or upsert) bank_connections with provider='pdf'
    const connCall = mockQuery.mock.calls[0];
    expect(connCall[0]).toContain('bank_connections');
    expect(connCall[1]).toContain('pdf');
    expect(connCall[1]).toContain(USER_ID);
  });

  it('find-or-creates a linked_account with connection_id from the pdf connection', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await importStatement(USER_ID, LABEL, PARSED);

    const laCall = mockQuery.mock.calls[1];
    expect(laCall[0]).toContain('linked_accounts');
    expect(laCall[1]).toContain('conn-pdf-1');
  });

  it('inserts each txn with needs_review=TRUE, both dates set to parsed date, merchant_name null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-2' }] });

    await importStatement(USER_ID, LABEL, PARSED);

    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('needs_review');
    expect(insertCall[0]).toContain('transaction_date');
    expect(insertCall[0]).toContain('posted_date');
    // Both date params should equal the parsed date
    expect(insertCall[1]).toContain('2026-03-12');
    // merchant_name should be null
    expect(insertCall[1]).toContain(null);
  });

  it('uses a sha256 external_id for deduplication', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await importStatement(USER_ID, LABEL, PARSED);

    const insertCall = mockQuery.mock.calls[2];
    // external_id should be a hex string (SHA-256 = 64 hex chars)
    const externalId = insertCall[1].find(
      (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v),
    );
    expect(externalId).toBeDefined();
  });

  it('calls runPipeline with only the ids of newly inserted rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    // txn-1 is new
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'txn-uuid-1' }] });
    // txn-2 is a duplicate (ON CONFLICT DO NOTHING returns no rows)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await importStatement(USER_ID, LABEL, PARSED);

    expect(mockRunPipeline).toHaveBeenCalledWith(USER_ID, ['txn-uuid-1']);
    expect(result).toBe(1);
  });

  it('skips runPipeline when no new rows were inserted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'conn-pdf-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'la-pdf-1' }] });
    // both duplicates
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await importStatement(USER_ID, LABEL, PARSED);

    expect(mockRunPipeline).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd api && npm test -- --testPathPattern="pdf/import"
```

Expected: FAIL — `Cannot find module '@/pdf/import'`

- [ ] **Step 3: Create `api/src/pdf/import.ts`**

```typescript
import crypto from 'crypto';
import { pool } from '@/db/client';
import { encrypt } from '@/lib/crypto';
import { runPipeline } from '@/categorisation/pipeline';
import type { ParsedTxn } from './parse';

/**
 * Compute a deterministic external_id for a parsed transaction so that
 * re-uploading the same PDF does not create duplicate rows.
 */
function syntheticExternalId(txn: ParsedTxn): string {
  return crypto
    .createHash('sha256')
    .update(`${txn.date}|${txn.description}|${String(txn.amount_pence)}`)
    .digest('hex');
}

/**
 * Find or create the sentinel bank_connections row for PDF imports.
 *
 * Per contracts §2 / §3, bank_connections.access_token_enc and
 * refresh_token_enc are NOT NULL. For the PDF sentinel we store encrypt('')
 * in both columns and use a far-future token_expires_at so no refresh is
 * ever attempted by the normal token-refresh path.
 */
async function findOrCreatePdfConnection(userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM bank_connections WHERE user_id = $1 AND provider = 'pdf' LIMIT 1`,
    [userId],
  );
  if (rows.length > 0) return rows[0].id;

  const emptyEnc = encrypt('');
  const farFuture = new Date('2099-12-31T23:59:59Z');

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO bank_connections
       (user_id, provider, access_token_enc, refresh_token_enc, token_expires_at)
     VALUES ($1, 'pdf', $2, $3, $4)
     RETURNING id`,
    [userId, emptyEnc, emptyEnc, farFuture],
  );
  return inserted[0].id;
}

/**
 * Find or create the "PDF Import" linked_account for this user's PDF connection.
 * The account_name is fixed to "PDF Import"; external_id is a stable synthetic key.
 */
async function findOrCreatePdfLinkedAccount(
  userId: string,
  connectionId: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM linked_accounts
     WHERE user_id = $1 AND connection_id = $2 LIMIT 1`,
    [userId, connectionId],
  );
  if (rows.length > 0) return rows[0].id;

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO linked_accounts
       (user_id, connection_id, external_id, account_name, account_type, currency)
     VALUES ($1, $2, 'pdf-import', 'PDF Import', 'TRANSACTION', 'GBP')
     RETURNING id`,
    [userId, connectionId],
  );
  return inserted[0].id;
}

/**
 * Import a list of parsed transactions for a user.
 *
 * @param userId   - The user who owns these transactions (SEED_USER_ID for MVP)
 * @param label    - Human-readable label (e.g. "NatWest PDF") — not stored; for caller tracing
 * @param parsed   - Output of parseStatementText()
 * @returns        - Count of newly inserted (non-duplicate) transactions
 */
export async function importStatement(
  userId: string,
  label: string,
  parsed: ParsedTxn[],
): Promise<number> {
  if (parsed.length === 0) return 0;

  const connectionId = await findOrCreatePdfConnection(userId);
  const linkedAccountId = await findOrCreatePdfLinkedAccount(userId, connectionId);

  const newIds: string[] = [];

  for (const txn of parsed) {
    const externalId = syntheticExternalId(txn);

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO transactions
         (account_id, user_id, external_id, merchant_name, description,
          amount_pence, currency, transaction_date, posted_date, needs_review)
       VALUES ($1, $2, $3, $4, $5, $6, 'GBP', $7, $8, TRUE)
       ON CONFLICT (account_id, external_id) DO NOTHING
       RETURNING id`,
      [
        linkedAccountId,
        userId,
        externalId,
        null,            // merchant_name — null for PDF imports; pipeline will categorise
        txn.description,
        txn.amount_pence,
        txn.date,        // transaction_date
        txn.date,        // posted_date (same — PDF has no separate posting date)
      ],
    );

    if (rows.length > 0) newIds.push(rows[0].id);
  }

  if (newIds.length > 0) {
    await runPipeline(userId, newIds);
  }

  return newIds.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd api && npm test -- --testPathPattern="pdf/import"
```

Expected: PASS — 6/6

- [ ] **Step 5: Commit**

```bash
git add api/src/pdf/import.ts api/src/__tests__/pdf/import.test.ts
git commit -m "feat(api): add importStatement with pdf sentinel connection and sha256 deduplication"
```

---

### Task 4: `POST /import/pdf` route

**Files:**
- Create: `api/src/routes/importPdf.ts`
- Create: `api/src/__tests__/routes/importPdf.test.ts`
- Modify: `api/src/app.ts`

The route accepts `multipart/form-data` with fields `file` (the PDF) and `userId` (string). It uses `multer` with memory storage so the PDF buffer is available in `req.file.buffer`. The buffer is passed to `pdf-parse` to extract raw text, which is forwarded to `parseStatementText`, then `importStatement`. On success it returns `{ ok: true, imported: n }`.

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/routes/importPdf.test.ts`:

```typescript
import request from 'supertest';
import { createApp } from '@/app';

// Mock pdf-parse so tests never need a real PDF buffer
const mockPdfParse = jest.fn();
jest.mock('pdf-parse', () => mockPdfParse);

// Mock importStatement so the test stays unit-level
const mockImportStatement = jest.fn();
jest.mock('@/pdf/import', () => ({ importStatement: mockImportStatement }));

// Mock parseStatementText; return a controlled list of parsed txns
const mockParseStatementText = jest.fn();
jest.mock('@/pdf/parse', () => ({ parseStatementText: mockParseStatementText }));

// Mock db (needed by app.ts health route and any other router)
jest.mock('@/db/client', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const app = createApp();

beforeEach(() => {
  mockPdfParse.mockReset();
  mockImportStatement.mockReset();
  mockParseStatementText.mockReset();
});

describe('POST /import/pdf', () => {
  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/import/pdf')
      .field('userId', SEED_USER_ID);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/import/pdf')
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'statement.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it('extracts text, parses, imports and returns { ok, imported }', async () => {
    const FIXTURE_TEXT = '12/03/2026    TESCO STORES 3471    -45.67';
    const PARSED_TXNS = [
      { date: '2026-03-12', description: 'TESCO STORES 3471', amount_pence: -4567 },
    ];

    mockPdfParse.mockResolvedValueOnce({ text: FIXTURE_TEXT });
    mockParseStatementText.mockReturnValueOnce(PARSED_TXNS);
    mockImportStatement.mockResolvedValueOnce(1);

    const res = await request(app)
      .post('/import/pdf')
      .field('userId', SEED_USER_ID)
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'statement.pdf');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, imported: 1 });

    // pdf-parse must have been called with the file buffer
    expect(mockPdfParse).toHaveBeenCalledWith(expect.any(Buffer));
    // parseStatementText called with the extracted text
    expect(mockParseStatementText).toHaveBeenCalledWith(FIXTURE_TEXT);
    // importStatement called with userId and parsed txns
    expect(mockImportStatement).toHaveBeenCalledWith(SEED_USER_ID, 'statement.pdf', PARSED_TXNS);
  });

  it('returns 500 when pdf-parse throws', async () => {
    mockPdfParse.mockRejectedValueOnce(new Error('corrupted PDF'));

    const res = await request(app)
      .post('/import/pdf')
      .field('userId', SEED_USER_ID)
      .attach('file', Buffer.from('not a pdf'), 'bad.pdf');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/corrupted PDF/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd api && npm test -- --testPathPattern="routes/importPdf"
```

Expected: FAIL — `Cannot find module '@/routes/importPdf'` (and route not mounted)

- [ ] **Step 3: Create `api/src/routes/importPdf.ts`**

```typescript
import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { parseStatementText } from '@/pdf/parse';
import { importStatement } from '@/pdf/import';

const router = Router();

// Memory storage: we never write the PDF to disk; the buffer lives only in
// req.file.buffer for the duration of this request.
const upload = multer({ storage: multer.memoryStorage() });

// POST /import/pdf
// Multipart fields:
//   file   — the PDF statement file (required)
//   userId — UUID of the user importing (required)
router.post('/import/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file field is required' });
    return;
  }

  const userId = (req.body as { userId?: string }).userId;
  if (!userId) {
    res.status(400).json({ error: 'userId field is required' });
    return;
  }

  try {
    const { text } = await pdfParse(req.file.buffer);
    const parsed = parseStatementText(text);
    const imported = await importStatement(userId, req.file.originalname, parsed);
    res.json({ ok: true, imported });
  } catch (err) {
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

export default router;
```

- [ ] **Step 4: Update `api/src/app.ts` to mount the PDF import router**

Modify the existing `app.ts` — add the import and mount line:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from '@/routes/health';
import authRouter from '@/routes/auth';
import syncRouter from '@/routes/sync';
import reviewRouter from '@/routes/review';
import importPdfRouter from '@/routes/importPdf';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);
  app.use(authRouter);
  app.use(syncRouter);
  app.use(reviewRouter);
  app.use(importPdfRouter);
  return app;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd api && npm test -- --testPathPattern="routes/importPdf"
```

Expected: PASS — 4/4

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/importPdf.ts api/src/app.ts \
        api/src/__tests__/routes/importPdf.test.ts
git commit -m "feat(api): add POST /import/pdf route (multer + pdf-parse + importStatement)"
```

---

### Task 5: Mobile — `expo-document-picker` dep + `apiUpload` helper + Settings screen action

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/lib/api.ts`
- Modify: `mobile/app/(tabs)/settings.tsx`
- Modify: `mobile/__tests__/lib/api.test.ts`

#### Step A — Add `expo-document-picker` dependency

- [ ] **Step A1: Add `expo-document-picker` to `mobile/package.json` dependencies**

In `mobile/package.json`, add to `"dependencies"`:
```json
"expo-document-picker": "~11.10.1"
```

- [ ] **Step A2: Install**

```bash
cd mobile && npm install
```

Expected: `expo-document-picker` appears in `node_modules/`, no errors.

- [ ] **Step A3: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): add expo-document-picker dependency"
```

#### Step B — `apiUpload` helper in `mobile/lib/api.ts`

- [ ] **Step B1: Write the failing test**

In `mobile/__tests__/lib/api.test.ts`, add the following test block (preserve any existing tests in the file — add below them):

```typescript
import { apiUpload } from '@/lib/api';

// Preserve original fetch
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('apiUpload', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
  });

  it('POSTs multipart FormData and returns parsed JSON on success', async () => {
    const mockResponse = { ok: true, imported: 2 };
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    }) as jest.Mock;

    const formData = new FormData();
    formData.append('userId', '00000000-0000-0000-0000-000000000001');

    const result = await apiUpload('/import/pdf', formData);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:3000/import/pdf');
    // Must NOT set Content-Type manually — let fetch set the multipart boundary
    expect((init.headers as Record<string, string> | undefined)?.['Content-Type']).toBeUndefined();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(formData);
    expect(result).toEqual(mockResponse);
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }) as jest.Mock;

    const formData = new FormData();
    await expect(apiUpload('/import/pdf', formData)).rejects.toThrow('500');
  });
});
```

- [ ] **Step B2: Run the test to verify it fails**

```bash
cd mobile && npm test -- --testPathPattern="lib/api"
```

Expected: FAIL — `apiUpload` is not exported from `@/lib/api`

- [ ] **Step B3: Add `apiUpload` to `mobile/lib/api.ts`**

Open `mobile/lib/api.ts` and append the following export (keep existing `apiGet`, `apiPost`, `apiPut` functions intact):

```typescript
/**
 * POST multipart/form-data to the API.
 * Do NOT set Content-Type manually — the browser/RN fetch implementation
 * injects the correct multipart boundary when body is a FormData instance.
 */
export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL ?? '';
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step B4: Run the test to verify it passes**

```bash
cd mobile && npm test -- --testPathPattern="lib/api"
```

Expected: PASS — all api tests pass (existing + 2 new)

- [ ] **Step B5: Commit**

```bash
git add mobile/lib/api.ts mobile/__tests__/lib/api.test.ts
git commit -m "feat(mobile): add apiUpload helper for multipart FormData POST"
```

#### Step C — "Upload statement (PDF)" action on Settings screen

- [ ] **Step C1: Modify `mobile/app/(tabs)/settings.tsx`**

Open `mobile/app/(tabs)/settings.tsx`. Add the PDF upload action block below the existing screen content. The complete modified file should contain:

```typescript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiUpload } from '@/lib/api';
import { SEED_USER_ID } from '@/lib/currentUser';

// NOTE: keep any existing imports / content already in this file above this block.
// The section below should be added to the screen's rendered JSX.

export default function SettingsScreen() {
  const [uploading, setUploading] = useState(false);

  async function handlePdfUpload() {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
    } catch {
      Alert.alert('Error', 'Could not open document picker.');
      return;
    }

    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const formData = new FormData();
      // React Native FormData accepts { uri, name, type } objects
      formData.append('file', {
        uri: asset.uri,
        name: asset.name ?? 'statement.pdf',
        type: 'application/pdf',
      } as unknown as Blob);
      formData.append('userId', SEED_USER_ID);

      const response = await apiUpload<{ ok: boolean; imported: number }>(
        '/import/pdf',
        formData,
      );
      Alert.alert(
        'Import complete',
        `${response.imported} new transaction${response.imported === 1 ? '' : 's'} imported.`,
      );
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bank Data</Text>
        <TouchableOpacity
          style={[styles.button, uploading && styles.buttonDisabled]}
          onPress={handlePdfUpload}
          disabled={uploading}
          accessibilityLabel="Upload statement PDF"
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Upload statement (PDF)</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f13',
    padding: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#5b4fcf',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

- [ ] **Step C2: Add `SEED_USER_ID` to `mobile/lib/currentUser.ts`** (create if it does not exist)

`mobile/lib/currentUser.ts`:
```typescript
/** MVP single-user constant. Replace with real auth session when auth is added. */
export const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step C3: Commit**

```bash
git add mobile/app/(tabs)/settings.tsx mobile/lib/currentUser.ts
git commit -m "feat(mobile): add PDF statement upload action to Settings screen"
```

---

### Task 6: Full suite verification

- [ ] **Step 1: Run the full API test suite**

```bash
cd api && npm test
```

Expected (new test files in addition to all prior plans):
```
 PASS  src/__tests__/pdf/parse.test.ts
 PASS  src/__tests__/pdf/import.test.ts
 PASS  src/__tests__/routes/importPdf.test.ts
 ... (all prior suites also PASS)

Test Suites: 16 passed, 16 total
Tests:       ~49 passed, 0 failed
```

Fix any failures before proceeding.

- [ ] **Step 2: Run the mobile test suite**

```bash
cd mobile && npm test
```

Expected:
```
 PASS  __tests__/lib/api.test.ts
 ... (all prior suites also PASS)

Test Suites: all passed
Tests:       all passed, 0 failed
```

Fix any failures before proceeding.

- [ ] **Step 3: Push**

```bash
git push origin claude/sleepy-ride-4eN6l
```

---

## Self-Review

### Spec coverage
- [x] `POST /import/pdf` (multipart, field `file`, `userId`) → Task 4 (`routes/importPdf.ts`, mounted in `app.ts`)
- [x] PDF text extraction → Task 4 (`pdf-parse` called on `req.file.buffer`)
- [x] UK statement line parsing (`DD/MM/YYYY`, `DD MMM YYYY`, `CR` credits, debit negatives) → Task 2 (`parse.ts`, regex `LINE_RE`, tested with multi-line fixture covering all four cases)
- [x] Deduplication via SHA-256 `external_id` → Task 3 (`syntheticExternalId`)
- [x] `needs_review = TRUE` for all imported rows → Task 3 (`importStatement` INSERT)
- [x] `transaction_date` and `posted_date` both set to parsed date → Task 3 (both params set to `txn.date`)
- [x] `merchant_name = NULL` on import → Task 3 (explicit `null` in INSERT params)
- [x] `runPipeline(userId, newIds)` called after insert → Task 3 (conditional on `newIds.length > 0`)
- [x] Sentinel `bank_connections` row with `provider = 'pdf'`, encrypted empty tokens, far-future expiry — satisfies `NOT NULL` constraint from contracts §2 → Task 3 (`findOrCreatePdfConnection`, `encrypt('')`, `2099-12-31`)
- [x] `linked_accounts` row with `connection_id` FK referencing the sentinel connection → Task 3 (`findOrCreatePdfLinkedAccount`)
- [x] `SEED_USER_ID` used as default user (contracts §1) → Task 3 doc + Task 5 (`mobile/lib/currentUser.ts`)
- [x] Mobile "Upload statement (PDF)" action on Settings screen → Task 5 Step C
- [x] `expo-document-picker` used for file selection → Task 5 Steps A + C
- [x] `apiUpload` helper in `mobile/lib/api.ts` (contracts §13) → Task 5 Step B
- [x] No `Content-Type` header set manually on `apiUpload` (lets fetch set multipart boundary) → Task 5 Step B3, tested in Step B1

### Placeholder scan
No TBD, TODO, or vague instructions present. All code blocks are complete implementations.

### Type consistency
- `ParsedTxn { date: string, description: string, amount_pence: number }` — defined and exported from `api/src/pdf/parse.ts`, imported in `api/src/pdf/import.ts` and `api/src/__tests__/pdf/import.test.ts` — same shape everywhere.
- `importStatement(userId: string, label: string, parsed: ParsedTxn[]): Promise<number>` — defined in `api/src/pdf/import.ts`, called in `api/src/routes/importPdf.ts` with same parameter order, mocked by same signature in `importPdf.test.ts`.
- `runPipeline(userId, transactionIds)` — same signature as Plan D `api/src/categorisation/pipeline.ts`; called identically here.
- `pool` from `@/db/client` — same import path as Plans B, C, and D throughout.
- `encrypt` from `@/lib/crypto` — same import path as Plan C.
- `apiUpload<T>(path: string, body: FormData): Promise<T>` — defined in `mobile/lib/api.ts`, used in `mobile/app/(tabs)/settings.tsx` with explicit generic `<{ ok: boolean; imported: number }>`.
- `SEED_USER_ID` — `'00000000-0000-0000-0000-000000000001'` (contracts §1) — defined in both `api/src/lib/currentUser.ts` (Plan B) and `mobile/lib/currentUser.ts` (Task 5 Step C2); used identically.
