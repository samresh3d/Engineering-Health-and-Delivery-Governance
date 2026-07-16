/**
 * Governance domain types for the Engineering Delivery Governance feature.
 * These types support the Leadership Dashboard, EM Dashboard,
 * division management, and period-based metric aggregation.
 */

import type { RagStatus } from './index';

/** Time period granularity for metric aggregation */
export type PeriodType = 'month' | 'quarter' | 'year';

/** A division (presentation-layer rename of "track") within a team */
export interface Division {
  id: number;
  name: string; // The track value (displayed as "division")
  teamId: string;
  projectCount: number;
  createdAt: string;
}

/** A division with its assigned project names */
export interface DivisionWithProjects {
  divisionName: string;
  projects: string[];
}

/** Leadership Dashboard response containing all period data and team summaries */
export interface LeadershipDashboardData {
  periods: {
    month: PeriodMetrics;
    quarter: PeriodMetrics;
    year: PeriodMetrics;
  };
  teams: TeamCardData[];
}

/** EM Dashboard response containing team-scoped period data, divisions, and projects */
export interface EmDashboardData {
  periods: {
    month: PeriodMetrics;
    quarter: PeriodMetrics;
    year: PeriodMetrics;
  };
  divisions: DivisionMetrics[];
  projects: ProjectByDivision[];
}

/** Aggregated KPI metrics and health score for a given period */
export interface PeriodMetrics {
  kpis: KpiTileData[];
  healthScore: HealthScoreData | null;
}

/** Data for a single KPI tile on the dashboard */
export interface KpiTileData {
  kpiName: string;
  value: number | null;
  ragStatus: RagStatus;
  percentChange: number | null;
  trendDirection: 'up' | 'down' | 'stable' | null;
  insufficientData: boolean;
}

/** Summary data for a Team Card on the Leadership Dashboard */
export interface TeamCardData {
  teamName: string;
  healthScore: HealthScoreData | null;
  activeDivisions: number;
  activeProjects: number;
  sparkline: number[]; // Last 3 period health scores
}

/** Composite health score with RAG classification */
export interface HealthScoreData {
  value: number;
  ragStatus: RagStatus;
}

/** Division-level metrics including KPIs and health score */
export interface DivisionMetrics {
  divisionName: string;
  kpis: KpiTileData[];
  healthScore: HealthScoreData | null;
}

/** Project-level metrics within a division */
export interface ProjectByDivision {
  divisionName: string;
  projectName: string;
  sprintPredictability: number | null;
  deliveryEfficiency: number | null;
  ragStatus: RagStatus;
}
