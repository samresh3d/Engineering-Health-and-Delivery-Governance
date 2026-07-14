import type Database from 'better-sqlite3';
import type { KpiComputedResult, KpiFilter, KpiName } from '../types/index.js';
import type { IKpiResultsRepository } from './interfaces.js';
import { getDatabase } from '../database/connection.js';

/**
 * Maps a database row (snake_case) to a KpiComputedResult (camelCase).
 */
function mapRowToKpiResult(row: Record<string, unknown>): KpiComputedResult {
  return {
    id: row.id as number,
    kpiName: row.kpi_name as KpiName,
    value: (row.value as number) ?? null,
    ragStatus: row.rag_status as KpiComputedResult['ragStatus'],
    percentChange: (row.percent_change as number) ?? null,
    team: (row.team as string) ?? null,
    portfolio: (row.portfolio as string) ?? null,
    sprint: (row.sprint as string) ?? null,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    calculatedAt: row.calculated_at as string,
    insufficientData: (row.insufficient_data as number) === 1,
  };
}

/**
 * SQLite implementation of the KPI results repository using better-sqlite3.
 */
export class KpiResultsRepository implements IKpiResultsRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  /**
   * Save a single KPI computed result.
   */
  async save(result: KpiComputedResult): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO kpi_results (
        kpi_name, value, rag_status, percent_change,
        team, portfolio, sprint,
        period_start, period_end, calculated_at, insufficient_data
      ) VALUES (
        @kpiName, @value, @ragStatus, @percentChange,
        @team, @portfolio, @sprint,
        @periodStart, @periodEnd, @calculatedAt, @insufficientData
      )
    `);

    stmt.run({
      kpiName: result.kpiName,
      value: result.value,
      ragStatus: result.ragStatus,
      percentChange: result.percentChange,
      team: result.team,
      portfolio: result.portfolio,
      sprint: result.sprint,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      calculatedAt: result.calculatedAt,
      insufficientData: result.insufficientData ? 1 : 0,
    });
  }

  /**
   * Save a batch of KPI computed results within a transaction for atomicity.
   */
  async saveBatch(results: KpiComputedResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    const stmt = this.db.prepare(`
      INSERT INTO kpi_results (
        kpi_name, value, rag_status, percent_change,
        team, portfolio, sprint,
        period_start, period_end, calculated_at, insufficient_data
      ) VALUES (
        @kpiName, @value, @ragStatus, @percentChange,
        @team, @portfolio, @sprint,
        @periodStart, @periodEnd, @calculatedAt, @insufficientData
      )
    `);

    const insertAll = this.db.transaction((rows: KpiComputedResult[]) => {
      for (const result of rows) {
        stmt.run({
          kpiName: result.kpiName,
          value: result.value,
          ragStatus: result.ragStatus,
          percentChange: result.percentChange,
          team: result.team,
          portfolio: result.portfolio,
          sprint: result.sprint,
          periodStart: result.periodStart,
          periodEnd: result.periodEnd,
          calculatedAt: result.calculatedAt,
          insufficientData: result.insufficientData ? 1 : 0,
        });
      }
    });

    insertAll(results);
  }

  /**
   * Find the latest KPI results matching the provided filter.
   * Returns most recently calculated results, grouped by kpi_name.
   */
  async findLatest(filter: KpiFilter): Promise<KpiComputedResult[]> {
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

    if (filter.startDate) {
      conditions.push('period_start >= @startDate');
      params.startDate = filter.startDate;
    }

    if (filter.endDate) {
      conditions.push('period_end <= @endDate');
      params.endDate = filter.endDate;
    }

    let whereClause = '';
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get the latest result per kpi_name using a correlated subquery
    const sql = `
      SELECT * FROM kpi_results r
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} calculated_at = (
        SELECT MAX(r2.calculated_at) FROM kpi_results r2
        WHERE r2.kpi_name = r.kpi_name
        ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      )
      ORDER BY calculated_at DESC
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params) as Record<string, unknown>[];
    return rows.map(mapRowToKpiResult);
  }

  /**
   * Find trend data for a specific KPI and team, limited to the specified number of periods.
   * Results are ordered by period_start DESC.
   */
  async findTrend(kpiName: KpiName, team: string, periods: number): Promise<KpiComputedResult[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM kpi_results
      WHERE kpi_name = @kpiName AND team = @team
      ORDER BY period_start DESC
      LIMIT @periods
    `);

    const rows = stmt.all({ kpiName, team, periods }) as Record<string, unknown>[];
    return rows.map(mapRowToKpiResult);
  }
}
