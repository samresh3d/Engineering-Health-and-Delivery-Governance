import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import * as XLSX from 'xlsx';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Use a fresh temp dir for the workbook store so tests never touch real data.
// The service reads LEADERSHIP_UPLOAD_DIR lazily on each call, so setting it
// before importing the router/service still takes effect.
const TEMP_DIR = path.join(os.tmpdir(), 'ldr-test-' + Date.now());
process.env.LEADERSHIP_UPLOAD_DIR = TEMP_DIR;

// Import AFTER setting the env var. The router only depends on the workbook
// service (no DB), so we mount it on an isolated public app — mirroring how the
// route is mounted publicly (before RBAC) in the real app.
import leadershipRoutes from './leadership.routes';

let app: express.Express;

/** Build a valid .xlsx workbook buffer containing a KPIs sheet. */
function validWorkbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Team', 'KPI', 'Value'],
    ['Team Alpha', 'Velocity', 42],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'KPIs');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/leadership', leadershipRoutes);
});

afterAll(() => {
  // Clean up the temp dir and any files inside it.
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('Leadership workbook routes', () => {
  it('GET /api/leadership/workbook returns 404 when nothing is uploaded', async () => {
    const res = await request(app).get('/api/leadership/workbook');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/leadership/workbook accepts a valid workbook', async () => {
    const res = await request(app)
      .post('/api/leadership/workbook')
      .attach('file', validWorkbookBuffer(), 'leadership.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /api/leadership/workbook returns the persisted workbook', async () => {
    const res = await request(app)
      .get('/api/leadership/workbook')
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('GET /api/leadership/workbook/exists reports true once uploaded', async () => {
    const res = await request(app).get('/api/leadership/workbook/exists');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true });
  });

  it('POST /api/leadership/workbook rejects an invalid workbook', async () => {
    const res = await request(app)
      .post('/api/leadership/workbook')
      .attach('file', Buffer.from('not excel'), 'bad.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body).toHaveProperty('error');
  });
});
