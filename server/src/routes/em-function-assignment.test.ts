import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';

let db: Database.Database;
let app: express.Express;

function createTestApp(testDb: Database.Database): express.Express {
  const testApp = express();
  testApp.use(express.json());

  const router = Router();

  /**
   * PUT /users/:id/function
   * Assigns an Engineering Manager to a Function.
   */
  router.put('/users/:id/function', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const userId = req.params.id;
      const { functionId } = req.body;

      // Validate functionId is provided and is a number
      if (functionId === undefined || functionId === null || typeof functionId !== 'number') {
        res.status(400).json({
          error: 'Validation failed',
          details: [{ field: 'functionId', message: 'functionId is required and must be a number' }],
        });
        return;
      }

      // Verify the target user exists and has Engineering_Manager role
      const userRow = testDb.prepare('SELECT id, username, role, function_id FROM users WHERE id = ?').get(userId) as
        | { id: string; username: string; role: string; function_id: number | null }
        | undefined;

      if (!userRow || userRow.role !== 'Engineering_Manager') {
        res.status(400).json({ error: 'user is invalid' });
        return;
      }

      // Verify the target function exists in the Function_Registry
      const functionRow = testDb.prepare('SELECT id, name FROM functions WHERE id = ?').get(functionId) as
        | { id: number; name: string }
        | undefined;

      if (!functionRow) {
        res.status(400).json({ error: 'Function is invalid' });
        return;
      }

      // Update the user's function assignment
      testDb.prepare('UPDATE users SET function_id = ? WHERE id = ?').run(functionId, userId);

      res.status(200).json({
        success: true,
        userId: userRow.id,
        username: userRow.username,
        role: userRow.role,
        functionId: functionRow.id,
        functionName: functionRow.name,
      });
    } catch (error) {
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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      team_id TEXT,
      function_id INTEGER REFERENCES functions(id)
    );
  `);
}

function seedTestData(testDb: Database.Database): void {
  // Seed functions
  testDb.prepare("INSERT INTO functions (name) VALUES ('E-Com')").run();
  testDb.prepare("INSERT INTO functions (name) VALUES ('MPro')").run();
  testDb.prepare("INSERT INTO functions (name) VALUES ('Dolphin')").run();

  // Seed users
  testDb.prepare(
    "INSERT INTO users (id, username, role, team_id, function_id) VALUES ('em-1', 'eng_manager_1', 'Engineering_Manager', 'team-a', NULL)"
  ).run();
  testDb.prepare(
    "INSERT INTO users (id, username, role, team_id, function_id) VALUES ('em-2', 'eng_manager_2', 'Engineering_Manager', 'team-b', 1)"
  ).run();
  testDb.prepare(
    "INSERT INTO users (id, username, role, team_id, function_id) VALUES ('admin-1', 'super_admin', 'Super_Admin', NULL, NULL)"
  ).run();
  testDb.prepare(
    "INSERT INTO users (id, username, role, team_id, function_id) VALUES ('lead-1', 'leader', 'Leadership', NULL, NULL)"
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

describe('PUT /api/admin/users/:id/function - EM Function Assignment', () => {
  describe('Successful assignment', () => {
    it('should assign an EM to a function when both user and function are valid', async () => {
      const res = await request(app)
        .put('/api/admin/users/em-1/function')
        .send({ functionId: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        userId: 'em-1',
        username: 'eng_manager_1',
        role: 'Engineering_Manager',
        functionId: 1,
        functionName: 'E-Com',
      });

      // Verify the DB was updated
      const userRow = db.prepare('SELECT function_id FROM users WHERE id = ?').get('em-1') as { function_id: number };
      expect(userRow.function_id).toBe(1);
    });

    it('should reassign an EM to a different function', async () => {
      const res = await request(app)
        .put('/api/admin/users/em-2/function')
        .send({ functionId: 2 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.functionId).toBe(2);
      expect(res.body.functionName).toBe('MPro');

      // Verify the DB was updated
      const userRow = db.prepare('SELECT function_id FROM users WHERE id = ?').get('em-2') as { function_id: number };
      expect(userRow.function_id).toBe(2);
    });

    it('should take effect immediately (function_id persisted in DB)', async () => {
      // Assign EM to Dolphin
      await request(app)
        .put('/api/admin/users/em-1/function')
        .send({ functionId: 3 });

      // Immediately verify
      const userRow = db.prepare('SELECT function_id FROM users WHERE id = ?').get('em-1') as { function_id: number };
      expect(userRow.function_id).toBe(3);
    });
  });

  describe('Validation: non-existent function (Req 8.4)', () => {
    it('should reject assignment to a non-existent function with "Function is invalid"', async () => {
      const res = await request(app)
        .put('/api/admin/users/em-1/function')
        .send({ functionId: 999 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Function is invalid');
    });
  });

  describe('Validation: non-EM user (Req 8.5)', () => {
    it('should reject assignment to a non-existent user with "user is invalid"', async () => {
      const res = await request(app)
        .put('/api/admin/users/non-existent/function')
        .send({ functionId: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('user is invalid');
    });

    it('should reject assignment to a Super_Admin user with "user is invalid"', async () => {
      const res = await request(app)
        .put('/api/admin/users/admin-1/function')
        .send({ functionId: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('user is invalid');
    });

    it('should reject assignment to a Leadership user with "user is invalid"', async () => {
      const res = await request(app)
        .put('/api/admin/users/lead-1/function')
        .send({ functionId: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('user is invalid');
    });
  });

  describe('Validation: invalid request body', () => {
    it('should reject when functionId is missing', async () => {
      const res = await request(app)
        .put('/api/admin/users/em-1/function')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('functionId');
    });

    it('should reject when functionId is a string', async () => {
      const res = await request(app)
        .put('/api/admin/users/em-1/function')
        .send({ functionId: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('functionId');
    });

    it('should reject when functionId is null', async () => {
      const res = await request(app)
        .put('/api/admin/users/em-1/function')
        .send({ functionId: null });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details[0].field).toBe('functionId');
    });
  });

  describe('Single function constraint (Req 8.6)', () => {
    it('should overwrite previous function assignment (only one function at a time)', async () => {
      // First assign to E-Com
      await request(app)
        .put('/api/admin/users/em-1/function')
        .send({ functionId: 1 });

      let userRow = db.prepare('SELECT function_id FROM users WHERE id = ?').get('em-1') as { function_id: number };
      expect(userRow.function_id).toBe(1);

      // Now assign to MPro — should replace, not add
      await request(app)
        .put('/api/admin/users/em-1/function')
        .send({ functionId: 2 });

      userRow = db.prepare('SELECT function_id FROM users WHERE id = ?').get('em-1') as { function_id: number };
      expect(userRow.function_id).toBe(2);
    });
  });
});
