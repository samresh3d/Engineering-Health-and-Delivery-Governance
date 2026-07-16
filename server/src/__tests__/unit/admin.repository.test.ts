import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AdminRepository, TeamDetail } from '../../repositories/admin.repository.js';
import type { SprintDataRow } from '../../types/index.js';

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

    CREATE INDEX idx_sprint_data_team ON sprint_data(team);
    CREATE INDEX idx_sprint_data_portfolio ON sprint_data(portfolio);
    CREATE INDEX idx_sprint_data_project ON sprint_data(project);
  `);

  return db;
}

function createUpload(db: Database.Database, uploadId: string, uploadedAt?: string): void {
  if (uploadedAt) {
    db.prepare(
      `INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status, uploaded_at)
       VALUES (@id, 'test.xlsx', 'user1', 0, 'success', @uploadedAt)`
    ).run({ id: uploadId, uploadedAt });
  } else {
    db.prepare(
      `INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status)
       VALUES (@id, 'test.xlsx', 'user1', 0, 'success')`
    ).run({ id: uploadId });
  }
}

function insertSprintRow(
  db: Database.Database,
  overrides: Partial<{
    uploadId: string;
    team: string;
    track: string;
    project: string;
    portfolio: string;
    jiraId: string;
    developmentStatus: string | null;
  }> = {}
): void {
  const data = {
    uploadId: overrides.uploadId ?? 'upload-1',
    team: overrides.team ?? 'Team Alpha',
    track: overrides.track ?? 'Track1',
    project: overrides.project ?? 'ProjectX',
    portfolio: overrides.portfolio ?? 'Portfolio1',
    jiraId: overrides.jiraId ?? `JIRA-${Math.random().toString(36).substr(2, 6)}`,
    developmentStatus: overrides.developmentStatus === undefined ? 'In Progress' : overrides.developmentStatus,
  };

  db.prepare(`
    INSERT INTO sprint_data (upload_id, team, track, project, portfolio, jira_id, development_status, ingested_at)
    VALUES (@uploadId, @team, @track, @project, @portfolio, @jiraId, @developmentStatus, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  `).run(data);
}

describe('AdminRepository', () => {
  let db: Database.Database;
  let repo: AdminRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    createUpload(db, 'upload-1');
    repo = new AdminRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getAnalytics', () => {
    it('should return zeroes for empty sprint_data and no recent uploads', () => {
      // Use a fresh DB with no uploads
      const freshDb = createInMemoryDb();
      const freshRepo = new AdminRepository(freshDb);

      const analytics = freshRepo.getAnalytics();
      expect(analytics.totalTeams).toBe(0);
      expect(analytics.totalEntries).toBe(0);
      expect(analytics.recentUploads).toBe(0);
      expect(analytics.pendingItems).toBe(0);

      freshDb.close();
    });

    it('should count distinct teams correctly', () => {
      insertSprintRow(db, { team: 'Team Alpha', jiraId: 'J-1' });
      insertSprintRow(db, { team: 'Team Alpha', jiraId: 'J-2' });
      insertSprintRow(db, { team: 'Team Beta', jiraId: 'J-3' });
      insertSprintRow(db, { team: 'Team Gamma', jiraId: 'J-4' });

      const analytics = repo.getAnalytics();
      expect(analytics.totalTeams).toBe(3);
    });

    it('should count total entries correctly', () => {
      insertSprintRow(db, { jiraId: 'J-1' });
      insertSprintRow(db, { jiraId: 'J-2' });
      insertSprintRow(db, { jiraId: 'J-3' });

      const analytics = repo.getAnalytics();
      expect(analytics.totalEntries).toBe(3);
    });

    it('should count recent uploads within 7 days', () => {
      // The default upload was created with current timestamp (within 7 days)
      // Add an old upload
      const oldDate = '2020-01-01T00:00:00Z';
      createUpload(db, 'old-upload', oldDate);

      const analytics = repo.getAnalytics();
      // 'upload-1' was created now (recent), 'old-upload' is old
      expect(analytics.recentUploads).toBe(1);
    });

    it('should count pending items (null or empty development_status)', () => {
      insertSprintRow(db, { jiraId: 'J-1', developmentStatus: null });
      insertSprintRow(db, { jiraId: 'J-2', developmentStatus: '' });
      insertSprintRow(db, { jiraId: 'J-3', developmentStatus: 'Complete' });
      insertSprintRow(db, { jiraId: 'J-4', developmentStatus: 'In Progress' });

      const analytics = repo.getAnalytics();
      expect(analytics.pendingItems).toBe(2);
    });
  });

  describe('getTeams', () => {
    beforeEach(() => {
      insertSprintRow(db, { team: 'Team Alpha', portfolio: 'Portfolio A', jiraId: 'J-1' });
      insertSprintRow(db, { team: 'Team Alpha', portfolio: 'Portfolio A', jiraId: 'J-2' });
      insertSprintRow(db, { team: 'Team Beta', portfolio: 'Portfolio B', jiraId: 'J-3' });
      insertSprintRow(db, { team: 'Team Gamma', portfolio: 'Portfolio A', jiraId: 'J-4' });
    });

    it('should return all teams with entry counts when no filters', () => {
      const teams = repo.getTeams();
      expect(teams).toHaveLength(3);

      const alpha = teams.find(t => t.team === 'Team Alpha');
      expect(alpha).toBeDefined();
      expect(alpha!.entryCount).toBe(2);
      expect(alpha!.portfolio).toBe('Portfolio A');

      const beta = teams.find(t => t.team === 'Team Beta');
      expect(beta).toBeDefined();
      expect(beta!.entryCount).toBe(1);
    });

    it('should filter teams by case-insensitive search', () => {
      const teams = repo.getTeams('alpha');
      expect(teams).toHaveLength(1);
      expect(teams[0].team).toBe('Team Alpha');
    });

    it('should filter teams by uppercase search', () => {
      const teams = repo.getTeams('BETA');
      expect(teams).toHaveLength(1);
      expect(teams[0].team).toBe('Team Beta');
    });

    it('should filter teams by partial search', () => {
      const teams = repo.getTeams('Team');
      expect(teams).toHaveLength(3);
    });

    it('should filter by portfolio', () => {
      const teams = repo.getTeams(undefined, 'Portfolio A');
      expect(teams).toHaveLength(2);
      expect(teams.every(t => t.portfolio === 'Portfolio A')).toBe(true);
    });

    it('should combine search and portfolio filters', () => {
      const teams = repo.getTeams('alpha', 'Portfolio A');
      expect(teams).toHaveLength(1);
      expect(teams[0].team).toBe('Team Alpha');
    });

    it('should return empty array for non-matching search', () => {
      const teams = repo.getTeams('NonExistent');
      expect(teams).toHaveLength(0);
    });

    it('should return empty array for non-matching portfolio', () => {
      const teams = repo.getTeams(undefined, 'NonExistent Portfolio');
      expect(teams).toHaveLength(0);
    });
  });

  describe('getTeamDetail', () => {
    beforeEach(() => {
      insertSprintRow(db, { team: 'Team Alpha', project: 'ProjectX', portfolio: 'Portfolio A', jiraId: 'J-1' });
      insertSprintRow(db, { team: 'Team Alpha', project: 'ProjectY', portfolio: 'Portfolio A', jiraId: 'J-2' });
      insertSprintRow(db, { team: 'Team Alpha', project: 'ProjectX', portfolio: 'Portfolio A', jiraId: 'J-3' });
      insertSprintRow(db, { team: 'Team Beta', project: 'ProjectZ', portfolio: 'Portfolio B', jiraId: 'J-4' });
    });

    it('should return team detail with entries', () => {
      const detail = repo.getTeamDetail('Team Alpha');
      expect(detail).not.toBeNull();
      expect(detail!.team).toBe('Team Alpha');
      expect(detail!.portfolio).toBe('Portfolio A');
      expect(detail!.totalEntries).toBe(3);
      expect(detail!.distinctProjects).toBe(2);
      expect(detail!.entries).toHaveLength(3);
    });

    it('should only include entries for the specified team', () => {
      const detail = repo.getTeamDetail('Team Alpha');
      expect(detail!.entries.every(e => e.team === 'Team Alpha')).toBe(true);
    });

    it('should return null for non-existent team', () => {
      const detail = repo.getTeamDetail('NonExistent Team');
      expect(detail).toBeNull();
    });

    it('should count distinct projects correctly', () => {
      const detail = repo.getTeamDetail('Team Beta');
      expect(detail).not.toBeNull();
      expect(detail!.distinctProjects).toBe(1);
      expect(detail!.totalEntries).toBe(1);
    });
  });

  describe('getEntries', () => {
    beforeEach(() => {
      for (let i = 1; i <= 10; i++) {
        insertSprintRow(db, { jiraId: `J-${i}`, team: `Team ${i % 3}` });
      }
    });

    it('should return paginated entries with correct total', () => {
      const result = repo.getEntries(5, 0);
      expect(result.entries).toHaveLength(5);
      expect(result.total).toBe(10);
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(0);
    });

    it('should respect offset for pagination', () => {
      const page1 = repo.getEntries(5, 0);
      const page2 = repo.getEntries(5, 5);

      expect(page1.entries).toHaveLength(5);
      expect(page2.entries).toHaveLength(5);

      // Pages should not overlap
      const page1Ids = page1.entries.map(e => e.id);
      const page2Ids = page2.entries.map(e => e.id);
      expect(page1Ids.filter(id => page2Ids.includes(id))).toHaveLength(0);
    });

    it('should return remaining entries when offset + limit > total', () => {
      const result = repo.getEntries(5, 8);
      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(10);
    });

    it('should return empty entries when offset >= total', () => {
      const result = repo.getEntries(5, 20);
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(10);
    });

    it('should sort by a valid column', () => {
      const result = repo.getEntries(10, 0, 'team');
      expect(result.entries).toHaveLength(10);
      // Entries should be ordered by team ASC
      for (let i = 1; i < result.entries.length; i++) {
        expect(result.entries[i].team >= result.entries[i - 1].team).toBe(true);
      }
    });

    it('should fallback to id sorting for invalid sort column', () => {
      const result = repo.getEntries(10, 0, 'DROP TABLE sprint_data');
      expect(result.entries).toHaveLength(10);
      // Should still work (falls back to id ASC)
      for (let i = 1; i < result.entries.length; i++) {
        expect(result.entries[i].id! > result.entries[i - 1].id!).toBe(true);
      }
    });

    it('should handle empty table', () => {
      // Use a fresh DB
      const freshDb = createInMemoryDb();
      createUpload(freshDb, 'upload-fresh');
      const freshRepo = new AdminRepository(freshDb);

      const result = freshRepo.getEntries(25, 0);
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);

      freshDb.close();
    });
  });

  describe('createEntry', () => {
    it('should create a new entry and return it with an id', () => {
      const data: Partial<SprintDataRow> = {
        team: 'New Team',
        track: 'New Track',
        project: 'New Project',
        portfolio: 'New Portfolio',
        jiraId: 'NEW-001',
        developmentStatus: 'In Progress',
      };

      const created = repo.createEntry(data);
      expect(created.id).toBeDefined();
      expect(created.id).toBeGreaterThan(0);
      expect(created.team).toBe('New Team');
      expect(created.track).toBe('New Track');
      expect(created.project).toBe('New Project');
      expect(created.portfolio).toBe('New Portfolio');
      expect(created.jiraId).toBe('NEW-001');
      expect(created.developmentStatus).toBe('In Progress');
    });

    it('should set default uploadId to "admin-created"', () => {
      const created = repo.createEntry({
        team: 'Team',
        track: 'Track',
        project: 'Project',
        portfolio: 'Portfolio',
        jiraId: 'J-CREATE-1',
      });
      expect(created.uploadId).toBe('admin-created');
    });

    it('should use provided uploadId when specified', () => {
      const created = repo.createEntry({
        uploadId: 'upload-1',
        team: 'Team',
        track: 'Track',
        project: 'Project',
        portfolio: 'Portfolio',
        jiraId: 'J-CREATE-2',
      });
      expect(created.uploadId).toBe('upload-1');
    });

    it('should set nullable fields to null when not provided', () => {
      const created = repo.createEntry({
        team: 'Team',
        track: 'Track',
        project: 'Project',
        portfolio: 'Portfolio',
        jiraId: 'J-CREATE-3',
      });
      expect(created.status).toBeNull();
      expect(created.aiUsed).toBeNull();
      expect(created.rollback).toBeNull();
      expect(created.developmentStatus).toBeNull();
    });

    it('should set ingestedAt automatically', () => {
      const created = repo.createEntry({
        team: 'Team',
        track: 'Track',
        project: 'Project',
        portfolio: 'Portfolio',
        jiraId: 'J-CREATE-4',
      });
      expect(created.ingestedAt).toBeDefined();
      expect(created.ingestedAt.length).toBeGreaterThan(0);
    });
  });

  describe('updateEntry', () => {
    let entryId: number;

    beforeEach(() => {
      const created = repo.createEntry({
        team: 'Team Alpha',
        track: 'Track1',
        project: 'ProjectX',
        portfolio: 'Portfolio A',
        jiraId: 'J-UPDATE-1',
        developmentStatus: 'In Progress',
      });
      entryId = created.id!;
    });

    it('should update specified fields and return updated entry', () => {
      const updated = repo.updateEntry(entryId, { developmentStatus: 'Complete' });
      expect(updated).not.toBeNull();
      expect(updated!.developmentStatus).toBe('Complete');
      expect(updated!.team).toBe('Team Alpha');
    });

    it('should update multiple fields at once', () => {
      const updated = repo.updateEntry(entryId, {
        team: 'Team Beta',
        project: 'ProjectY',
        developmentStatus: 'Done',
      });
      expect(updated!.team).toBe('Team Beta');
      expect(updated!.project).toBe('ProjectY');
      expect(updated!.developmentStatus).toBe('Done');
    });

    it('should return null for non-existent id', () => {
      const updated = repo.updateEntry(99999, { team: 'New' });
      expect(updated).toBeNull();
    });

    it('should return current entry when no fields provided', () => {
      const updated = repo.updateEntry(entryId, {});
      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(entryId);
      expect(updated!.team).toBe('Team Alpha');
    });

    it('should allow setting a field to null', () => {
      const updated = repo.updateEntry(entryId, { developmentStatus: null });
      expect(updated).not.toBeNull();
      expect(updated!.developmentStatus).toBeNull();
    });
  });

  describe('deleteEntry', () => {
    let entryId: number;

    beforeEach(() => {
      const created = repo.createEntry({
        team: 'Team Alpha',
        track: 'Track1',
        project: 'ProjectX',
        portfolio: 'Portfolio A',
        jiraId: 'J-DELETE-1',
      });
      entryId = created.id!;
    });

    it('should delete an existing entry and return true', () => {
      const result = repo.deleteEntry(entryId);
      expect(result).toBe(true);

      // Verify it's gone
      const entries = repo.getEntries(100, 0);
      expect(entries.entries.find(e => e.id === entryId)).toBeUndefined();
    });

    it('should return false for non-existent id', () => {
      const result = repo.deleteEntry(99999);
      expect(result).toBe(false);
    });

    it('should not affect other entries', () => {
      const created2 = repo.createEntry({
        team: 'Team Beta',
        track: 'Track2',
        project: 'ProjectY',
        portfolio: 'Portfolio B',
        jiraId: 'J-DELETE-2',
      });

      repo.deleteEntry(entryId);

      const entries = repo.getEntries(100, 0);
      expect(entries.entries).toHaveLength(1);
      expect(entries.entries[0].id).toBe(created2.id);
    });
  });
});
