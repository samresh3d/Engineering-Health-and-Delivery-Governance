import { Request, Response, NextFunction } from 'express';

/**
 * Request middleware: maps incoming "division" parameters to "track" (the database column name).
 * Applied selectively on governance and analytics routes so that the API accepts "division"
 * while the underlying data layer continues to use the "track" column.
 *
 * Maps:
 * - req.query.division → req.query.track
 * - req.body.division → req.body.track
 */
export function divisionRequestMapper(req: Request, _res: Response, next: NextFunction): void {
  // Map query.division → query.track
  if (req.query.division) {
    req.query.track = req.query.division;
    delete req.query.division;
  }

  // Map body.division → body.track
  if (req.body?.division) {
    req.body.track = req.body.division;
    delete req.body.division;
  }

  next();
}

/**
 * Response utility: recursively renames "track" → "division" in response payloads.
 * Handles nested objects and arrays to ensure all occurrences of the "track" field
 * are presented as "division" to API consumers.
 *
 * @param data - The response payload to transform
 * @returns The transformed payload with "track" fields renamed to "division"
 */
export function divisionResponseMapper(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(divisionResponseMapper);
  }

  if (data !== null && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const newKey = key === 'track' ? 'division' : key;
      result[newKey] = divisionResponseMapper(value);
    }
    return result;
  }

  return data;
}
