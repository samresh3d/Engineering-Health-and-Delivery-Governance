/**
 * Type definitions for the Engineering Delivery Governance feature.
 * These interfaces match the API response contracts for the Leadership
 * and EM dashboards, period switching, and drill-down navigation.
 */

import { RagStatus } from './index';

/** Available time period options for period switching */
export type PeriodType = 'month' | 'quarter' | 'year';

/** Leadership dashboard API response */
export interface LeadershipDashboardData {
  periods: {
    month: PeriodMetrics;
    quarter: PeriodMetrics;
    year: PeriodMetrics;
  };
  teams: TeamCardData[];
}

/** Engineering Manager dashboard API response */
export interface EmDashboardData {
  periods: {
    month: PeriodMetrics;
    quarter: PeriodMetrics;
    year: PeriodMetrics;
  };
  divisions: DivisionMetrics[];
  projects: ProjectByDivision[];
}

/** Metrics for a single time period (month, quarter, or year) */
export interface PeriodMetrics {
  kpis: KpiTileData[];
  healthScore: HealthScoreData | null;
}

/** Individual KPI tile data displayed on dashboards */
export interface KpiTileData {
  kpiName: string;
  value: number | null;
  ragStatus: RagStatus;
  percentChange: number | null;
  trendDirection: 'up' | 'down' | 'stable' | null;
  insufficientData: boolean;
}

/** Team summary card data for the Leadership dashboard */
export interface TeamCardData {
  teamName: string;
  healthScore: HealthScoreData | null;
  activeDivisions: number;
  activeProjects: number;
  sparkline: number[];
}

/** Composite health score with RAG classification */
export interface HealthScoreData {
  value: number;
  ragStatus: RagStatus;
}

/** Division-level metrics for drill-down and EM dashboard */
export interface DivisionMetrics {
  divisionName: string;
  kpis: KpiTileData[];
  healthScore: HealthScoreData | null;
}

/** Project metrics grouped by division */
export interface ProjectByDivision {
  divisionName: string;
  projectName: string;
  sprintPredictability: number | null;
  deliveryEfficiency: number | null;
  ragStatus: RagStatus;
}

/** Client-side governance state for dashboard views */
export interface GovernanceState {
  /** Pre-fetched data for all periods */
  data: LeadershipDashboardData | EmDashboardData | null;

  /** Currently selected period */
  selectedPeriod: PeriodType;

  /** Currently expanded team (Leadership view) */
  expandedTeam: string | null;

  /** Currently expanded division within expanded team */
  expandedDivision: string | null;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: string | null;
}
