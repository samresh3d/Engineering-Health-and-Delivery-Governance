import type Database from 'better-sqlite3';
import type { SprintDataRow, AdminAnalytics, TeamSummary, PaginatedEntries } from '../types/index.js';
import { getDatabase } from '../database/connection.js';

export interface TeamDetail {
  team: string;
  portfolio: string;
  totalEntries: number;
  distinctProjects: number;
  entries: SprintDataRow[];
}

/** Allowed column names for sorting to prevent SQL injection */
const ALLOWED_SORT_COLUMNS = [
  'id', 'team', 'track', 'project', 'portfolio', 'jira_id',
  'status', 'development_status', 'production_status',
  'dev_start_date', 'dev_end_date', 'ingested_at',
  'estimated_effort_with_ai', 'estimated_effort_without_ai',
  'actual_effort_with_ai', 'ai_used', 'resources',
  'uat_delivery_date', 'uat_delivery_target',
  'go_live_planned_date', 'go_live_date',
  'rollback', 'sno', 'upload_id',
];

/**
 * Maps a database row (snake_case) to a SprintDataRow (camelCase).
 */
function mapRowToSprintData(row: Record<string, unknown>): SprintDataRow {
  return {
    id: row.id as number,
    uploadId: row.upload_id as string,
    sno: (row.sno as number) ?? null,
    team: row.team as string,
    track: row.track as string,
    project: row.project as string,
    portfolio: row.portfolio as string,
    status: (row.status as string) ?? null,
    itemsList: (row.items_list as string) ?? null,
    walkthroughGivenOn: (row.walkthrough_given_on as string) ?? null,
    jiraId: row.jira_id as string,
    estimatedEffortWithAi: (row.estimated_effort_with_ai as number) ?? null,
    estimatedEffortWithoutAi: (row.estimated_effort_without_ai as number) ?? null,
    actualEffortWithAi: (row.actual_effort_with_ai as number) ?? null,
    aiUsed: (row.ai_used as 'Y' | 'N') ?? null,
    devStartDate: (row.dev_start_date as string) ?? null,
    devEndDate: (row.dev_end_date as string) ?? null,
    developmentStatus: (row.development_status as string) ?? null,
    uatDeliveryDate: (row.uat_delivery_date as string) ?? null,
    uatDeliveryTarget: (row.uat_delivery_target as string) ?? null,
    resources: (row.resources as string) ?? null,
    goLivePlannedDate: (row.go_live_planned_date as string) ?? null,
    goLiveDate: (row.go_live_date as string) ?? null,
    productionStatus: (row.production_status as string) ?? null,
    rollback: (row.rollback as 'Y' | 'N') ?? null,
    rollbackReason: (row.rollback_reason as string) ?? null,
    storyDropReason: (row.story_drop_reason as string) ?? null,
    ingestedAt: row.ingested_at as string,
  };
}

/**
 * Repository handling admin panel data operations.
 * Uses better-sqlite3 synchronous API.
 */
