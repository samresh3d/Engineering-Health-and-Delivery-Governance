import type { KpiName, KpiResult, KpiFilter } from '../types/index';
import type {
  AnalyticsFilter,
  DataScope,
  KpiScorecard,
  TeamComparisonRow,
  TrendDataPoint,
} from '../types/rbac-analytics.types';
import type { IKpiEngineService, IRagService } from './kpi-engine.service';
import type { ISprintDataRepository, IConfigRepository } from '../repositories/interfaces';
import { convertPeriodToDateRange, type PeriodType } from '../utils/period-converter';

/** All 9 KPI names in canonical order */
const ALL_KPI_NAMES: KpiName[] = [
  'sprint_commitment',
  'release_success_rate',
  'deployment_frequency',
  'capacity_utilization',
  'ai_efficiency',
  'uat_predictability',
  'dev_cycle_time',
  'story_drop_rate',
  'rollback_rate',
];

/**
 * Interface for the Analytics Service.
 */
export interface IAnalyticsService {
  /** Get KPI scorecard for current filters and scope */
  getScorecard(filter: AnalyticsFilter, userScope: DataScope): Promise<KpiScorecard>;

  /** Get team comparison data (Leadership/Super_Admin only) */
  getTeamComparison(filter: AnalyticsFilter): Promise<TeamComparisonRow[]>;

  /** Get trend data for a KPI over time */
  getTrends(kpiName: string, filter: AnalyticsFilter, userScope: DataScope): Promise<TrendDataPoint[]>;

  /** Get historical trend lines for multiple KPIs */
  getHistoricalTrends(filter: AnalyticsFilter, userScope: DataScope): Promise<Record<string, TrendDataPoint[]>>;
}

/**
 * Analytics Service implementation.
 *
 * Provides KPI scorecards, team comparisons, and trend data
 * with data scope filtering based on user context.
 */
export class AnalyticsService implements IAnalyticsService {
  constructor(
    private readonly kpiEngine: IKpiEngineService,
    private readonly sprintDataRepo: ISprintDataRepository,
    private readonly configRepo: IConfigRepository,
    private readonly ragService?: IRagService
  ) {}

  /**
   * Get KPI scorecard for the given filters and user scope.
   * Returns exactly 9 KPIs with values and RAG status.
   */
  async getScorecard(filter: AnalyticsFilter, userScope: DataScope): Promise<KpiScorecard> {
    const kpiFilter = this.buildKpiFilter(filter, userScope);
    const periodLabel = this.buildPeriodLabel(filter);
    const scope = userScope.type === 'single_team' && userScope.teamId
      ? userScope.teamId
      : 'Organization';

    const kpis = await this.kpiEngine.calculateAll(kpiFilter);

    return {
      kpis,
      periodLabel,
      scope,
    };
  }

  /**
   * Get team comparison data — one row per team with all KPI values.
   * Intended for Leadership/Super_Admin users only.
   * When functionName is provided in filter, only teams of that Function are compared.
   */
  async getTeamComparison(filter: AnalyticsFilter): Promise<TeamComparisonRow[]> {
    const teams = await this.configRepo.getAllTeams();
    const rows: TeamComparisonRow[] = [];

    for (const team of teams) {
      const teamFilter: KpiFilter = {
        team: team.teamName,
        functionName: filter.functionName,
        startDate: filter.startDate,
        endDate: filter.endDate,
      };

      // Apply period-to-date conversion if needed
      if (filter.period && filter.period !== 'custom') {
        const dateRange = this.resolvePeriodDates(filter);
        if (dateRange) {
          teamFilter.startDate = dateRange.startDate;
          teamFilter.endDate = dateRange.endDate;
        }
      }

      const kpiResults = await this.kpiEngine.calculateAll(teamFilter);
      const kpis: Record<string, { value: number | null; ragStatus: string }> = {};

      for (const result of kpiResults) {
        kpis[result.kpiName] = {
          value: result.value,
          ragStatus: result.ragStatus,
        };
      }

      rows.push({
        team: team.teamName,
        kpis,
      });
    }

    return rows;
  }

  /**
   * Get trend data for a single KPI over consecutive time periods.
   * Returns data points for each period in the selected time range.
   * Returns empty array if fewer than 2 data points exist.
   * Passes functionName through for Function-level filtering.
   */
  async getTrends(
    kpiName: string,
    filter: AnalyticsFilter,
    userScope: DataScope
  ): Promise<TrendDataPoint[]> {
    const periods = this.generatePeriods(filter);

    if (periods.length < 2) {
      return [];
    }

    const teamFilter = userScope.type === 'single_team' && userScope.teamId
      ? userScope.teamId
      : filter.team;

    const dataPoints: TrendDataPoint[] = [];

    for (const period of periods) {
      const kpiFilter: KpiFilter = {
        team: teamFilter,
        functionName: filter.functionName,
        startDate: period.startDate,
        endDate: period.endDate,
      };

      const result = await this.kpiEngine.calculateSingle(kpiName as KpiName, kpiFilter);

      dataPoints.push({
        period: period.label,
        value: result.value,
        ragStatus: result.ragStatus,
      });
    }

    return dataPoints;
  }

  /**
   * Get historical trend lines for all KPIs.
   * Returns a record mapping each KPI name to its trend data points.
   * Returns empty arrays for KPIs with fewer than 2 data points.
   */
  async getHistoricalTrends(
    filter: AnalyticsFilter,
    userScope: DataScope
  ): Promise<Record<string, TrendDataPoint[]>> {
    const result: Record<string, TrendDataPoint[]> = {};

    for (const kpiName of ALL_KPI_NAMES) {
      result[kpiName] = await this.getTrends(kpiName, filter, userScope);
    }

    return result;
  }

