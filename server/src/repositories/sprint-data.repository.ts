import type Database from 'better-sqlite3';
import type { SprintDataRow, KpiFilter } from '../types/index.js';
import type { ISprintDataRepository } from './interfaces.js';
import { getDatabase } from '../database/connection.js';

const MAX_ROWS_PER_UPLOAD = 10_000;

/**
 * Maps a database row (snake_case) to a SprintDataRow (camelCase).
 */
function mapRowToSprintData(row: Record<string, unknown>): SprintDataRow {
  return {
    id: row.id as number,
    uploadId: row.upload_id as string,
    sno: row.sno as number,
    team: row.team as string,
    track: row.track as string,
    project: row.project as string,
    portfolio: row.portfolio as string,
    status: (row.status as string) ?? null,
    itemsList: (row.items_list as string) ?? null,
    walkthroughGivenOn: (row.walkthrough_given_on as string) ?? null,
    jiraId: row.jira_id as string,
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
 * SQLite implementation of the sprint data repository using better-sqlite3.
 */
export class SprintDataRepository implements ISprintDataRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Bulk upsert sprint data rows within a transaction.
   * Uses INSERT OR REPLACE on UNIQUE(jira_id, team) constraint.
   * Rejects with error if rows exceed 10,000 limit.
   */
  async bulkUpsert(rows: SprintDataRow[], uploadId: string): Promise<number> {
    if (rows.length > MAX_ROWS_PER_UPLOAD) {
      throw new Error(
        `Row limit exceeded: received ${rows.length} rows, maximum allowed is ${MAX_ROWS_PER_UPLOAD}`
      );
    }

    if (rows.length === 0) {
      return 0;
    }

    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO sprint_data (
        upload_id, sno, team, track, project, portfolio,
        status, items_list, walkthrough_given_on, jira_id,
        estimated_effort_without_ai, actual_effort_with_ai, ai_used,
        dev_start_date, dev_end_date, development_status,
        uat_delivery_date, uat_delivery_target, resources,
        go_live_planned_date, go_live_date, production_status,
        rollback, rollback_reason, story_drop_reason, ingested_at
      ) VALUES (
        @uploadId, @sno, @team, @track, @project, @portfolio,
        @status, @itemsList, @walkthroughGivenOn, @jiraId,
        @estimatedEffortWithoutAi, @actualEffortWithAi, @aiUsed,
        @devStartDate, @devEndDate, @developmentStatus,
        @uatDeliveryDate, @uatDeliveryTarget, @resources,
        @goLivePlannedDate, @goLiveDate, @productionStatus,
        @rollback, @rollbackReason, @storyDropReason, @ingestedAt
      )
    `);

    const upsertAll = this.db.transaction((dataRows: SprintDataRow[]) => {
      let count = 0;
      for (const row of dataRows) {
        insertStmt.run({
          uploadId: uploadId,
          sno: row.sno,
          team: row.team,
          track: row.track,
          project: row.project,
          portfolio: row.portfolio,
          status: row.status,
          itemsList: row.itemsList,
          walkthroughGivenOn: row.walkthroughGivenOn,
          jiraId: row.jiraId,
          estimatedEffortWithoutAi: row.estimatedEffortWithoutAi,
          actualEffortWithAi: row.actualEffortWithAi,
          aiUsed: row.aiUsed,
          devStartDate: row.devStartDate,
          devEndDate: row.devEndDate,
          developmentStatus: row.developmentStatus,
          uatDeliveryDate: row.uatDeliveryDate,
          uatDeliveryTarget: row.uatDeliveryTarget,
          resources: row.resources,
          goLivePlannedDate: row.goLivePlannedDate,
          goLiveDate: row.goLiveDate,
          productionStatus: row.productionStatus,
          rollback: row.rollback,
          rollbackReason: row.rollbackReason,
          storyDropReason: row.storyDropReason,
          ingestedAt: row.ingestedAt,
        });
        count++;
      }
      return count;
    });

    return upsertAll(rows);
  }

  /**
   * Find sprint data rows matching the provided filter.
   * Builds WHERE clauses dynamically based on which filter fields are provided.
   * Date range filtering applies to dev_start_date.
   */
  async findByFilter(filter: KpiFilter): Promise<SprintDataRow[]> {
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    if (filter.team) {
      conditions.push('team = @team');
      params.team = filter.team;
    }

    if (filter.portfolio) {
      conditions.push('portfolio = @portfolio');
      params.portfolio = filter.portfolio;
    }

    if (filter.project) {
      conditions.push('project = @project');
      params.project = filter.project;
    }

    if (filter.startDate) {
      conditions.push('dev_start_date >= @startDate');
      params.startDate = filter.startDate;
    }

    if (filter.endDate) {
      conditions.push('dev_start_date <= @endDate');
      params.endDate = filter.endDate;
    }

    let sql = 'SELECT * FROM sprint_data';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY id ASC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as Record<string, unknown>[];
    return rows.map(mapRowToSprintData);
  }

  /**
   * Find a single sprint data row by JIRA ID and team.
   */
  async findByJiraIdAndTeam(jiraId: string, team: string): Promise<SprintDataRow | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM sprint_data WHERE jira_id = @jiraId AND team = @team'
    );
    const row = stmt.get({ jiraId, team }) as Record<string, unknown> | undefined;
    return row ? mapRowToSprintData(row) : null;
  }

  /**
   * Count the number of rows associated with a specific upload.
   */
  async countByUpload(uploadId: string): Promise<number> {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM sprint_data WHERE upload_id = @uploadId'
    );
    const result = stmt.get({ uploadId }) as { count: number };
    return result.count;
  }
}
