import multer from 'multer';

/**
 * Multer configuration for file uploads.
 * Uses memory storage (buffer) with a 10 MB file size limit.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});
