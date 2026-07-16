import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { AdminRepository } from '../repositories/admin.repository';
import {
  createEntrySchema,
  updateEntrySchema,
  paginationSchema,
} from '../validators/admin.validators';
import { ZodError } from 'zod';

// We create an isolated Express app with an in-memory DB for testing
let db: Database.Database;
let app: express.Express;

function createTestApp(testDb: Database.Database): express.Express {
  const testApp = express();
  testApp.use(express.json());

  const adminRepo = new AdminRepository(testDb);

  const router = Router();

  function mapZodErrors(error: any): Array<{ field: string; message: string }> {
    return error.errors.map((issue: any) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  }

  router.get('/analytics', (req: any, res: any, next: any) => {
    try {
      const analytics = adminRepo.getAnalytics();
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  });

  router.get('/teams', (req: any, res: any, next: any) => {
    try {
      const search = req.query.search as string | undefined;
      const portfolio = req.query.portfolio as string | undefined;
      const teams = adminRepo.getTeams(search, portfolio);
      res.json({ teams });
    } catch (error) {
      next(error);
    }
  });

  router.get('/teams/:teamName', (req: any, res: any, next: any) => {
    try {
      const { teamName } = req.params;
      const teamDetail = adminRepo.getTeamDetail(teamName);
      if (!teamDetail) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      res.json(teamDetail);
    } catch (error) {
      next(error);
    }
  });

  router.get('/entries', (req: any, res: any, next: any) => {
    try {
      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: mapZodErrors(parsed.error),
        });
        return;
      }
      const { limit, offset, sort } = parsed.data;
      const result = adminRepo.getEntries(limit, offset, sort);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/entries', (req: any, res: any, next: any) => {
    try {
      const parsed = createEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: mapZodErrors(parsed.error),
        });
        return;
      }
      const entry = adminRepo.createEntry(parsed.data);
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  });

  router.put('/entries/:id', (req: any, res: any, next: any) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'id', message: 'id must be a valid number' }],
        });
        return;
      }
      const parsed = updateEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: mapZodErrors(parsed.error),
        });
        return;
      }
      const updated = adminRepo.updateEntry(id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'Entry not found' });
        return;
      }
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/entries/:id', (req: any, res: any, next: any) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'id', message: 'id must be a valid number' }],
        });
        return;
      }
      const deleted = adminRepo.deleteEntry(id);
      if (!deleted) {
        res.status(404).json({ error: 'Entry not found' });
        return;
      }
      res.json({ success: true, id });
    } catch (error) {
      next(error);
    }
  });

  testApp.use('/api/admin', router);
  return testApp;
}