export class AdminRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Get analytics summary: total teams, total entries, recent uploads (7 days), pending items.
   */
  getAnalytics(): AdminAnalytics {
    const teamCount = this.db.prepare(
      'SELECT COUNT(DISTINCT team) as count FROM sprint_data'
    ).get() as { count: number };

    const entryCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM sprint_data'
    ).get() as { count: number };

    const recentUploads = this.db.prepare(
      `SELECT COUNT(*) as count FROM uploads
       WHERE uploaded_at >= datetime('now', '-7 days')`
    ).get() as { count: number };

    const pendingItems = this.db.prepare(
      `SELECT COUNT(*) as count FROM sprint_data
       WHERE development_status IS NULL OR development_status = ''`
    ).get() as { count: number };

    return {
      totalTeams: teamCount.count,
      totalEntries: entryCount.count,
      recentUploads: recentUploads.count,
      pendingItems: pendingItems.count,
    };
  }

  /**
   * Get distinct teams with entry counts and portfolio.
   * Supports optional case-insensitive search on team name and portfolio filter.
   */
  getTeams(search?: string, portfolio?: string): TeamSummary[] {
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (search) {
      conditions.push('team LIKE @search');
      params.search = `%${search}%`;
    }

    if (portfolio) {
      conditions.push('portfolio = @portfolio');
      params.portfolio = portfolio;
    }

    let sql = `SELECT team, portfolio, COUNT(*) as entryCount FROM sprint_data`;
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' GROUP BY team, portfolio ORDER BY team ASC';

    const rows = this.db.prepare(sql).all(params) as Array<{
      team: string;
      portfolio: string;
      entryCount: number;
    }>;

    return rows.map(row => ({
      team: row.team,
      portfolio: row.portfolio,
      entryCount: row.entryCount,
    }));
  }

  /**
   * Get detailed info for a specific team: entries, total count, distinct projects.
   */
  getTeamDetail(teamName: string): TeamDetail | null {
    const entries = this.db.prepare(
      'SELECT * FROM sprint_data WHERE team = @teamName ORDER BY id ASC'
    ).all({ teamName }) as Record<string, unknown>[];

    if (entries.length === 0) {
      return null;
    }

    const mappedEntries = entries.map(mapRowToSprintData);

    const projectCount = this.db.prepare(
      'SELECT COUNT(DISTINCT project) as count FROM sprint_data WHERE team = @teamName'
    ).get({ teamName }) as { count: number };

    return {
      team: teamName,
      portfolio: mappedEntries[0].portfolio,
      totalEntries: mappedEntries.length,
      distinctProjects: projectCount.count,
      entries: mappedEntries,
    };
  }

  /**
   * Get paginated entries with optional sorting.
   * Sort parameter is validated against allowed columns to prevent SQL injection.
   */
  getEntries(limit: number, offset: number, sort?: string): PaginatedEntries {
    const totalResult = this.db.prepare(
      'SELECT COUNT(*) as count FROM sprint_data'
    ).get() as { count: number };

    let orderBy = 'id ASC';
    if (sort) {
      // Validate sort column to prevent SQL injection
      const sortLower = sort.toLowerCase();
      if (ALLOWED_SORT_COLUMNS.includes(sortLower)) {
        orderBy = `${sortLower} ASC`;
      }
    }

    const rows = this.db.prepare(
      `SELECT * FROM sprint_data ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
    ).all({ limit, offset }) as Record<string, unknown>[];

    return {
      entries: rows.map(mapRowToSprintData),
      total: totalResult.count,
      limit,
      offset,
    };
  }

  /**
   * Ensures the 'admin-created' upload record exists for admin-created entries.
   */
  private ensureAdminUploadExists(): void {
    const existing = this.db.prepare(
      "SELECT id FROM uploads WHERE id = 'admin-created'"
    ).get();
    if (!existing) {
      this.db.prepare(
        `INSERT INTO uploads (id, file_name, uploaded_by, rows_ingested, status)
         VALUES ('admin-created', 'admin-panel', 'admin', 0, 'success')`
      ).run();
    }
  }

  /**
   * Create a new sprint data entry.
   */
  createEntry(data: Partial<SprintDataRow>): SprintDataRow {
    const uploadId = data.uploadId ?? 'admin-created';
    if (uploadId === 'admin-created') {
      this.ensureAdminUploadExists();
    }

    const stmt = this.db.prepare(`
      INSERT INTO sprint_data (
        upload_id, sno, team, track, project, portfolio,
        status, items_list, walkthrough_given_on, jira_id,
        estimated_effort_with_ai, estimated_effort_without_ai, actual_effort_with_ai, ai_used,
        dev_start_date, dev_end_date, development_status,
        uat_delivery_date, uat_delivery_target, resources,
        go_live_planned_date, go_live_date, production_status,
        rollback, rollback_reason, story_drop_reason, ingested_at
      ) VALUES (
        @uploadId, @sno, @team, @track, @project, @portfolio,
        @status, @itemsList, @walkthroughGivenOn, @jiraId,
        @estimatedEffortWithAi, @estimatedEffortWithoutAi, @actualEffortWithAi, @aiUsed,
        @devStartDate, @devEndDate, @developmentStatus,
        @uatDeliveryDate, @uatDeliveryTarget, @resources,
        @goLivePlannedDate, @goLiveDate, @productionStatus,
        @rollback, @rollbackReason, @storyDropReason, @ingestedAt
      )
    `);

    const now = new Date().toISOString();
    const result = stmt.run({
      uploadId,
      sno: data.sno ?? null,
      team: data.team,
      track: data.track,
      project: data.project,
      portfolio: data.portfolio,
      status: data.status ?? null,
      itemsList: data.itemsList ?? null,
      walkthroughGivenOn: data.walkthroughGivenOn ?? null,
      jiraId: data.jiraId,
      estimatedEffortWithAi: data.estimatedEffortWithAi ?? null,
      estimatedEffortWithoutAi: data.estimatedEffortWithoutAi ?? null,
      actualEffortWithAi: data.actualEffortWithAi ?? null,
      aiUsed: data.aiUsed ?? null,
      devStartDate: data.devStartDate ?? null,
      devEndDate: data.devEndDate ?? null,
      developmentStatus: data.developmentStatus ?? null,
      uatDeliveryDate: data.uatDeliveryDate ?? null,
      uatDeliveryTarget: data.uatDeliveryTarget ?? null,
      resources: data.resources ?? null,
      goLivePlannedDate: data.goLivePlannedDate ?? null,
      goLiveDate: data.goLiveDate ?? null,
      productionStatus: data.productionStatus ?? null,
      rollback: data.rollback ?? null,
      rollbackReason: data.rollbackReason ?? null,
      storyDropReason: data.storyDropReason ?? null,
      ingestedAt: data.ingestedAt ?? now,
    });

    const insertedId = result.lastInsertRowid as number;
    const row = this.db.prepare('SELECT * FROM sprint_data WHERE id = @id').get({ id: insertedId }) as Record<string, unknown>;
    return mapRowToSprintData(row);
  }

  /**
   * Update an existing sprint data entry by ID.
   * Returns the updated entry, or null if not found.
   */
  updateEntry(id: number, data: Partial<SprintDataRow>): SprintDataRow | null {
    // Check if entry exists
    const existing = this.db.prepare('SELECT * FROM sprint_data WHERE id = @id').get({ id }) as Record<string, unknown> | undefined;
    if (!existing) {
      return null;
    }

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    const fieldMappings: Record<string, string> = {
      sno: 'sno',
      team: 'team',
      track: 'track',
      project: 'project',
      portfolio: 'portfolio',
      status: 'status',
      itemsList: 'items_list',
      walkthroughGivenOn: 'walkthrough_given_on',
      jiraId: 'jira_id',
      estimatedEffortWithAi: 'estimated_effort_with_ai',
      estimatedEffortWithoutAi: 'estimated_effort_without_ai',
      actualEffortWithAi: 'actual_effort_with_ai',
      aiUsed: 'ai_used',
      devStartDate: 'dev_start_date',
      devEndDate: 'dev_end_date',
      developmentStatus: 'development_status',
      uatDeliveryDate: 'uat_delivery_date',
      uatDeliveryTarget: 'uat_delivery_target',
      resources: 'resources',
      goLivePlannedDate: 'go_live_planned_date',
      goLiveDate: 'go_live_date',
      productionStatus: 'production_status',
      rollback: 'rollback',
      rollbackReason: 'rollback_reason',
      storyDropReason: 'story_drop_reason',
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMappings)) {
      if (camelKey in data) {
        setClauses.push(`${snakeKey} = @${camelKey}`);
        params[camelKey] = (data as Record<string, unknown>)[camelKey] ?? null;
      }
    }

    if (setClauses.length === 0) {
      // Nothing to update, return current entry
      return mapRowToSprintData(existing);
    }

    const sql = `UPDATE sprint_data SET ${setClauses.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(params);

    const updated = this.db.prepare('SELECT * FROM sprint_data WHERE id = @id').get({ id }) as Record<string, unknown>;
    return mapRowToSprintData(updated);
  }

  /**
   * Delete a sprint data entry by ID.
   * Returns true if deleted, false if not found.
   */
  deleteEntry(id: number): boolean {
    const result = this.db.prepare('DELETE FROM sprint_data WHERE id = @id').run({ id });
    return result.changes > 0;
  }
}
