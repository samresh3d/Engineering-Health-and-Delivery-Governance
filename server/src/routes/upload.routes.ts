import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/multer';
import { AuthenticatedRequest } from '../middleware/rbac';
import { UploadService, UploadValidationError } from '../services/upload.service';
import { SprintDataRepository } from '../repositories/sprint-data.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { UploadRepository } from '../repositories/upload.repository';

const router = Router();

/**
 * POST /api/upload
 * Accepts a multipart file upload (field name: 'file'), validates format/size/columns/rows,
 * processes the file through the upload service, and returns the result.
 *
 * Requires: Admin or Engineering_Manager role (enforced by RBAC middleware).
 *
 * Success: 200 { success: true, rowsIngested, uploadId, timestamp }
 * Validation error: 400 { success: false, errors: [...] }
 */
router.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          errors: [{ field: 'file', message: 'No file provided. Please upload an Excel file.' }],
        });
        return;
      }

      const buffer = req.file.buffer;
      const filename = req.file.originalname;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user.userId;

      // Create service with repository dependencies
      const sprintDataRepo = new SprintDataRepository();
      const configRepo = new ConfigRepository();
      const uploadRepo = new UploadRepository();

      const uploadService = new UploadService(sprintDataRepo, configRepo, uploadRepo);

      const result = await uploadService.processFile(buffer, filename, userId);

      res.status(200).json({
        success: true,
        rowsIngested: result.rowsIngested,
        uploadId: result.uploadId,
        timestamp: result.timestamp,
      });
    } catch (error) {
      if (error instanceof UploadValidationError) {
        res.status(400).json({
          success: false,
          errors: error.errors,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
