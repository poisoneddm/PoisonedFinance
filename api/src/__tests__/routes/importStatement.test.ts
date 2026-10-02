import request from 'supertest';

// Mock pdf-parse so tests never need a real PDF buffer
const mockPdfParse = jest.fn();
jest.mock('pdf-parse', () => mockPdfParse);

// Mock importStatement so the test stays unit-level
const mockImportStatement = jest.fn();
jest.mock('@/statements/import', () => ({ importStatement: mockImportStatement }));

// Mock db (needed by app.ts health route and any other router)
jest.mock('@/db/client', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [] }) } }));

import { createApp } from '@/app';

const SEED_USER_ID = '00000000-0000-0000-0000-000000000001';
const TXN = { date: '2026-03-12', description: 'TESCO STORES 3471', amount_pence: -4567 };

const app = createApp();

beforeEach(() => {
  mockPdfParse.mockReset();
  mockImportStatement.mockReset();
});

function upload(buffer: Buffer, filename: string, contentType = 'application/octet-stream') {
  return request(app)
    .post('/import/statement')
    .field('userId', SEED_USER_ID)
    .attach('file', buffer, { filename, contentType });
}

describe('POST /import/statement', () => {
  it('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/import/statement').field('userId', SEED_USER_ID);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/import/statement')
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'statement.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it('extracts PDF text, parses, imports and returns { ok, imported, found }', async () => {
    mockPdfParse.mockResolvedValueOnce({ text: '12/03/2026    TESCO STORES 3471    -45.67' });
    mockImportStatement.mockResolvedValueOnce(1);

    const res = await upload(Buffer.from('%PDF-1.4 fake'), 'statement.pdf', 'application/pdf');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, imported: 1, found: 1 });
    expect(mockPdfParse).toHaveBeenCalledWith(expect.any(Buffer));
    expect(mockImportStatement).toHaveBeenCalledWith(SEED_USER_ID, { account: null, transactions: [TXN] });
  });

  it('imports a CSV statement regardless of the reported mime type', async () => {
    mockImportStatement.mockResolvedValueOnce(1);
    const csv = 'Date,Type,Description,Value,Balance,Account Name,Account Number\n12 Mar 2026,POS,TESCO STORES 3471,-45.67,100.00,Doe J,600000-12345678\n';

    const res = await upload(Buffer.from(csv), 'export.csv', 'application/vnd.ms-excel');

    expect(res.status).toBe(200);
    expect(mockImportStatement).toHaveBeenCalledWith(SEED_USER_ID, {
      account: { externalId: '600000-12345678', name: 'Account ending 5678' },
      transactions: [TXN],
    });
    expect(mockPdfParse).not.toHaveBeenCalled();
  });

  it('detects a BOM-prefixed CSV without a .csv extension', async () => {
    mockImportStatement.mockResolvedValueOnce(1);
    const csv = '\uFEFFDate,Description,Value\n12 Mar 2026,TESCO STORES 3471,-45.67\n';

    const res = await upload(Buffer.from(csv, 'utf8'), 'export');

    expect(res.status).toBe(200);
    expect(mockImportStatement).toHaveBeenCalledWith(SEED_USER_ID, { account: null, transactions: [TXN] });
  });

  it('imports an OFX statement', async () => {
    mockImportStatement.mockResolvedValueOnce(1);
    const ofx = 'OFXHEADER:100\n<OFX><STMTTRN><DTPOSTED>20260312<TRNAMT>-45.67<NAME>TESCO STORES 3471</STMTTRN></OFX>';

    const res = await upload(Buffer.from(ofx), 'export.ofx');

    expect(res.status).toBe(200);
    expect(mockImportStatement).toHaveBeenCalledWith(SEED_USER_ID, { account: null, transactions: [TXN] });
  });

  it('returns 422 when the file contains no transactions', async () => {
    mockPdfParse.mockResolvedValueOnce({ text: 'nothing useful here' });

    const res = await upload(Buffer.from('%PDF-1.4 fake'), 'statement.pdf', 'application/pdf');

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no transactions/i);
    expect(mockImportStatement).not.toHaveBeenCalled();
  });

  it('returns 500 with a generic message (no internal detail leak) when parsing throws', async () => {
    mockPdfParse.mockRejectedValueOnce(new Error('corrupted PDF internal stack'));

    const res = await upload(Buffer.from('%PDF-1.4 fake'), 'bad.pdf', 'application/pdf');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/corrupted PDF internal stack/);
  });

  it('returns 400 for an unsupported file', async () => {
    const res = await upload(Buffer.from('\x89PNG not-a-statement'), 'image.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PDF, CSV or OFX/);
    expect(mockPdfParse).not.toHaveBeenCalled();
  });

  it('returns 413 when the uploaded file exceeds the size limit', async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 0x20);
    const res = await upload(big, 'huge.pdf', 'application/pdf');

    expect(res.status).toBe(413);
    expect(mockPdfParse).not.toHaveBeenCalled();
  });
});