  /**
   * Build a KpiFilter from AnalyticsFilter and DataScope.
   * Applies team scoping, function filtering, and period-to-date conversion.
   */
  private buildKpiFilter(filter: AnalyticsFilter, userScope: DataScope): KpiFilter {
    const kpiFilter: KpiFilter = {};

    // Apply function name filtering (Req 5.4, 5.5, 5.6, 11.1, 11.3)
    if (filter.functionName) {
      kpiFilter.functionName = filter.functionName;
    }

    // Apply data scope filtering
    if (userScope.type === 'single_team' && userScope.teamId) {
      kpiFilter.team = userScope.teamId;
    } else if (filter.team) {
      kpiFilter.team = filter.team;
    }

    // Apply date range: resolve period or use explicit dates
    if (filter.startDate && filter.endDate) {
      kpiFilter.startDate = filter.startDate;
      kpiFilter.endDate = filter.endDate;
    } else if (filter.period) {
      const dateRange = this.resolvePeriodDates(filter);
      if (dateRange) {
        kpiFilter.startDate = dateRange.startDate;
        kpiFilter.endDate = dateRange.endDate;
      }
    }

    return kpiFilter;
  }

  /**
   * Resolve period filter to a concrete date range using the period converter utility.
   */
  private resolvePeriodDates(filter: AnalyticsFilter): { startDate: string; endDate: string } | null {
    if (!filter.period) return null;

    if (filter.period === 'custom') {
      if (filter.startDate && filter.endDate) {
        return { startDate: filter.startDate, endDate: filter.endDate };
      }
      return null;
    }

    // For month/quarter/year, convert using the utility
    const now = new Date();
    const result = convertPeriodToDateRange(filter.period as PeriodType, {
      month: now.getMonth() + 1,
      quarter: Math.ceil((now.getMonth() + 1) / 3),
      year: now.getFullYear(),
    });

    if (result.success && result.dateRange) {
      return result.dateRange;
    }

    return null;
  }

  /**
   * Build a human-readable period label from the filter.
   */
  private buildPeriodLabel(filter: AnalyticsFilter): string {
    if (filter.period === 'custom' && filter.startDate && filter.endDate) {
      return `${filter.startDate} to ${filter.endDate}`;
    }

    if (filter.period === 'month') {
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    if (filter.period === 'quarter') {
      const now = new Date();
      const quarter = Math.ceil((now.getMonth() + 1) / 3);
      return `Q${quarter} ${now.getFullYear()}`;
    }

    if (filter.period === 'year') {
      return `${new Date().getFullYear()}`;
    }

    if (filter.startDate && filter.endDate) {
      return `${filter.startDate} to ${filter.endDate}`;
    }

    return 'All Time';
  }

  /**
   * Generate consecutive time periods based on the filter.
   * Returns an array of period definitions with label, startDate, endDate.
   * Uses monthly periods by default for trend analysis.
   */
  private generatePeriods(filter: AnalyticsFilter): Array<{ label: string; startDate: string; endDate: string }> {
    let startDate: Date;
    let endDate: Date;

    if (filter.startDate && filter.endDate) {
      startDate = new Date(filter.startDate + 'T00:00:00Z');
      endDate = new Date(filter.endDate + 'T00:00:00Z');
    } else if (filter.period && filter.period !== 'custom') {
      const dateRange = this.resolvePeriodDates(filter);
      if (!dateRange) return [];
      startDate = new Date(dateRange.startDate + 'T00:00:00Z');
      endDate = new Date(dateRange.endDate + 'T00:00:00Z');
    } else {
      // Default: last 6 months
      endDate = new Date();
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);
    }

    // Determine granularity based on the span
    const msPerDay = 24 * 60 * 60 * 1000;
    const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);

    if (spanDays <= 0) return [];

    // Use quarterly periods if span > 365 days, otherwise monthly
    const useQuarters = spanDays > 365;

    const periods: Array<{ label: string; startDate: string; endDate: string }> = [];

    if (useQuarters) {
      // Generate quarterly periods
      let current = new Date(startDate);
      // Align to quarter start
      const quarterStartMonth = Math.floor(current.getUTCMonth() / 3) * 3;
      current = new Date(Date.UTC(current.getUTCFullYear(), quarterStartMonth, 1));

      while (current.getTime() <= endDate.getTime()) {
        const year = current.getUTCFullYear();
        const month = current.getUTCMonth();
        const quarter = Math.floor(month / 3) + 1;

        const periodEnd = new Date(Date.UTC(year, month + 3, 0));

        const pStart = this.formatDateUTC(current);
        const pEnd = this.formatDateUTC(periodEnd > endDate ? endDate : periodEnd);

        periods.push({
          label: `Q${quarter} ${year}`,
          startDate: pStart,
          endDate: pEnd,
        });

        current = new Date(Date.UTC(year, month + 3, 1));
      }
    } else {
      // Generate monthly periods
      let current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));

      while (current.getTime() <= endDate.getTime()) {
        const year = current.getUTCFullYear();
        const month = current.getUTCMonth();

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const lastDay = new Date(Date.UTC(year, month + 1, 0));

        const pStart = this.formatDateUTC(current);
        const pEnd = this.formatDateUTC(lastDay > endDate ? endDate : lastDay);

        periods.push({
          label: `${monthNames[month]} ${year}`,
          startDate: pStart,
          endDate: pEnd,
        });

        current = new Date(Date.UTC(year, month + 1, 1));
      }
    }

    return periods;
  }

  /**
   * Format a Date object to YYYY-MM-DD string in UTC.
   */
  private formatDateUTC(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
