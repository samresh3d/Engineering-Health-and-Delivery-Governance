/**
 * Base URL for API requests.
 *
 * - In local development, `VITE_API_URL` (from `.env`) points to the local
 *   Express server, e.g. `http://localhost:3000`.
 * - In production, `.env.production` sets `VITE_API_URL` to an empty string so
 *   requests use relative, same-origin URLs (the Express server serves the
 *   built client from the same origin).
 *
 * Always build request URLs as `${API_BASE_URL}/api/...`. When the base is
 * empty the leading slash keeps the path root-relative.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
