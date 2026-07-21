import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  fetchServerWorkbook,
  uploadServerWorkbook,
} from '../services/workbook-store';

/**
 * Build a minimal Response-like object for stubbing global fetch. Only the
 * members used by workbook-store are implemented.
 */
function makeResponse(init: {
  ok: boolean;
  status?: number;
  arrayBuffer?: ArrayBuffer;
  json?: unknown;
}): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 400),
    arrayBuffer: async () => init.arrayBuffer ?? new ArrayBuffer(0),
    json: async () => {
      if (init.json === undefined) throw new Error('no json');
      return init.json;
    },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchServerWorkbook', () => {
  it('returns an ArrayBuffer on a 200 response', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ ok: true, arrayBuffer: bytes }))
    );

    const result = await fetchServerWorkbook();
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect((result as ArrayBuffer).byteLength).toBe(4);
  });

  it('returns null on a 404 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ ok: false, status: 404 }))
    );

    const result = await fetchServerWorkbook();
    expect(result).toBeNull();
  });

  it('returns null when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    const result = await fetchServerWorkbook();
    expect(result).toBeNull();
  });
});

describe('uploadServerWorkbook', () => {
  it('returns { ok: true } on an ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => makeResponse({ ok: true, json: { ok: true } }))
    );

    const result = await uploadServerWorkbook(new ArrayBuffer(8));
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false, error } on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeResponse({
          ok: false,
          status: 400,
          json: { error: 'The file is not a valid Excel workbook.' },
        })
      )
    );

    const result = await uploadServerWorkbook(new ArrayBuffer(8));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('The file is not a valid Excel workbook.');
    }
  });

  it('returns { ok: false } when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    const result = await uploadServerWorkbook(new ArrayBuffer(8));
    expect(result.ok).toBe(false);
  });
});
