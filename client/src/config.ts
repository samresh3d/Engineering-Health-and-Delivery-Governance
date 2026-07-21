/**
 * Base URL for API requests.
 *
 * Resolution rules (so the app is correct both locally and when hosted, e.g.
 * on Render, where the Express server serves the built client from the same
 * origin):
 *
 * - Local development: `VITE_API_URL` (from `.env`) points to the local Express
 *   server, e.g. `http://localhost:3000`, and the app runs on `localhost`.
 * - Production / hosted: `.env.production` sets `VITE_API_URL` to an empty
 *   string, so requests use relative, same-origin URLs (the current domain).
 * - Safety net: if `VITE_API_URL` points at `localhost`/`127.0.0.1` but the page
 *   is NOT being served from localhost (i.e. it's deployed), the localhost base
 *   is IGNORED and same-origin relative URLs are used instead. This prevents a
 *   stray/hardcoded `http://localhost:3000` from leaking into a hosted build.
 *
 * Always build request URLs as `${API_BASE_URL}/api/...`. When the base is
 * empty the leading slash keeps the path root-relative (same-origin).
 */

/** True when `host` is a loopback/localhost hostname. */
function isLocalhostHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]'
  );
}

/** True when a URL string points at a localhost/loopback origin. */
function pointsToLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(\/|$)/i.test(url);
}

/**
 * Resolve the API base URL, applying the same-origin / anti-localhost-leak
 * rules described above.
 */
export function resolveApiBaseUrl(): string {
  const configured = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim();
  if (configured === '') return '';

  try {
    const host =
      typeof window !== 'undefined' && window.location
        ? window.location.hostname
        : '';
    // Deployed page + localhost-pointing base → ignore it, use same-origin.
    if (pointsToLocalhost(configured) && !isLocalhostHost(host)) {
      return '';
    }
  } catch {
    // If anything goes wrong reading location, fall back to the configured value.
  }

  return configured;
}

export const API_BASE_URL = resolveApiBaseUrl();
