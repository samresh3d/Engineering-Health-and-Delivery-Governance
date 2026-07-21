/**
 * workbook-store — self-contained client for the server's leadership workbook
 * file-store endpoints.
 *
 * This service is intentionally isolated from the rest of the app: it uses the
 * global `fetch` directly rather than the shared axios client, so the
 * `/leadership` module stays self-contained and portable.
 *
 * Both functions are crash-proof: any thrown error (including a missing global
 * `fetch` in non-browser test environments) is caught and mapped to a safe
 * result, so callers never have to guard against exceptions.
 */

/** MIME type for a modern Excel (.xlsx) workbook. */
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** True when a URL string points at a localhost/loopback origin. */
function pointsToLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(\/|$)/i.test(url);
}

/**
 * Resolve the API base URL at request time (empty string ⇒ same-origin).
 *
 * - Local development: `VITE_API_URL` points to the local server (e.g.
 *   `http://localhost:3000`) and the page runs on localhost.
 * - Hosted (e.g. Render): `VITE_API_URL` is empty, so calls are same-origin
 *   (the deployment's own domain).
 * - Safety net: if `VITE_API_URL` points at localhost but the page is NOT served
 *   from localhost, the localhost base is ignored and same-origin URLs are used,
 *   so a stray `http://localhost:3000` can never leak into a hosted build.
 *
 * Kept inline (rather than importing the app's shared `config`) so the
 * `/leadership` module stays self-contained.
 */
function apiBase(): string {
  const configured = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim();
  if (configured === '') return '';
  try {
    const host =
      typeof window !== 'undefined' && window.location ? window.location.hostname : '';
    const runningLocal =
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    if (pointsToLocalhost(configured) && !runningLocal) return '';
  } catch {
    // Fall through to the configured value if location can't be read.
  }
  return configured;
}

/**
 * Fetch the persisted workbook from the server.
 *
 * @returns the workbook bytes as an `ArrayBuffer` when present, or `null` when
 * no workbook exists (404) or when anything goes wrong (network error, missing
 * `fetch`, etc.). Never throws.
 */
export async function fetchServerWorkbook(): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(`${apiBase()}/api/leadership/workbook`);
    if (response.ok) {
      return await response.arrayBuffer();
    }
    // 404 (no workbook) or any other non-OK status → treat as "no workbook".
    return null;
  } catch {
    return null;
  }
}

/**
 * Upload a workbook to the server, replacing the single-source-of-truth file.
 *
 * @param buffer the workbook bytes to persist.
 * @param filename the filename to send (defaults to `leadership.xlsx`).
 * @returns `{ ok: true }` on success, or `{ ok: false, error }` describing the
 * failure. Never throws.
 */
export async function uploadServerWorkbook(
  buffer: ArrayBuffer,
  filename = 'leadership.xlsx'
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: XLSX_MIME });
    formData.append('file', blob, filename);

    const response = await fetch(`${apiBase()}/api/leadership/workbook`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      return { ok: true };
    }

    // Try to surface the server's error message when available.
    let message = 'Failed to upload the workbook to the server.';
    try {
      const body = (await response.json()) as { error?: string } | null;
      if (body && typeof body.error === 'string' && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      // Ignore JSON parse failures; keep the default message.
    }
    return { ok: false, error: message };
  } catch {
    return {
      ok: false,
      error: 'Failed to upload the workbook to the server.',
    };
  }
}
