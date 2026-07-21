/**
 * leadership.routes — public, lightweight file-store endpoints for the
 * Leadership dashboard's single-source-of-truth Excel workbook.
 *
 * These routes are intentionally PUBLIC (unauthenticated), matching the
 * standalone `/leadership` client module and the static client assets. They
 * back an internal single-file dashboard where the workbook is the only data
 * source; there is no per-user data to protect here.
 */
import { Router, Request, Response } from 'express';
import { upload } from '../middleware/multer';
import * as workbookStore from '../services/leadership-workbook.service';

const router = Router();

// GET /workbook — stream the persisted workbook, or 404 when none exists.
router.get('/workbook', (_req: Request, res: Response): void => {
  if (!workbookStore.hasWorkbook()) {
    res
      .status(404)
      .json({ error: 'No leadership workbook has been uploaded yet.' });
    return;
  }
  const buffer = workbookStore.readWorkbook();
  if (buffer === null) {
    res
      .status(404)
      .json({ error: 'No leadership workbook has been uploaded yet.' });
    return;
  }
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'inline; filename="leadership.xlsx"');
  res.send(buffer);
});

// GET /workbook/exists — lightweight presence check.
router.get('/workbook/exists', (_req: Request, res: Response): void => {
  res.status(200).json({ exists: workbookStore.hasWorkbook() });
});

// POST /workbook — validate + persist an uploaded workbook (field 'file').
router.post(
  '/workbook',
  upload.single('file'),
  (req: Request, res: Response): void => {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }
    const result = workbookStore.saveWorkbook(req.file.buffer);
    if (result.ok) {
      res.status(200).json({ ok: true });
      return;
    }
    res.status(400).json({ ok: false, error: result.error });
  }
);

export default router;
