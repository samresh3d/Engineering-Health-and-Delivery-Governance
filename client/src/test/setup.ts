import '@testing-library/jest-dom';
import { vi } from 'vitest';

/**
 * Hermetic default for `fetch` in the test environment.
 *
 * Some components call the network on mount — notably the Leadership provider,
 * which fetches the server-persisted `leadership.xlsx`. Unit tests must NOT
 * depend on a live dev server being reachable; otherwise a running
 * `localhost:3000` would leak real data into tests and make them flaky.
 *
 * This installs a one-time, top-level default that resolves to a 404-like
 * response, so those mount-time calls behave as "nothing on the server" and
 * components fall back to their local/in-memory paths. It is set at module load
 * (once per test file, before any test-level hooks), so tests that manage their
 * own `fetch` — e.g. `globalThis.fetch = vi.fn()` in a `beforeEach`, or
 * `vi.stubGlobal('fetch', ...)` — always override this default.
 */
const notFoundResponse = () =>
  ({
    ok: false,
    status: 404,
    json: async () => ({ error: 'not found (test stub)' }),
    text: async () => 'not found (test stub)',
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as unknown as Response;

globalThis.fetch = vi.fn(async () => notFoundResponse()) as unknown as typeof fetch;
