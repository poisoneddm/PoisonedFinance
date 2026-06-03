import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { parseStatementText } from '@/pdf/parse';
import { importStatement } from '@/pdf/import';

const router = Router();

// 10MB upload cap. Memory storage: we never write the PDF to disk; the buffer
// lives only in req.file.buffer for the duration of this request.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('file must be a PDF'));
      return;
    }
    cb(null, true);
  },
});

// Wrap multer so its errors (size limit, wrong type) produce a clean response
// instead of being forwarded as a generic 500 / hung request.
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'file too large' });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      // fileFilter rejection (non-PDF) or other validation error.
      res.status(400).json({ error: err instanceof Error ? err.message : 'invalid upload' });
      return;
    }
    next();
  });
}

// POST /import/pdf
// Multipart fields:
//   file   — the PDF statement file (required)
//   userId — UUID of the user importing (required)
router.post('/import/pdf', uploadSingle, async (req, res) => {
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
    console.error('[import/pdf]', err);
    res.status(500).json({ error: 'failed to import statement' });
  }
});

export default router;
