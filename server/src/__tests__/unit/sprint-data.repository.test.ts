import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SprintDataRepository } from '../../repositories/sprint-data.repository.js';
import type { SprintDataRow, KpiFilter, SprintDataRowExtended } from '../../types/index.js';

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
      function_name TEXT NOT NULL DEFAULT 'Unassigned',
      story_name TEXT,
      actual_effort REAL,
      definition_of_ready TEXT CHECK(definition_of_ready IN ('Y','N')),
      definition_of_done TEXT CHECK(definition_of_done IN ('Y','N')),
      refinement_closure_date TEXT,
      uat_start_date TEXT,
      uat_complete_date TEXT,
      delay_reason TEXT,
      delay_reason_description TEXT,
      UNIQUE(jira_id, team)
    );

    CREATE INDEX idx_sprint_data_team ON sprint_data(team);
    CREATE INDEX idx_sprint_data_portfolio ON sprint_data(portfolio);
    CREATE INDEX idx_sprint_data_project ON sprint_data(project);
    CREATE INDEX idx_sprint_data_dev_start ON sprint_data(dev_start_date);
    CREATE INDEX idx_sprint_data_jira_team ON sprint_data(jira_id, team);
    CREATE INDEX idx_sprint_data_function ON sprint_data(function_name);
    CREATE INDEX idx_sprint_data_function_team ON sprint_data(function_name, team);
  `);

  return db;
}

function createUpload(db: Database.Database, uploadId: string): void {
  db.prepare(
    `INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status)
     VALUES (@id, 'test.xlsx', 'user1', 0, 'processing')`
  ).run({ id: uploadId });
}

function makeRow(overrides: Partial<SprintDataRowExtended> = {}): SprintDataRowExtended {
  return {
    uploadId: 'upload-1',
    sno: 1,
    team: 'Team Alpha',
    track: 'IBPS-POS',
    project: 'Project X',
    portfolio: 'IBPS-POS',
    status: 'In Progress',
    itemsList: 'Item 1',
    walkthroughGivenOn: '2024-01-10',
    jiraId: 'PROJ-100',
    estimatedEffortWithAi: null,
    estimatedEffortWithoutAi: 8,
    actualEffortWithAi: 6,
    aiUsed: 'Y',
    devStartDate: '2024-01-15',
    devEndDate: '2024-01-20',
    developmentStatus: 'Complete',
    uatDeliveryDate: '2024-01-22',
    uatDeliveryTarget: '2024-01-25',
    resources: 'Dev1',
    goLivePlannedDate: '2024-01-28',
    goLiveDate: '2024-01-28',
    productionStatus: 'Live',
    rollback: 'N',
    rollbackReason: null,
    storyDropReason: null,
    ingestedAt: '2024-01-15T10:00:00Z',
    functionName: 'E-Com',
    storyName: 'User Login Story',
    actualEffort: 12.5,
    definitionOfReady: 'Y',
    definitionOfDone: 'N',
    refinementClosureDate: '2024-01-08',
    uatStartDate: '2024-01-21',
    uatCompleteDate: '2024-01-23',
    delayReason: 'Dependency on other team',
    delayReasonDescription: 'Waiting for API team to complete integration endpoint',
    ...overrides,
  };
}

describe('SprintDataRepository', () => {
  let db: Database.Database;
  let repo: SprintDataRepository;
  const uploadId = 'upload-1';

  beforeEach(() => {
    db = createInMemoryDb();
    createUpload(db, uploadId);
    repo = new SprintDataRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('bulkUpsert', () => {
    it('should insert rows successfully within a transaction', async () => {
      const rows = [
        makeRow({ sno: 1, jiraId: 'PROJ-101' }),
        makeRow({ sno: 2, jiraId: 'PROJ-102' }),
        makeRow({ sno: 3, jiraId: 'PROJ-103' }),
      ];

      const count = await repo.bulkUpsert(rows, uploadId);
      expect(count).toBe(3);

      const total = await repo.countByUpload(uploadId);
      expect(total).toBe(3);
    });

    it('should return 0 for empty rows array', async () => {
      const count = await repo.bulkUpsert([], uploadId);
      expect(count).toBe(0);
    });

    it('should throw error when rows exceed 10,000 limit', async () => {
      const rows = Array.from({ length: 10_001 }, (_, i) =>
        makeRow({ sno: i + 1, jiraId: `PROJ-${i + 1}` })
      );

      await expect(repo.bulkUpsert(rows, uploadId)).rejects.toThrow(
        'Row limit exceeded: received 10001 rows, maximum allowed is 10000'
      );
    });

    it('should replace existing rows on duplicate jira_id + team', async () => {
      const row1 = makeRow({ jiraId: 'PROJ-200', developmentStatus: 'In Progress' });
      await repo.bulkUpsert([row1], uploadId);

      const row2 = makeRow({ jiraId: 'PROJ-200', developmentStatus: 'Complete' });
      await repo.bulkUpsert([row2], uploadId);

      const result = await repo.findByJiraIdAndTeam('PROJ-200', 'Team Alpha');
      expect(result).not.toBeNull();
      expect(result!.developmentStatus).toBe('Complete');
    });

    it('should allow same jira_id with different teams', async () => {
      const row1 = makeRow({ jiraId: 'PROJ-300', team: 'Team Alpha' });
      const row2 = makeRow({ jiraId: 'PROJ-300', team: 'Team Beta' });
      await repo.bulkUpsert([row1, row2], uploadId);

      const resultAlpha = await repo.findByJiraIdAndTeam('PROJ-300', 'Team Alpha');
      const resultBeta = await repo.findByJiraIdAndTeam('PROJ-300', 'Team Beta');
      expect(resultAlpha).not.toBeNull();
      expect(resultBeta).not.toBeNull();
    });

    it('should rollback all rows on transaction failure', async () => {
      // Insert a valid row first
      await repo.bulkUpsert([makeRow({ jiraId: 'PROJ-400' })], uploadId);

      // Attempt to insert rows where one violates a constraint
      // The ai_used CHECK constraint only allows 'Y' or 'N'
      const badRows = [
        makeRow({ jiraId: 'PROJ-401' }),
        makeRow({ jiraId: 'PROJ-402', aiUsed: 'INVALID' as any }),
      ];

      await expect(repo.bulkUpsert(badRows, uploadId)).rejects.toThrow();

      // Original row should still be there, but no new rows
      const count = await repo.countByUpload(uploadId);
      expect(count).toBe(1);
    });

    it('should handle nullable fields correctly', async () => {
      const row = makeRow({
        jiraId: 'PROJ-500',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        estimatedEffortWithoutAi: null,
        actualEffortWithAi: null,
        aiUsed: null,
        devStartDate: null,
        devEndDate: null,
        developmentStatus: null,
        uatDeliveryDate: null,
        uatDeliveryTarget: null,
        resources: null,
        goLivePlannedDate: null,
        goLiveDate: null,
        productionStatus: null,
        rollback: null,
        rollbackReason: null,
        storyDropReason: null,
      });

      await repo.bulkUpsert([row], uploadId);
      const result = await repo.findByJiraIdAndTeam('PROJ-500', 'Team Alpha');

      expect(result).not.toBeNull();
      expect(result!.status).toBeNull();
      expect(result!.estimatedEffortWithoutAi).toBeNull();
      expect(result!.aiUsed).toBeNull();
      expect(result!.rollback).toBeNull();
    });

    it('should persist all extended fields (function_name, story_name, etc.)', async () => {
      const row = makeRow({
        jiraId: 'PROJ-550',
        functionName: 'MPro',
        storyName: 'Payment Integration',
        actualEffort: 24.5,
        definitionOfReady: 'Y',
        definitionOfDone: 'N',
        refinementClosureDate: '2024-01-05',
        uatStartDate: '2024-01-20',
        uatCompleteDate: '2024-01-22',
        delayReason: 'Technical complexity',
        delayReasonDescription: 'Complex third-party API integration required additional research',
      });

      await repo.bulkUpsert([row], uploadId);
      const result = await repo.findByJiraIdAndTeam('PROJ-550', 'Team Alpha');

      expect(result).not.toBeNull();
      expect(result!.functionName).toBe('MPro');
      expect(result!.storyName).toBe('Payment Integration');
      expect(result!.actualEffort).toBe(24.5);
      expect(result!.definitionOfReady).toBe('Y');
      expect(result!.definitionOfDone).toBe('N');
      expect(result!.refinementClosureDate).toBe('2024-01-05');
      expect(result!.uatStartDate).toBe('2024-01-20');
      expect(result!.uatCompleteDate).toBe('2024-01-22');
      expect(result!.delayReason).toBe('Technical complexity');
      expect(result!.delayReasonDescription).toBe('Complex third-party API integration required additional research');
    });

    it('should handle nullable extended fields correctly', async () => {
      const row = makeRow({
        jiraId: 'PROJ-551',
        functionName: 'E-Com',
        storyName: null,
        actualEffort: null,
        definitionOfReady: null,
        definitionOfDone: null,
        refinementClosureDate: null,
        uatStartDate: null,
        uatCompleteDate: null,
        delayReason: null,
        delayReasonDescription: null,
      });

      await repo.bulkUpsert([row], uploadId);
      const result = await repo.findByJiraIdAndTeam('PROJ-551', 'Team Alpha');

      expect(result).not.toBeNull();
      expect(result!.functionName).toBe('E-Com');
      expect(result!.storyName).toBeNull();
      expect(result!.actualEffort).toBeNull();
      expect(result!.definitionOfReady).toBeNull();
      expect(result!.definitionOfDone).toBeNull();
      expect(result!.refinementClosureDate).toBeNull();
      expect(result!.uatStartDate).toBeNull();
      expect(result!.uatCompleteDate).toBeNull();
      expect(result!.delayReason).toBeNull();
      expect(result!.delayReasonDescription).toBeNull();
    });

    it('should default function_name to Unassigned when not provided', async () => {
      // Use a base SprintDataRow without extended fields
      const baseRow: SprintDataRow = {
        uploadId: 'upload-1',
        sno: 1,
        team: 'Team Alpha',
        track: 'IBPS-POS',
        project: 'Project X',
        portfolio: 'IBPS-POS',
        status: 'In Progress',
        itemsList: 'Item 1',
        walkthroughGivenOn: '2024-01-10',
        jiraId: 'PROJ-552',
        estimatedEffortWithAi: null,
        estimatedEffortWithoutAi: 8,
        actualEffortWithAi: 6,
        aiUsed: 'Y',
        devStartDate: '2024-01-15',
        devEndDate: '2024-01-20',
        developmentStatus: 'Complete',
        uatDeliveryDate: '2024-01-22',
        uatDeliveryTarget: '2024-01-25',
        resources: 'Dev1',
        goLivePlannedDate: '2024-01-28',
        goLiveDate: '2024-01-28',
        productionStatus: 'Live',
        rollback: 'N',
        rollbackReason: null,
        storyDropReason: null,
        ingestedAt: '2024-01-15T10:00:00Z',
      };

      await repo.bulkUpsert([baseRow], uploadId);
      const result = await repo.findByJiraIdAndTeam('PROJ-552', 'Team Alpha');

      expect(result).not.toBeNull();
      expect(result!.functionName).toBe('Unassigned');
      expect(result!.storyName).toBeNull();
      expect(result!.actualEffort).toBeNull();
    });

    it('should reject invalid definition_of_ready values via CHECK constraint', async () => {
      const row = makeRow({
        jiraId: 'PROJ-553',
        definitionOfReady: 'INVALID' as any,
      });

      await expect(repo.bulkUpsert([row], uploadId)).rejects.toThrow();
    });

    it('should reject invalid definition_of_done values via CHECK constraint', async () => {
      const row = makeRow({
        jiraId: 'PROJ-554',
        definitionOfDone: 'INVALID' as any,
      });

      await expect(repo.bulkUpsert([row], uploadId)).rejects.toThrow();
    });

    it('should update extended fields on upsert (jira_id + team conflict)', async () => {
      const row1 = makeRow({
        jiraId: 'PROJ-555',
        functionName: 'E-Com',
        storyName: 'Original Story',
        actualEffort: 10,
        definitionOfReady: 'N',
      });
      await repo.bulkUpsert([row1], uploadId);

      const row2 = makeRow({
        jiraId: 'PROJ-555',
        functionName: 'MPro',
        storyName: 'Updated Story',
        actualEffort: 20,
        definitionOfReady: 'Y',
      });
      await repo.bulkUpsert([row2], uploadId);

      const result = await repo.findByJiraIdAndTeam('PROJ-555', 'Team Alpha');
      expect(result).not.toBeNull();
      expect(result!.functionName).toBe('MPro');
      expect(result!.storyName).toBe('Updated Story');
      expect(result!.actualEffort).toBe(20);
      expect(result!.definitionOfReady).toBe('Y');
    });
  });

  describe('findByFilter', () => {
    beforeEach(async () => {
      const rows = [
        makeRow({ sno: 1, jiraId: 'PROJ-601', team: 'Team Alpha', portfolio: 'IBPS-POS', project: 'Project X', devStartDate: '2024-01-10' }),
        makeRow({ sno: 2, jiraId: 'PROJ-602', team: 'Team Beta', portfolio: 'mPro', project: 'Project Y', devStartDate: '2024-01-15' }),
        makeRow({ sno: 3, jiraId: 'PROJ-603', team: 'Team Alpha', portfolio: 'IBPS-POS', project: 'Project X', devStartDate: '2024-02-01' }),
        makeRow({ sno: 4, jiraId: 'PROJ-604', team: 'Team Gamma', portfolio: 'E-Commerce', project: 'Project Z', devStartDate: '2024-02-10' }),
      ];
      await repo.bulkUpsert(rows, uploadId);
    });

    it('should return all rows when no filter is provided', async () => {
      const results = await repo.findByFilter({});
      expect(results).toHaveLength(4);
    });

    it('should filter by team', async () => {
      const results = await repo.findByFilter({ team: 'Team Alpha' });
      expect(results).toHaveLength(2);
      expect(results.every(r => r.team === 'Team Alpha')).toBe(true);
    });

    it('should filter by portfolio', async () => {
      const results = await repo.findByFilter({ portfolio: 'IBPS-POS' });
      expect(results).toHaveLength(2);
      expect(results.every(r => r.portfolio === 'IBPS-POS')).toBe(true);
    });

    it('should filter by project', async () => {
      const results = await repo.findByFilter({ project: 'Project Y' });
      expect(results).toHaveLength(1);
      expect(results[0].jiraId).toBe('PROJ-602');
    });

    it('should filter by date range (dev_start_date)', async () => {
      const results = await repo.findByFilter({ startDate: '2024-01-12', endDate: '2024-02-01' });
      expect(results).toHaveLength(2);
      expect(results.map(r => r.jiraId).sort()).toEqual(['PROJ-602', 'PROJ-603']);
    });

    it('should combine multiple filters', async () => {
      const results = await repo.findByFilter({
        team: 'Team Alpha',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      expect(results).toHaveLength(1);
      expect(results[0].jiraId).toBe('PROJ-601');
    });

    it('should return empty array for non-matching filter', async () => {
      const results = await repo.findByFilter({ team: 'NonExistent' });
      expect(results).toHaveLength(0);
    });
  });

  describe('findByJiraIdAndTeam', () => {
    it('should return the row for existing jira_id + team', async () => {
      await repo.bulkUpsert([makeRow({ jiraId: 'PROJ-700', team: 'Team Alpha' })], uploadId);
      const result = await repo.findByJiraIdAndTeam('PROJ-700', 'Team Alpha');

      expect(result).not.toBeNull();
      expect(result!.jiraId).toBe('PROJ-700');
      expect(result!.team).toBe('Team Alpha');
    });

    it('should return null for non-existing combination', async () => {
      const result = await repo.findByJiraIdAndTeam('PROJ-999', 'NoTeam');
      expect(result).toBeNull();
    });
  });

  describe('countByUpload', () => {
    it('should return correct count for an upload', async () => {
      const rows = [
        makeRow({ sno: 1, jiraId: 'PROJ-801' }),
        makeRow({ sno: 2, jiraId: 'PROJ-802' }),
      ];
      await repo.bulkUpsert(rows, uploadId);

      const count = await repo.countByUpload(uploadId);
      expect(count).toBe(2);
    });

    it('should return 0 for unknown upload id', async () => {
      const count = await repo.countByUpload('nonexistent-upload');
      expect(count).toBe(0);
    });

    it('should count rows per specific upload', async () => {
      const upload2Id = 'upload-2';
      createUpload(db, upload2Id);

      await repo.bulkUpsert(
        [makeRow({ sno: 1, jiraId: 'PROJ-901' })],
        uploadId
      );
      await repo.bulkUpsert(
        [makeRow({ sno: 2, jiraId: 'PROJ-902', team: 'Team Beta' })],
        upload2Id
      );

      expect(await repo.countByUpload(uploadId)).toBe(1);
      expect(await repo.countByUpload(upload2Id)).toBe(1);
    });
  });
});
