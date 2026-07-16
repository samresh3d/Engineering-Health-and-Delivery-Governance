import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { TeamRepository } from '../repositories/team.repository';
import { FunctionRepository } from '../repositories/function.repository';
import { createTeamSchema, renameTeamSchema } from '../validators/team.validators';
import { ZodError } from 'zod';

let db: Database.Database;
let app: express.Express;

function mapZodErrors(error: any): Array<{ field: string; message: string }> {
  return error.errors.map((issue: any) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

function createTestApp(testDb: Database.Database): express.Express {
  const testApp = express();
  testApp.use(express.json());

  const teamRepo = new TeamRepository(testDb);
  const functionRepo = new FunctionRepository(testDb);

  const router = Router();

  // GET /functions/:functionId/teams
  router.get('/functions/:functionId/teams', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const functionId = Number(req.params.functionId);
      if (isNaN(functionId)) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'functionId', message: 'functionId must be a valid number' }],
        });
        return;
      }

      const func = functionRepo.getById(functionId);
      if (!func) {
        res.status(404).json({ error: 'Function not found' });
        return;
      }

      const teams = teamRepo.getByFunction(functionId);
      res.json({ teams });
    } catch (error) {
      next(error);
    }
  });

  // POST /functions/:functionId/teams
  router.post('/functions/:functionId/teams', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const functionId = Number(req.params.functionId);
      if (isNaN(functionId)) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'functionId', message: 'functionId must be a valid number' }],
        });
        return;
      }

      const parsed = createTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: mapZodErrors(parsed.error),
        });
        return;
      }

      const { name } = parsed.data;
      const team = teamRepo.create(name, functionId);
      res.status(201).json(team);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'Parent Function does not exist') {
          res.status(404).json({ error: 'Parent Function does not exist' });
          return;
        }
        if (error.message === 'A Team with this name already exists in this Function') {
          res.status(409).json({ error: 'A Team with this name already exists in this Function' });
          return;
        }
        if (error.message === 'Team name must not be empty or whitespace-only' ||
            error.message === 'Team name must not exceed 100 characters') {
          res.status(400).json({
            error: 'Validation failed',
            details: [{ field: 'name', message: error.message }],
          });
          return;
        }
      }
      next(error);
    }
  });

  // PUT /teams/:id
  router.put('/teams/:id', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'id', message: 'id must be a valid number' }],
        });
        return;
      }

      const parsed = renameTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: mapZodErrors(parsed.error),
        });
        return;
      }

      const { name } = parsed.data;
      const team = teamRepo.rename(id, name);
      res.json(team);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'Team not found') {
          res.status(404).json({ error: 'Team not found' });
          return;
        }
        if (error.message === 'A Team with this name already exists in this Function') {
          res.status(409).json({ error: 'A Team with this name already exists in this Function' });
          return;
        }
        if (error.message === 'Team name must not be empty or whitespace-only' ||
            error.message === 'Team name must not exceed 100 characters') {
          res.status(400).json({
            error: 'Validation failed',
            details: [{ field: 'name', message: error.message }],
          });
          return;
        }
      }
      next(error);
    }
  });

  // DELETE /teams/:id
  router.delete('/teams/:id', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'id', message: 'id must be a valid number' }],
        });
        return;
      }

      teamRepo.delete(id);
      res.json({ success: true, id });
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'Team not found') {
          res.status(404).json({ error: 'Team not found' });
          return;
        }
        if (error.message === 'Cannot delete: Team has associated sprint data entries') {
          res.status(409).json({ error: 'Cannot delete: Team has associated sprint data entries' });
          return;
        }
      }
      next(error);
    }
  });

  testApp.use('/api/admin', router);
  return testApp;
}

