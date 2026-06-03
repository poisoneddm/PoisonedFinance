import request from 'supertest';

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

import { createApp } from '@/app';

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

  it('returns 500 with a generic message (no internal detail leak) when pdf-parse throws', async () => {
    mockPdfParse.mockRejectedValueOnce(new Error('corrupted PDF internal stack'));

    const res = await request(app)
      .post('/import/pdf')
      .field('userId', SEED_USER_ID)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'bad.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/corrupted PDF internal stack/);
  });

  it('returns 400 for a non-PDF upload (file type filter)', async () => {
    const res = await request(app)
      .post('/import/pdf')
      .field('userId', SEED_USER_ID)
      .attach('file', Buffer.from('not-a-pdf'), { filename: 'image.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pdf/i);
    expect(mockPdfParse).not.toHaveBeenCalled();
  });

  it('returns 413 when the uploaded file exceeds the size limit', async () => {
    // Default limit is 10MB; send 11MB of "PDF" so multer rejects before parsing.
    const big = Buffer.alloc(11 * 1024 * 1024, 0x20);
    const res = await request(app)
      .post('/import/pdf')
      .field('userId', SEED_USER_ID)
      .attach('file', big, { filename: 'huge.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(413);
    expect(mockPdfParse).not.toHaveBeenCalled();
  });
});
