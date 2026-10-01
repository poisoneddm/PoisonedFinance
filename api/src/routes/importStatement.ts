import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import type { ParsedStatement } from '@/statements/common';
import { parsePdfText } from '@/statements/pdf';
import { parseCsv } from '@/statements/csv';
import { parseOfx } from '@/statements/ofx';
import { importStatement } from '@/statements/import';

const router = Router();

// 10MB upload cap. Memory storage: we never write the statement to disk; the
// buffer lives only in req.file.buffer for the duration of this request.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// Wrap multer so its errors (size limit) produce a clean response
// instead of being forwarded as a generic 500 / hung request.
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file too large' });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'invalid upload' });
      return;
    }
    next();
  });
}

type StatementFormat = 'pdf' | 'ofx' | 'csv';

// Detect by content: phones report CSV/OFX mime types inconsistently.
function detectFormat(buffer: Buffer, filename: string): StatementFormat | null {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const head = buffer.subarray(0, 4096).toString('latin1');
  if (/OFXHEADER|<OFX>/i.test(head)) return 'ofx';
  if (/\.csv$/i.test(filename) || /^﻿?"?date"?\s*,/im.test(head)) return 'csv';
  return null;
}

async function parseStatement(format: StatementFormat, buffer: Buffer): Promise<ParsedStatement> {
  switch (format) {
    case 'pdf':
      return parsePdfText((await pdfParse(buffer)).text);
    case 'ofx':
      return parseOfx(buffer.toString('latin1'));
    case 'csv':
      return parseCsv(buffer.toString('utf8'));
  }
}

// POST /import/statement
// Multipart fields:
//   file   — the statement (PDF, CSV or OFX) (required)
//   userId — UUID of the user importing (required)
router.post('/import/statement', uploadSingle, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file field is required' });
    return;
  }

  const userId = (req.body as { userId?: string }).userId;
  if (!userId) {
    res.status(400).json({ error: 'userId field is required' });
    return;
  }

  const format = detectFormat(req.file.buffer, req.file.originalname);
  if (!format) {
    res.status(400).json({ error: 'unsupported file — upload a PDF, CSV or OFX statement' });
    return;
  }

  try {
    const statement = await parseStatement(format, req.file.buffer);
    if (statement.transactions.length === 0) {
      res.status(422).json({ error: `no transactions found in this ${format.toUpperCase()} file` });
      return;
    }
    const imported = await importStatement(userId, statement);
    res.json({ ok: true, imported, found: statement.transactions.length });
  } catch (err) {
    console.error('[import/statement]', err);
    res.status(500).json({ error: 'failed to import statement' });
  }
});

export default router;