function setupSchema(testDb: Database.Database): void {
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS functions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      function_id INTEGER NOT NULL REFERENCES functions(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(name, function_id)
    );

    CREATE TABLE IF NOT EXISTS sprint_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team TEXT NOT NULL,
      function_name TEXT NOT NULL DEFAULT 'Unassigned',
      jira_id TEXT,
      ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

function seedTestData(testDb: Database.Database): void {
  // Seed functions
  testDb.prepare(`INSERT INTO functions (name) VALUES ('E-Com')`).run();
  testDb.prepare(`INSERT INTO functions (name) VALUES ('MPro')`).run();

  // Seed teams
  testDb.prepare(`INSERT INTO teams (name, function_id) VALUES ('Team Alpha', 1)`).run();
  testDb.prepare(`INSERT INTO teams (name, function_id) VALUES ('Team Beta', 1)`).run();
  testDb.prepare(`INSERT INTO teams (name, function_id) VALUES ('Team Gamma', 2)`).run();

  // Seed sprint data for Team Alpha under E-Com
  testDb.prepare(
    `INSERT INTO sprint_data (team, function_name, jira_id) VALUES ('Team Alpha', 'E-Com', 'JIRA-001')`
  ).run();
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

describe('Team Routes', () => {
  describe('GET /api/admin/functions/:functionId/teams', () => {
    it('should return teams for a valid function', async () => {
      const res = await request(app).get('/api/admin/functions/1/teams');

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(2);
      expect(res.body.teams[0]).toHaveProperty('id');
      expect(res.body.teams[0]).toHaveProperty('name');
      expect(res.body.teams[0]).toHaveProperty('functionId');
      expect(res.body.teams[0]).toHaveProperty('createdAt');
    });

    it('should return empty array for function with no teams', async () => {
      // Create a function with no teams
      db.prepare(`INSERT INTO functions (name) VALUES ('EmptyFunc')`).run();
      const row = db.prepare(`SELECT id FROM functions WHERE name = 'EmptyFunc'`).get() as { id: number };

      const res = await request(app).get(`/api/admin/functions/${row.id}/teams`);

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(0);
    });

    it('should return 404 for non-existent function', async () => {
      const res = await request(app).get('/api/admin/functions/9999/teams');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Function not found' });
    });

    it('should return 400 for invalid functionId', async () => {
      const res = await request(app).get('/api/admin/functions/abc/teams');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('functionId');
    });
  });

  describe('POST /api/admin/functions/:functionId/teams', () => {
    it('should create a team with valid data', async () => {
      const res = await request(app)
        .post('/api/admin/functions/2/teams')
        .send({ name: 'New Team' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('New Team');
      expect(res.body.functionId).toBe(2);
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
    });

    it('should trim whitespace from team name', async () => {
      const res = await request(app)
        .post('/api/admin/functions/2/teams')
        .send({ name: '  Trimmed Team  ' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Trimmed Team');
    });

    it('should return 404 for non-existent parent function', async () => {
      const res = await request(app)
        .post('/api/admin/functions/9999/teams')
        .send({ name: 'Orphan Team' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Parent Function does not exist' });
    });

    it('should return 409 for duplicate team name in same function', async () => {
      const res = await request(app)
        .post('/api/admin/functions/1/teams')
        .send({ name: 'Team Alpha' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'A Team with this name already exists in this Function' });
    });

    it('should allow same team name in different function', async () => {
      const res = await request(app)
        .post('/api/admin/functions/2/teams')
        .send({ name: 'Team Alpha' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Team Alpha');
      expect(res.body.functionId).toBe(2);
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/admin/functions/1/teams')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 when name is empty', async () => {
      const res = await request(app)
        .post('/api/admin/functions/1/teams')
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 when name is whitespace-only', async () => {
      const res = await request(app)
        .post('/api/admin/functions/1/teams')
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid functionId', async () => {
      const res = await request(app)
        .post('/api/admin/functions/abc/teams')
        .send({ name: 'Valid Team' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('functionId');
    });
  });

  describe('PUT /api/admin/teams/:id', () => {
    it('should rename a team', async () => {
      // Team Beta is id=2 in E-Com (function_id=1)
      const res = await request(app)
        .put('/api/admin/teams/2')
        .send({ name: 'Team Beta Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Team Beta Renamed');
      expect(res.body.id).toBe(2);
    });

    it('should return 404 for non-existent team', async () => {
      const res = await request(app)
        .put('/api/admin/teams/9999')
        .send({ name: 'Ghost Team' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Team not found' });
    });

    it('should return 409 for duplicate name in same function', async () => {
      const res = await request(app)
        .put('/api/admin/teams/2')
        .send({ name: 'Team Alpha' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'A Team with this name already exists in this Function' });
    });

    it('should return 400 for invalid id', async () => {
      const res = await request(app)
        .put('/api/admin/teams/abc')
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('id');
    });

    it('should return 400 for empty name', async () => {
      const res = await request(app)
        .put('/api/admin/teams/2')
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app)
        .put('/api/admin/teams/2')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('DELETE /api/admin/teams/:id', () => {
    it('should delete a team with no sprint data', async () => {
      // Team Gamma (id=3) under MPro has no sprint data
      const res = await request(app).delete('/api/admin/teams/3');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, id: 3 });
    });

    it('should return 409 when team has associated sprint data', async () => {
      // Team Alpha (id=1) has sprint data
      const res = await request(app).delete('/api/admin/teams/1');

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Cannot delete: Team has associated sprint data entries' });
    });

    it('should return 404 for non-existent team', async () => {
      const res = await request(app).delete('/api/admin/teams/9999');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Team not found' });
    });

    it('should return 400 for invalid id', async () => {
      const res = await request(app).delete('/api/admin/teams/abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('id');
    });
  });
});
