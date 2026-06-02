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
