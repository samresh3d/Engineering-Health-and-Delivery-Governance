import type {
  LeadershipDashboardData,
  EmDashboardData,
  DivisionMetrics,
  ProjectByDivision,
  KpiTileData,
  HealthScoreData,
} from '../types/governance.types';

/**
 * Interface for the Governance Dashboard Service.
 * Orchestrates pre-fetch of all period data for Leadership and EM dashboards.
 */
export interface IGovernanceDashboardService {
  /** Get Leadership dashboard data with all period aggregations */
  getLeadershipDashboard(): Promise<LeadershipDashboardData>;

  /** Get EM dashboard data for a specific team with all period aggregations */
  getEmDashboard(teamId: string): Promise<EmDashboardData>;

  /** Get team drill-down data: divisions with metrics and projects */
  getTeamDrillDown(teamId: string): Promise<TeamDrillDownData>;

  /** Get division drill-down data: detailed metrics with project breakdowns */
  getDivisionDrillDown(teamId: string, divisionName: string): Promise<DivisionDrillDownData>;
}

/** Team drill-down response shape */
export interface TeamDrillDownData {
  teamName: string;
  divisions: Array<{
    divisionName: string;
    kpis: KpiTileData[];
    healthScore: HealthScoreData | null;
    projects: Array<{
      projectName: string;
      kpis: KpiTileData[];
      ragStatus: string;
    }>;
  }>;
}

/** Division drill-down response shape */
export interface DivisionDrillDownData {
  teamName: string;
  divisionName: string;
  kpis: KpiTileData[];
  healthScore: HealthScoreData | null;
  projects: Array<{
    projectName: string;
    sprintPredictability: number | null;
    deliveryEfficiency: number | null;
    ragStatus: string;
    kpis: KpiTileData[];
  }>;
}

/**
 * Governance Dashboard Service.
 * Orchestrates data fetching for Leadership and EM dashboards,
 * including period aggregation, health score computation, and team/division drill-down.
 *
 * This is a stub implementation — task 7.1 will provide the full logic.
 */
export class GovernanceDashboardService implements IGovernanceDashboardService {
  /**
   * Get Leadership dashboard data with all period aggregations.
   * Returns organization-wide KPIs for month/quarter/year, plus team cards.
   */
  async getLeadershipDashboard(): Promise<LeadershipDashboardData> {
    // TODO: Implement in task 7.1
    // Will use KpiEngineService + DivisionService to aggregate data
    return {
      periods: {
        month: { kpis: [], healthScore: null },
        quarter: { kpis: [], healthScore: null },
        year: { kpis: [], healthScore: null },
      },
      teams: [],
    };
  }

  /**
   * Get EM dashboard data for a specific team with all period aggregations.
   * Returns team-scoped KPIs, division breakdown, and project listing.
   */
  async getEmDashboard(teamId: string): Promise<EmDashboardData> {
    // TODO: Implement in task 7.1
    // Will use KpiEngineService + DivisionService scoped to teamId
    return {
      periods: {
        month: { kpis: [], healthScore: null },
        quarter: { kpis: [], healthScore: null },
        year: { kpis: [], healthScore: null },
      },
      divisions: [],
      projects: [],
    };
  }

  /**
   * Get team drill-down data: divisions with metrics and project breakdowns.
   */
  async getTeamDrillDown(teamId: string): Promise<TeamDrillDownData> {
    // TODO: Implement in task 7.1
    // Will fetch division-level KPIs and nested project data
    return {
      teamName: teamId,
      divisions: [],
    };
  }

  /**
   * Get division drill-down data: detailed metrics with project breakdowns.
   */
  async getDivisionDrillDown(teamId: string, divisionName: string): Promise<DivisionDrillDownData> {
    // TODO: Implement in task 7.1
    // Will fetch project-level metrics within a specific division
    return {
      teamName: teamId,
      divisionName,
      kpis: [],
      healthScore: null,
      projects: [],
    };
  }
}
