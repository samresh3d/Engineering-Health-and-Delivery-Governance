/**
 * Dashboard_Model and related types for the Leadership Dashboard.
 *
 * These types define the normalized, in-memory representation produced by the
 * ExcelParser and consumed by every service and view in the module. They are
 * intentionally schema-agnostic: teams, KPIs, periods, years, and dimensions
 * are all derived from the uploaded workbook's `KPIs` sheet content rather than
 * from a fixed schema.
 *
 * Absent metric values and absent KPI targets are represented as `null`
 * (Requirements 2.7, 2.8) so that parsing never terminates on missing cells.
 */

/** The Engineering Pillar a KPI is grouped under for health reporting. */
export type EngineeringPillar = 'Delivery' | 'Quality' | 'Sustainability' | 'Cost';

/** The direction in which a KPI value is considered "better". */
export type Direction = 'HigherIsBetter' | 'LowerIsBetter';

/** Health classification of a value against its target. */
export type HealthStatus = 'Green' | 'Amber' | 'Red' | 'Unknown';

/** An inclusive threshold band; a value within it classifies as Amber. */
export interface AmberBand {
  lower: number;
  upper: number;
}

/** A single month within a year. */
export interface Period {
  /** Calendar year, e.g. 2025. */
  year: number;
  /** Canonical month label as found in the sheet, e.g. "Jan" / "January". */
  month: string;
  /** Stable sort/lookup key, e.g. "2025-01". */
  key: string;
}

/** Definition of a KPI as discovered in the sheet. */
export interface KpiDefinition {
  name: string;
  /** Resolved via the pillars.ts mapping when known; `null` when unknown. */
  pillar: EngineeringPillar | null;
  /** Better-direction from the sheet or mapping default (HigherIsBetter). */
  direction: Direction;
  /** Absent target recorded as `null` (Req 2.8). */
  target: number | null;
  /** Present only when the sheet provides amber thresholds (Req 5.6). */
  amberBand: AmberBand | null;
}

/** One measured cell: a KPI value for a team in a period. */
export interface MetricValue {
  team: string;
  kpi: string;
  period: Period;
  /** Absent value recorded as `null` (Req 2.7). */
  value: number | null;
  /** Present only when a Business Unit column exists in the sheet. */
  businessUnit?: string | null;
}

/** Discovered dimensions available for filtering. */
export interface Dimensions {
  teams: string[];
  kpis: string[];
  periods: Period[];
  years: number[];
  pillars: EngineeringPillar[];
  /** `null` when no Business Unit column is present (Req 4.5). */
  businessUnits: string[] | null;
}

/** The normalized, in-memory representation produced by the parser. */
export interface DashboardModel {
  kpiDefinitions: KpiDefinition[];
  metrics: MetricValue[];
  dimensions: Dimensions;
  /** Raw KPIs-sheet header row, preserved for export fidelity. */
  sourceColumns: string[];
}

/** A user's active global filter selection. */
export interface FilterSelection {
  months: string[];
  years: number[];
  teams: string[];
  kpis: string[];
  pillars: EngineeringPillar[];
  statuses: HealthStatus[];
  /** Present only when the model has a Business Unit dimension. */
  businessUnits?: string[];
}

/** The available options for each filter, derived from the model. */
export interface FilterOptions {
  months: string[];
  years: number[];
  teams: string[];
  kpis: string[];
  pillars: EngineeringPillar[];
  statuses: HealthStatus[];
  /** `null` when the Business Unit dimension is absent. */
  businessUnits: string[] | null;
}

/**
 * Produced by FilterController.applyFilters; shares the shape of the model but
 * restricted to the selection.
 */
export interface FilteredDataset {
  metrics: MetricValue[];
  kpiDefinitions: KpiDefinition[];
  /** Ordered ascending by Period.key. */
  periods: Period[];
  teams: string[];
  selection: FilterSelection;
}
