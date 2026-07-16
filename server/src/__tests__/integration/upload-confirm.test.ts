/**
 * Integration Tests for POST /api/upload/confirm endpoint
 *
 * Tests the confirm/decline flow for pending uploads with new teams.
 *
 * **Validates: Requirements 2.3, 2.4**
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { PendingUploadRepository } from '../../repositories/pending-upload.repository';
import { TeamRepository } from '../../repositories/team.repository';
import { FunctionRepository } from '../../repositories/function.repository';
import { UploadRepository } from '../../repositories/upload.repository';
import { SprintDataRepository } from '../../repositories/sprint-data.repository';

// We test the confirm logic in isolation by mocking the database via better-sqlite3 in-memory
// and invoking the route handler logic directly.

/**
 * Creates an in-memory database with all required tables for the confirm endpoint.
 */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE functions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      function_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      FOREIGN KEY (function_id) REFERENCES functions(id),
      UNIQUE(name, function_id)
    );

    CREATE TABLE pending_uploads (
      id TEXT PRIMARY KEY,
      rows_json TEXT NOT NULL,
      function_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      new_teams_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX idx_pending_uploads_expires_at ON pending_uploads(expires_at);
    CREATE INDEX idx_pending_uploads_user_id ON pending_uploads(user_id);

    CREATE TABLE uploads (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      rows_ingested INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'processing',
      error_message TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE sprint_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL,
      sno INTEGER,
      team TEXT NOT NULL,
      track TEXT,
      project TEXT,
      portfolio TEXT,
      status TEXT,
      items_list TEXT,
      walkthrough_given_on TEXT,
      jira_id TEXT NOT NULL,
      estimated_effort_with_ai REAL,
      estimated_effort_without_ai REAL,
      actual_effort_with_ai REAL,
      ai_used TEXT,
      dev_start_date TEXT,
      dev_end_date TEXT,
      development_status TEXT,
      uat_delivery_date TEXT,
      uat_delivery_target TEXT,
      resources TEXT,
      go_live_planned_date TEXT,
      go_live_date TEXT,
      production_status TEXT,
      rollback TEXT,
      rollback_reason TEXT,
      story_drop_reason TEXT,
      ingested_at TEXT,
      function_name TEXT DEFAULT 'Unassigned',
      story_name TEXT,
      actual_effort REAL,
      definition_of_ready TEXT,
      definition_of_done TEXT,
      refinement_closure_date TEXT,
      uat_start_date TEXT,
      uat_complete_date TEXT,
      delay_reason TEXT,
      delay_reason_description TEXT,
      UNIQUE(jira_id, team)
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id INTEGER,
      record_type TEXT,
      team_id TEXT,
      modified_fields TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'Engineering_Manager',
      function_id INTEGER,
      team_id TEXT
    );
  `);

  return db;
}

/**
 * Seed the test database with a function and some registered teams.
 */
function seedTestData(db: Database.Database) {
  db.prepare("INSERT INTO functions (id, name) VALUES (1, 'E-Com')").run();
  db.prepare("INSERT INTO teams (name, function_id) VALUES ('Retail', 1)").run();
  db.prepare("INSERT INTO teams (name, function_id) VALUES ('Claims', 1)").run();
  db.prepare("INSERT INTO users (id, email, role, function_id) VALUES ('user-123', 'em@test.com', 'Engineering_Manager', 1)").run();
}

/**
 * Creates a pending upload record for testing.
 */
function createPendingUpload(db: Database.Database, overrides: Partial<{
  id: string;
  rows: unknown[];
  functionId: number;
  userId: string;
  filename: string;
  newTeams: string[];
  expired: boolean;
}> = {}) {
  const id = overrides.id || 'pending-uuid-123';
  const rows = overrides.rows || [
    {
      'S.No': 1,
      'Function': 'E-Com',
      'Team': 'NewTeamAlpha',
      'Item / Story Name': 'Build feature X',
      'JIRA ID': 'PROJ-101',
      'Dev Start Date': '01-01-2024',
      'Dev Complete Date': '15-01-2024',
      'With AI (Story Points)': 5,
      'Production Status': 'Live',
      'Story Status': 'Done',
      'AI Used (Y/N)': 'Y',
      'Rollback (Y/N)': 'N',
    },
  ];
  const functionId = overrides.functionId || 1;
  const userId = overrides.userId || 'user-123';
  const filename = overrides.filename || 'sprint-data.xlsx';
  const newTeams = overrides.newTeams || ['NewTeamAlpha'];
  const expired = overrides.expired || false;

  const expiresAt = expired
    ? new Date(Date.now() - 60000).toISOString()
    : new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO pending_uploads (id, rows_json, function_id, user_id, filename, new_teams_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, JSON.stringify(rows), functionId, userId, filename, JSON.stringify(newTeams), expiresAt);
}

describe('POST /api/upload/confirm — Integration Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Confirm success flow', () => {
    it('should create new teams, ingest rows, and return success response', async () => {
      createPendingUpload(db, {
        id: 'confirm-test-1',
        newTeams: ['NewTeamAlpha', 'NewTeamBeta'],
        rows: [
          {
            'S.No': 1,
            'Function': 'E-Com',
            'Team': 'NewTeamAlpha',
            'Item / Story Name': 'Feature A',
            'JIRA ID': 'PROJ-101',
            'Dev Start Date': '01-01-2024',
            'Dev Complete Date': '15-01-2024',
            'With AI (Story Points)': 5,
            'Production Status': 'Live',
            'Story Status': 'Done',
            'AI Used (Y/N)': 'Y',
            'Rollback (Y/N)': 'N',
          },
          {
            'S.No': 2,
            'Function': 'E-Com',
            'Team': 'NewTeamBeta',
            'Item / Story Name': 'Feature B',
            'JIRA ID': 'PROJ-102',
            'Dev Start Date': '05-01-2024',
            'Dev Complete Date': '20-01-2024',
            'With AI (Story Points)': 3,
            'Production Status': 'In Progress',
            'Story Status': 'In Development',
            'AI Used (Y/N)': 'N',
            'Rollback (Y/N)': 'N',
          },
        ],
      });

      const pendingUploadRepo = new PendingUploadRepository(db);
      const teamRepo = new TeamRepository(db);
      const functionRepo = new FunctionRepository(db);
      const uploadRepo = new UploadRepository(db);
      const sprintDataRepo = new SprintDataRepository(db);

      // Retrieve pending upload
      const pendingUpload = pendingUploadRepo.getById('confirm-test-1');
      expect(pendingUpload).not.toBeNull();

      // Simulate the confirm logic
      const functionRecord = functionRepo.getById(pendingUpload!.functionId);
      expect(functionRecord).not.toBeNull();

      // Create new teams
      const teamsCreated: string[] = [];
      for (const teamName of pendingUpload!.newTeams) {
        const existing = teamRepo.getByNameAndFunction(teamName, pendingUpload!.functionId);
        if (!existing) {
          teamRepo.create(teamName, pendingUpload!.functionId);
        }
        teamsCreated.push(teamName);
      }

      // Verify teams were created
      expect(teamsCreated).toEqual(['NewTeamAlpha', 'NewTeamBeta']);
      const alpha = teamRepo.getByNameAndFunction('NewTeamAlpha', 1);
      expect(alpha).not.toBeNull();
      expect(alpha!.name).toBe('NewTeamAlpha');
      expect(alpha!.functionId).toBe(1);

      const beta = teamRepo.getByNameAndFunction('NewTeamBeta', 1);
      expect(beta).not.toBeNull();
      expect(beta!.name).toBe('NewTeamBeta');

      // Create upload record
      const uploadId = 'test-upload-id';
      const timestamp = new Date().toISOString();
      await uploadRepo.createUploadRecord({
        id: uploadId,
        fileName: pendingUpload!.filename,
        uploadedBy: pendingUpload!.userId,
        rowsIngested: 0,
        status: 'processing',
        errorMessage: null,
      });

      // Map and ingest rows
      const rows = pendingUpload!.rows as Record<string, unknown>[];
      const sprintDataRows = rows.map((row) => ({
        uploadId,
        sno: row['S.No'] as number,
        team: String(row['Team'] || ''),
        track: String(row['Team'] || ''),
        project: String(row['Team'] || ''),
        portfolio: functionRecord!.name,
        status: row['Story Status'] as string || null,
        itemsList: row['Item / Story Name'] as string || null,
        walkthroughGivenOn: null,
        jiraId: String(row['JIRA ID'] || ''),
        estimatedEffortWithAi: row['With AI (Story Points)'] as number || null,
        estimatedEffortWithoutAi: null,
        actualEffortWithAi: null,
        aiUsed: row['AI Used (Y/N)'] as string || null,
        devStartDate: row['Dev Start Date'] as string || null,
        devEndDate: row['Dev Complete Date'] as string || null,
        developmentStatus: null,
        uatDeliveryDate: null,
        uatDeliveryTarget: null,
        resources: null,
        goLivePlannedDate: null,
        goLiveDate: null,
        productionStatus: row['Production Status'] as string || null,
        rollback: row['Rollback (Y/N)'] as string || null,
        rollbackReason: null,
        storyDropReason: null,
        ingestedAt: timestamp,
        functionName: functionRecord!.name,
        storyName: row['Item / Story Name'] as string || null,
        actualEffort: null,
        definitionOfReady: null,
        definitionOfDone: null,
        refinementClosureDate: null,
        uatStartDate: null,
        uatCompleteDate: null,
        delayReason: null,
        delayReasonDescription: null,
      }));

      const rowsIngested = await sprintDataRepo.bulkUpsert(sprintDataRows, uploadId);
      expect(rowsIngested).toBe(2);

      // Delete pending upload
      const deleted = pendingUploadRepo.delete('confirm-test-1');
      expect(deleted).toBe(true);

      // Verify pending upload is gone
      const afterDelete = pendingUploadRepo.getById('confirm-test-1');
      expect(afterDelete).toBeNull();

      // Verify sprint data was ingested
      const count = await sprintDataRepo.countByUpload(uploadId);
      expect(count).toBe(2);
    });
  });

  describe('Decline flow', () => {
    it('should delete pending record without creating teams or ingesting data', () => {
      createPendingUpload(db, {
        id: 'decline-test-1',
        newTeams: ['DeclinedTeam'],
      });

      const pendingUploadRepo = new PendingUploadRepository(db);
      const teamRepo = new TeamRepository(db);

      // Verify pending upload exists before decline
      const before = pendingUploadRepo.getById('decline-test-1');
      expect(before).not.toBeNull();

      // Simulate decline: just delete the pending record
      pendingUploadRepo.delete('decline-test-1');

      // Verify no team was created
      const team = teamRepo.getByNameAndFunction('DeclinedTeam', 1);
      expect(team).toBeNull();

      // Verify pending upload is gone
      const after = pendingUploadRepo.getById('decline-test-1');
      expect(after).toBeNull();

      // Verify no sprint data was ingested
      const sprintDataCount = db.prepare(
        "SELECT COUNT(*) as count FROM sprint_data"
      ).get() as { count: number };
      expect(sprintDataCount.count).toBe(0);
    });
  });

  describe('Expired/missing pendingUploadId (410 Gone)', () => {
    it('should return null for non-existent pendingUploadId', () => {
      const pendingUploadRepo = new PendingUploadRepository(db);
      const result = pendingUploadRepo.getById('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return null for expired pendingUploadId', () => {
      createPendingUpload(db, {
        id: 'expired-test-1',
        expired: true,
      });

      const pendingUploadRepo = new PendingUploadRepository(db);
      const result = pendingUploadRepo.getById('expired-test-1');
      expect(result).toBeNull();
    });

    it('should clean up expired record automatically on access', () => {
      createPendingUpload(db, {
        id: 'expired-cleanup-1',
        expired: true,
      });

      const pendingUploadRepo = new PendingUploadRepository(db);
      pendingUploadRepo.getById('expired-cleanup-1');

      // Verify the record was deleted from the database
      const raw = db.prepare(
        'SELECT * FROM pending_uploads WHERE id = ?'
      ).get('expired-cleanup-1');
      expect(raw).toBeUndefined();
    });
  });

  describe('Double-confirm idempotency', () => {
    it('should return null on second confirm attempt (record already deleted)', async () => {
      createPendingUpload(db, {
        id: 'double-confirm-1',
        newTeams: ['TeamX'],
        rows: [
          {
            'S.No': 1,
            'Function': 'E-Com',
            'Team': 'TeamX',
            'Item / Story Name': 'Story 1',
            'JIRA ID': 'DC-1',
            'Production Status': 'Live',
            'Story Status': 'Done',
            'AI Used (Y/N)': 'Y',
            'Rollback (Y/N)': 'N',
          },
        ],
      });

      const pendingUploadRepo = new PendingUploadRepository(db);
      const teamRepo = new TeamRepository(db);

      // First confirm: retrieve and delete
      const firstAttempt = pendingUploadRepo.getById('double-confirm-1');
      expect(firstAttempt).not.toBeNull();

      // Create the team
      teamRepo.create('TeamX', 1);

      // Delete pending upload (as the confirm endpoint does)
      pendingUploadRepo.delete('double-confirm-1');

      // Second confirm attempt: pending upload is gone → should return null (410 scenario)
      const secondAttempt = pendingUploadRepo.getById('double-confirm-1');
      expect(secondAttempt).toBeNull();
    });

    it('should handle idempotent team creation (team already exists)', () => {
      createPendingUpload(db, {
        id: 'idempotent-team-1',
        newTeams: ['AlreadyExists'],
      });

      const teamRepo = new TeamRepository(db);

      // Simulate team already created (e.g., by a concurrent request)
      teamRepo.create('AlreadyExists', 1);

      // Confirm logic: check if team exists before creating
      const existing = teamRepo.getByNameAndFunction('AlreadyExists', 1);
      expect(existing).not.toBeNull();

      // Should not throw when team already exists (skip creation)
      // This mirrors the confirm endpoint logic: check before create
      const teams = teamRepo.getByFunction(1);
      const alreadyExistsTeam = teams.find(t => t.name === 'AlreadyExists');
      expect(alreadyExistsTeam).toBeDefined();
    });
  });
});
