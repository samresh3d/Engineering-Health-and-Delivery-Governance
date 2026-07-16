import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DivisionService, DivisionError } from '../../services/division.service';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { AuditLoggerService } from '../../services/audit-logger.service';

function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE uploads (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      rows_ingested INTEGER NOT NULL DEFAULT 0,
      status TEXT CHECK(status IN ('processing', 'success', 'failed')) DEFAULT 'processing',
      error_message TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE sprint_data (
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
      ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(jira_id, team)
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT CHECK(action IN ('create', 'update', 'delete')) NOT NULL,
      record_id INTEGER NOT NULL,
      record_type TEXT NOT NULL DEFAULT 'sprint_data',
      team_id TEXT NOT NULL,
      modified_fields TEXT,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  return db;
}

function seedUpload(db: Database.Database, uploadId: string = 'upload-1'): void {
  db.prepare(`
    INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status)
    VALUES (@id, 'test.xlsx', 'user-1', 0, 'success')
  `).run({ id: uploadId });
}

function seedSprintData(
  db: Database.Database,
  team: string,
  track: string,
  project: string,
  jiraId: string,
  uploadId: string = 'upload-1'
): void {
  db.prepare(`
    INSERT INTO sprint_data (upload_id, team, track, project, portfolio, jira_id)
    VALUES (@uploadId, @team, @track, @project, 'Portfolio A', @jiraId)
  `).run({ uploadId, team, track, project, jiraId });
}

describe('DivisionService', () => {
  let db: Database.Database;
  let service: DivisionService;
  let auditLogger: AuditLoggerService;

  beforeEach(() => {
    db = createInMemoryDb();
    const auditRepo = new AuditLogRepository(db);
    auditLogger = new AuditLoggerService(auditRepo, db);
    service = new DivisionService(db, auditLogger);

    seedUpload(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('listByTeam', () => {
    it('should return empty array when team has no data', async () => {
      const result = await service.listByTeam('NonExistentTeam');
      expect(result).toEqual([]);
    });

    it('should return distinct divisions with project counts', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project B', 'JIRA-2');
      seedSprintData(db, 'Team Alpha', 'Frontend', 'Project C', 'JIRA-3');

      const result = await service.listByTeam('Team Alpha');
      expect(result).toHaveLength(2);

      const backend = result.find(d => d.name === 'Backend');
      const frontend = result.find(d => d.name === 'Frontend');

      expect(backend).toBeDefined();
      expect(backend!.projectCount).toBe(2);
      expect(backend!.teamId).toBe('Team Alpha');

      expect(frontend).toBeDefined();
      expect(frontend!.projectCount).toBe(1);
    });

    it('should only return divisions for the specified team', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Beta', 'Mobile', 'Project X', 'JIRA-2');

      const result = await service.listByTeam('Team Alpha');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Backend');
    });

    it('should return divisions ordered alphabetically', async () => {
      seedSprintData(db, 'Team Alpha', 'Zebra', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Alpha', 'Alpha', 'Project B', 'JIRA-2');
      seedSprintData(db, 'Team Alpha', 'Mid', 'Project C', 'JIRA-3');

      const result = await service.listByTeam('Team Alpha');
      expect(result.map(d => d.name)).toEqual(['Alpha', 'Mid', 'Zebra']);
    });
  });

  describe('create', () => {
    it('should create a new division and return it', async () => {
      const result = await service.create('Team Alpha', 'New Division', 'user-1');

      expect(result.name).toBe('New Division');
      expect(result.teamId).toBe('Team Alpha');
      expect(result.projectCount).toBe(0);
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should log division creation to audit log', async () => {
      await service.create('Team Alpha', 'New Division', 'user-1');

      const auditEntries = await auditLogger.query({ teamId: 'Team Alpha' });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].action).toBe('create');
      expect(auditEntries[0].userId).toBe('user-1');
      expect(auditEntries[0].teamId).toBe('Team Alpha');
    });

    it('should trim whitespace from division name', async () => {
      const result = await service.create('Team Alpha', '  Trimmed Name  ', 'user-1');
      expect(result.name).toBe('Trimmed Name');
    });

    it('should reject empty division name', async () => {
      await expect(service.create('Team Alpha', '', 'user-1'))
        .rejects.toThrow('Division name is required');
    });

    it('should reject whitespace-only division name', async () => {
      await expect(service.create('Team Alpha', '   ', 'user-1'))
        .rejects.toThrow('Division name is required');
    });

    it('should reject division name exceeding 100 characters', async () => {
      const longName = 'A'.repeat(101);
      await expect(service.create('Team Alpha', longName, 'user-1'))
        .rejects.toThrow('Division name must not exceed 100 characters');
    });

    it('should accept division name of exactly 100 characters', async () => {
      const maxName = 'A'.repeat(100);
      const result = await service.create('Team Alpha', maxName, 'user-1');
      expect(result.name).toBe(maxName);
    });

    it('should reject duplicate division name (case-insensitive)', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');

      await expect(service.create('Team Alpha', 'backend', 'user-1'))
        .rejects.toThrow('A division with this name already exists in the team');
    });

    it('should allow same division name in different teams', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');

      const result = await service.create('Team Beta', 'Backend', 'user-1');
      expect(result.name).toBe('Backend');
    });

    it('should throw DivisionError with correct status code', async () => {
      try {
        await service.create('Team Alpha', '', 'user-1');
      } catch (error) {
        expect(error).toBeInstanceOf(DivisionError);
        expect((error as DivisionError).statusCode).toBe(400);
      }
    });
  });

  describe('rename', () => {
    beforeEach(() => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project B', 'JIRA-2');
      seedSprintData(db, 'Team Alpha', 'Frontend', 'Project C', 'JIRA-3');
    });

    it('should rename division and update all rows', async () => {
      const result = await service.rename('Team Alpha', 'Backend', 'Server Side', 'user-1');

      expect(result.name).toBe('Server Side');
      expect(result.projectCount).toBe(2);

      // Verify the old track name no longer exists
      const oldRows = db.prepare(
        "SELECT COUNT(*) AS count FROM sprint_data WHERE team = 'Team Alpha' AND track = 'Backend'"
      ).get() as { count: number };
      expect(oldRows.count).toBe(0);

      // Verify all rows are now 'Server Side'
      const newRows = db.prepare(
        "SELECT COUNT(*) AS count FROM sprint_data WHERE team = 'Team Alpha' AND track = 'Server Side'"
      ).get() as { count: number };
      expect(newRows.count).toBe(2);
    });

    it('should log rename to audit log', async () => {
      await service.rename('Team Alpha', 'Backend', 'Server Side', 'user-1');

      const auditEntries = await auditLogger.query({ teamId: 'Team Alpha', action: 'update' });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].modifiedFields).toEqual(['track']);
    });

    it('should reject if old division does not exist', async () => {
      await expect(service.rename('Team Alpha', 'NonExistent', 'NewName', 'user-1'))
        .rejects.toThrow('Division not found');
    });

    it('should reject if new name already exists (case-insensitive)', async () => {
      await expect(service.rename('Team Alpha', 'Backend', 'frontend', 'user-1'))
        .rejects.toThrow('A division with this name already exists in the team');
    });

    it('should allow renaming to same name with different case', async () => {
      const result = await service.rename('Team Alpha', 'Backend', 'BACKEND', 'user-1');
      expect(result.name).toBe('BACKEND');
    });

    it('should validate new name (empty)', async () => {
      await expect(service.rename('Team Alpha', 'Backend', '', 'user-1'))
        .rejects.toThrow('Division name is required');
    });

    it('should validate new name (too long)', async () => {
      const longName = 'X'.repeat(101);
      await expect(service.rename('Team Alpha', 'Backend', longName, 'user-1'))
        .rejects.toThrow('Division name must not exceed 100 characters');
    });

    it('should not affect other teams when renaming', async () => {
      seedSprintData(db, 'Team Beta', 'Backend', 'Project Y', 'JIRA-4');

      await service.rename('Team Alpha', 'Backend', 'Server Side', 'user-1');

      // Team Beta's Backend should remain unchanged
      const betaRows = db.prepare(
        "SELECT COUNT(*) AS count FROM sprint_data WHERE team = 'Team Beta' AND track = 'Backend'"
      ).get() as { count: number };
      expect(betaRows.count).toBe(1);
    });
  });

  describe('delete', () => {
    it('should reject deletion if projects are assigned', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');

      await expect(service.delete('Team Alpha', 'Backend', 'user-1'))
        .rejects.toThrow('Cannot delete division with assigned projects');
    });

    it('should reject if division does not exist', async () => {
      await expect(service.delete('Team Alpha', 'NonExistent', 'user-1'))
        .rejects.toThrow('Division not found');
    });

    it('should throw DivisionError with 400 status for has-projects case', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');

      try {
        await service.delete('Team Alpha', 'Backend', 'user-1');
      } catch (error) {
        expect(error).toBeInstanceOf(DivisionError);
        expect((error as DivisionError).statusCode).toBe(400);
      }
    });

    it('should throw DivisionError with 404 status for not-found case', async () => {
      try {
        await service.delete('Team Alpha', 'NonExistent', 'user-1');
      } catch (error) {
        expect(error).toBeInstanceOf(DivisionError);
        expect((error as DivisionError).statusCode).toBe(404);
      }
    });
  });

  describe('assignProject', () => {
    beforeEach(() => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Alpha', 'Frontend', 'Project B', 'JIRA-2');
    });

    it('should assign a project to a different division', async () => {
      await service.assignProject('Team Alpha', 'Project A', 'Frontend', 'user-1');

      // Verify project track was updated
      const row = db.prepare(
        "SELECT track FROM sprint_data WHERE team = 'Team Alpha' AND project = 'Project A'"
      ).get() as { track: string };
      expect(row.track).toBe('Frontend');
    });

    it('should log project assignment to audit log', async () => {
      await service.assignProject('Team Alpha', 'Project A', 'Frontend', 'user-1');

      const auditEntries = await auditLogger.query({ teamId: 'Team Alpha', action: 'update' });
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].modifiedFields).toEqual(['track']);
    });

    it('should reject if project does not exist in the team', async () => {
      await expect(service.assignProject('Team Alpha', 'NonExistent', 'Backend', 'user-1'))
        .rejects.toThrow('Project not found in this team');
    });

    it('should reject if division does not exist in the team', async () => {
      await expect(service.assignProject('Team Alpha', 'Project A', 'NonExistent', 'user-1'))
        .rejects.toThrow('Division not found in this team');
    });
  });

  describe('getProjectsByDivision', () => {
    it('should return empty array when team has no data', async () => {
      const result = await service.getProjectsByDivision('NonExistentTeam');
      expect(result).toEqual([]);
    });

    it('should group projects by division', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project B', 'JIRA-2');
      seedSprintData(db, 'Team Alpha', 'Frontend', 'Project C', 'JIRA-3');

      const result = await service.getProjectsByDivision('Team Alpha');
      expect(result).toHaveLength(2);

      const backend = result.find(d => d.divisionName === 'Backend');
      expect(backend).toBeDefined();
      expect(backend!.projects).toEqual(['Project A', 'Project B']);

      const frontend = result.find(d => d.divisionName === 'Frontend');
      expect(frontend).toBeDefined();
      expect(frontend!.projects).toEqual(['Project C']);
    });

    it('should only return projects for the specified team', async () => {
      seedSprintData(db, 'Team Alpha', 'Backend', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Beta', 'Backend', 'Project X', 'JIRA-2');

      const result = await service.getProjectsByDivision('Team Alpha');
      expect(result).toHaveLength(1);
      expect(result[0].projects).toEqual(['Project A']);
    });

    it('should return divisions ordered alphabetically', async () => {
      seedSprintData(db, 'Team Alpha', 'Zebra', 'Project A', 'JIRA-1');
      seedSprintData(db, 'Team Alpha', 'Alpha', 'Project B', 'JIRA-2');

      const result = await service.getProjectsByDivision('Team Alpha');
      expect(result.map(d => d.divisionName)).toEqual(['Alpha', 'Zebra']);
    });
  });
});
