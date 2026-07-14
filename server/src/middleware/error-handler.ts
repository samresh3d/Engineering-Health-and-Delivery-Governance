import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { UploadValidationError } from '../services/upload.service';

/**
 * Global error handler middleware.
 * Handles known error types with appropriate status codes and secure error messages.
 *
 * - ZodError → 400 with field-level validation details
 * - UploadValidationError → 400 with the errors array from upload validation
 * - All other errors → 500 with generic message (no internal details leaked)
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof UploadValidationError) {
    res.status(400).json({
      success: false,
      errors: err.errors,
    });
    return;
  }

  console.error('[ERROR]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
};