function setupSchema(testDb: Database.Database): void {
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      rows_ingested INTEGER NOT NULL DEFAULT 0,
      status TEXT CHECK(status IN ('processing', 'success', 'failed')) DEFAULT 'processing',
      error_message TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sprint_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL REFERENCES uploads(id),
      sno INTEGER,
      team TEXT NOT NULL,
      track TEXT NOT NULL,
      project TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      status TEXT,
      items_list TEXT,
      walkthrough_given_on TEXT,
      jira_id TEXT NOT NULL,
      estimated_effort_with_ai REAL,
      estimated_effort_without_ai REAL,
      actual_effort_with_ai REAL,
      ai_used TEXT CHECK(ai_used IN ('Y', 'N')),
      dev_start_date TEXT,
      dev_end_date TEXT,
      development_status TEXT,
      uat_delivery_date TEXT,
      uat_delivery_target TEXT,
      resources TEXT,
      go_live_planned_date TEXT,
      go_live_date TEXT,
      production_status TEXT,
      rollback TEXT CHECK(rollback IN ('Y', 'N')),
      rollback_reason TEXT,
      story_drop_reason TEXT,
      ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

function seedTestData(testDb: Database.Database): void {
  // Create the admin-created upload record
  testDb.prepare(
    `INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status, uploaded_at)
     VALUES ('upload-1', 'test.xlsx', 'admin', 3, 'success', datetime('now'))`
  ).run();

  // Seed sprint data
  const insertStmt = testDb.prepare(`
    INSERT INTO sprint_data (upload_id, sno, team, track, project, portfolio, jira_id, development_status, ingested_at)
    VALUES (@uploadId, @sno, @team, @track, @project, @portfolio, @jiraId, @developmentStatus, @ingestedAt)
  `);

  insertStmt.run({
    uploadId: 'upload-1', sno: 1, team: 'Team Alpha', track: 'Track A',
    project: 'Project X', portfolio: 'Portfolio 1', jiraId: 'JIRA-001',
    developmentStatus: 'Done', ingestedAt: new Date().toISOString(),
  });
  insertStmt.run({
    uploadId: 'upload-1', sno: 2, team: 'Team Alpha', track: 'Track A',
    project: 'Project Y', portfolio: 'Portfolio 1', jiraId: 'JIRA-002',
    developmentStatus: null, ingestedAt: new Date().toISOString(),
  });
  insertStmt.run({
    uploadId: 'upload-1', sno: 3, team: 'Team Beta', track: 'Track B',
    project: 'Project Z', portfolio: 'Portfolio 2', jiraId: 'JIRA-003',
    developmentStatus: '', ingestedAt: new Date().toISOString(),
  });
}

beforeAll(() => {
  db = new Database(':memory:');
  setupSchema(db);
  seedTestData(db);
  app = createTestApp(db);
});

afterAll(() => {
  db.close();
});

describe('Admin Routes', () => {
  describe('GET /api/admin/analytics', () => {
    it('should return analytics summary', async () => {
      const res = await request(app).get('/api/admin/analytics');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalTeams');
      expect(res.body).toHaveProperty('totalEntries');
      expect(res.body).toHaveProperty('recentUploads');
      expect(res.body).toHaveProperty('pendingItems');
      expect(res.body.totalTeams).toBe(2); // Team Alpha, Team Beta
      expect(res.body.totalEntries).toBe(3);
      expect(res.body.recentUploads).toBe(1);
      expect(res.body.pendingItems).toBe(2); // null and empty development_status
    });
  });

  describe('GET /api/admin/teams', () => {
    it('should return all teams', async () => {
      const res = await request(app).get('/api/admin/teams');

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(2);
      expect(res.body.teams[0]).toHaveProperty('team');
      expect(res.body.teams[0]).toHaveProperty('portfolio');
      expect(res.body.teams[0]).toHaveProperty('entryCount');
    });

    it('should filter teams by search query', async () => {
      const res = await request(app).get('/api/admin/teams?search=Alpha');

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(1);
      expect(res.body.teams[0].team).toBe('Team Alpha');
    });

    it('should filter teams by portfolio', async () => {
      const res = await request(app).get('/api/admin/teams?portfolio=Portfolio 2');

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(1);
      expect(res.body.teams[0].team).toBe('Team Beta');
    });

    it('should return empty array when no teams match', async () => {
      const res = await request(app).get('/api/admin/teams?search=NonExistent');

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(0);
    });
  });

  describe('GET /api/admin/teams/:teamName', () => {
    it('should return team detail for existing team', async () => {
      const res = await request(app).get('/api/admin/teams/Team Alpha');

      expect(res.status).toBe(200);
      expect(res.body.team).toBe('Team Alpha');
      expect(res.body.portfolio).toBe('Portfolio 1');
      expect(res.body.totalEntries).toBe(2);
      expect(res.body.distinctProjects).toBe(2);
      expect(res.body.entries).toHaveLength(2);
    });

    it('should return 404 for non-existent team', async () => {
      const res = await request(app).get('/api/admin/teams/NonExistentTeam');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Team not found' });
    });
  });

  describe('GET /api/admin/entries', () => {
    it('should return paginated entries with defaults', async () => {
      const res = await request(app).get('/api/admin/entries');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entries');
      expect(res.body).toHaveProperty('total', 3);
      expect(res.body).toHaveProperty('limit', 25);
      expect(res.body).toHaveProperty('offset', 0);
      expect(res.body.entries).toHaveLength(3);
    });

    it('should respect limit and offset params', async () => {
      const res = await request(app).get('/api/admin/entries?limit=1&offset=1');

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.total).toBe(3);
      expect(res.body.limit).toBe(1);
      expect(res.body.offset).toBe(1);
    });

    it('should return 400 for invalid pagination params', async () => {
      const res = await request(app).get('/api/admin/entries?limit=-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeInstanceOf(Array);
      expect(res.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/admin/entries', () => {
    it('should create a new entry with valid data', async () => {
      const payload = {
        team: 'Team Gamma',
        track: 'Track C',
        project: 'Project W',
        portfolio: 'Portfolio 3',
        jiraId: 'JIRA-100',
      };

      const res = await request(app).post('/api/admin/entries').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.team).toBe('Team Gamma');
      expect(res.body.track).toBe('Track C');
      expect(res.body.project).toBe('Project W');
      expect(res.body.portfolio).toBe('Portfolio 3');
      expect(res.body.jiraId).toBe('JIRA-100');
      expect(res.body.id).toBeDefined();
    });

    it('should return 400 when required fields are missing', async () => {
      const payload = {
        team: 'Team Gamma',
        // missing track, project, portfolio, jiraId
      };

      const res = await request(app).post('/api/admin/entries').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeInstanceOf(Array);
      expect(res.body.details.length).toBeGreaterThan(0);
      // Should have field-level errors
      const fields = res.body.details.map((d: any) => d.field);
      expect(fields).toContain('track');
      expect(fields).toContain('project');
      expect(fields).toContain('portfolio');
      expect(fields).toContain('jiraId');
    });

    it('should return 400 when required fields are empty strings', async () => {
      const payload = {
        team: '',
        track: '',
        project: '',
        portfolio: '',
        jiraId: '',
      };

      const res = await request(app).post('/api/admin/entries').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /api/admin/entries/:id', () => {
    it('should update an existing entry', async () => {
      // First, create an entry
      const createRes = await request(app).post('/api/admin/entries').send({
        team: 'Update Test Team',
        track: 'Track X',
        project: 'Project U',
        portfolio: 'Portfolio U',
        jiraId: 'JIRA-UPDATE-TEST',
      });
      const entryId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/entries/${entryId}`)
        .send({ team: 'Updated Team Name' });

      expect(res.status).toBe(200);
      expect(res.body.team).toBe('Updated Team Name');
      expect(res.body.id).toBe(entryId);
    });

    it('should return 404 for non-existent entry', async () => {
      const res = await request(app)
        .put('/api/admin/entries/99999')
        .send({ team: 'Ghost Team' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Entry not found' });
    });

    it('should return 400 for invalid id', async () => {
      const res = await request(app)
        .put('/api/admin/entries/abc')
        .send({ team: 'Invalid ID' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('id');
    });

    it('should return 400 for invalid field values', async () => {
      // Create an entry first
      const createRes = await request(app).post('/api/admin/entries').send({
        team: 'Validation Test',
        track: 'Track V',
        project: 'Project V',
        portfolio: 'Portfolio V',
        jiraId: 'JIRA-VAL-TEST',
      });
      const entryId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/entries/${entryId}`)
        .send({ aiUsed: 'INVALID' }); // aiUsed must be 'Y' or 'N'

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeInstanceOf(Array);
    });
  });

  describe('DELETE /api/admin/entries/:id', () => {
    it('should delete an existing entry', async () => {
      // First, create an entry
      const createRes = await request(app).post('/api/admin/entries').send({
        team: 'Delete Test Team',
        track: 'Track D',
        project: 'Project D',
        portfolio: 'Portfolio D',
        jiraId: 'JIRA-DELETE-TEST',
      });
      const entryId = createRes.body.id;

      const res = await request(app).delete(`/api/admin/entries/${entryId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, id: entryId });
    });

    it('should return 404 for non-existent entry', async () => {
      const res = await request(app).delete('/api/admin/entries/99999');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Entry not found' });
    });

    it('should return 400 for invalid id', async () => {
      const res = await request(app).delete('/api/admin/entries/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('id');
    });
  });
});
