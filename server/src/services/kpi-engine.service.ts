import type { SprintDataRow, KpiName, KpiResult, KpiFilter, KpiComputedResult, RagStatus } from '../types/index';
import type { ISprintDataRepository, IKpiResultsRepository, IConfigRepository } from '../repositories/interfaces';

/**
 * Interface for the RAG classification service.
 * Optional dependency — when not provided, default RAG status is 'amber'.
 */
export interface IRagService {
  classify(kpiName: KpiName, value: number, previousValue?: number | null): RagStatus;
}

/**
 * Interface for the KPI Engine Service.
 */
export interface IKpiEngineService {
  calculateAll(filter: KpiFilter): Promise<KpiResult[]>;
  calculateSingle(kpiName: KpiName, filter: KpiFilter): Promise<KpiResult>;
}

/**
 * Result from an individual KPI calculation function.
 * value is null when denominator is zero (insufficient data).
 */
export interface KpiCalculationResult {
  value: number | null;
  insufficientData: boolean;
}

/**
 * Parses a date string in "DD-MM-YYYY" or "YYYY-MM-DD" format into a Date object.
 * Returns null if the string is null, empty, or unparseable.
 */
export function parseDate(dateStr: string | null): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const trimmed = dateStr.trim();

  // Try DD-MM-YYYY format
  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match1 = trimmed.match(ddmmyyyy);
  if (match1) {
    const day = parseInt(match1[1], 10);
    const month = parseInt(match1[2], 10) - 1; // zero-based
    const year = parseInt(match1[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Try YYYY-MM-DD format
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match2 = trimmed.match(yyyymmdd);
  if (match2) {
    const year = parseInt(match2[1], 10);
    const month = parseInt(match2[2], 10) - 1;
    const day = parseInt(match2[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Calculates calendar days between two dates (inclusive of start, exclusive of end).
 * Returns the absolute difference in days.
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Math.round((end.getTime() - start.getTime()) / msPerDay));
}

/**
 * Rounds a number to a given number of decimal places.
 */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Sprint Commitment: (Complete items / total items) × 100, rounded to 2 decimal places.
 * Denominator = total items count. If zero, return null with insufficientData=true.
 */
export function calculateSprintCommitment(rows: SprintDataRow[]): KpiCalculationResult {
  const total = rows.length;
  if (total === 0) {
    return { value: null, insufficientData: true };
  }

  const completeCount = rows.filter(
    (r) => r.developmentStatus !== null && r.developmentStatus.toLowerCase() === 'complete'
  ).length;

  return {
    value: roundTo((completeCount / total) * 100, 2),
    insufficientData: false,
  };
}

/**
 * Release Success Rate: (non-empty GO Live Date AND Rollback=N / non-empty GO Live Date) × 100,
 * rounded to 2 decimal places.
 * Denominator = items with non-empty GO Live Date. If zero, return null with insufficientData=true.
 */
export function calculateReleaseSuccessRate(rows: SprintDataRow[]): KpiCalculationResult {
  const withGoLive = rows.filter((r) => r.goLiveDate !== null && r.goLiveDate.trim() !== '');
  const denominator = withGoLive.length;

  if (denominator === 0) {
    return { value: null, insufficientData: true };
  }

  const successCount = withGoLive.filter((r) => r.rollback === 'N').length;

  return {
    value: roundTo((successCount / denominator) * 100, 2),
    insufficientData: false,
  };
}

/**
 * Deployment Frequency: count of distinct non-empty GO Live Dates.
 * This is a count KPI, not a percentage. No denominator issue here,
 * but if there are no rows, we treat it as insufficient data.
 */
export function calculateDeploymentFrequency(rows: SprintDataRow[]): KpiCalculationResult {
  if (rows.length === 0) {
    return { value: null, insufficientData: true };
  }

  const distinctDates = new Set<string>();
  for (const row of rows) {
    if (row.goLiveDate !== null && row.goLiveDate.trim() !== '') {
      distinctDates.add(row.goLiveDate.trim());
    }
  }

  return {
    value: distinctDates.size,
    insufficientData: false,
  };
}

/**
 * Capacity Utilization: (sum Actual Effort / team capacity) × 100, rounded to 2 decimal places.
 * Denominator = team capacity. If zero or not provided, return null with insufficientData=true.
 */
export function calculateCapacityUtilization(
  rows: SprintDataRow[],
  teamCapacityHours: number
): KpiCalculationResult {
  if (teamCapacityHours <= 0) {
    return { value: null, insufficientData: true };
  }

  if (rows.length === 0) {
    return { value: null, insufficientData: true };
  }

  const totalActualEffort = rows.reduce((sum, r) => {
    return sum + (r.actualEffortWithAi ?? 0);
  }, 0);

  return {
    value: roundTo((totalActualEffort / teamCapacityHours) * 100, 2),
    insufficientData: false,
  };
}

/**
 * AI Efficiency: average of ((Estimated - Actual) / Estimated × 100) where AI Used=Y,
 * rounded to 2 decimal places.
 * Denominator = count of qualifying items (AI Used=Y with valid estimated and actual values).
 * If zero, return null with insufficientData=true.
 */
export function calculateAiEfficiency(rows: SprintDataRow[]): KpiCalculationResult {
  const qualifyingRows = rows.filter(
    (r) =>
      r.aiUsed === 'Y' &&
      r.estimatedEffortWithoutAi !== null &&
      r.estimatedEffortWithoutAi > 0 &&
      r.actualEffortWithAi !== null
  );

  if (qualifyingRows.length === 0) {
    return { value: null, insufficientData: true };
  }

  const efficiencies = qualifyingRows.map((r) => {
    const estimated = r.estimatedEffortWithoutAi!;
    const actual = r.actualEffortWithAi!;
    return ((estimated - actual) / estimated) * 100;
  });

  const average = efficiencies.reduce((sum, v) => sum + v, 0) / efficiencies.length;

  return {
    value: roundTo(average, 2),
    insufficientData: false,
  };
}

/**
 * UAT Predictability: (delivery ≤ target / total with both dates) × 100, rounded to 2 decimal places.
 * Denominator = items with both uatDeliveryDate and uatDeliveryTarget populated.
 * If zero, return null with insufficientData=true.
 */
export function calculateUatPredictability(rows: SprintDataRow[]): KpiCalculationResult {
  const withBothDates = rows.filter((r) => {
    const delivery = parseDate(r.uatDeliveryDate);
    const target = parseDate(r.uatDeliveryTarget);
    return delivery !== null && target !== null;
  });

  if (withBothDates.length === 0) {
    return { value: null, insufficientData: true };
  }

  const onTimeCount = withBothDates.filter((r) => {
    const delivery = parseDate(r.uatDeliveryDate)!;
    const target = parseDate(r.uatDeliveryTarget)!;
    return delivery.getTime() <= target.getTime();
  }).length;

  return {
    value: roundTo((onTimeCount / withBothDates.length) * 100, 2),
    insufficientData: false,
  };
}

/**
 * Dev Cycle Time: average calendar days between start and end, rounded to 1 decimal place.
 * Denominator = items with both devStartDate and devEndDate populated.
 * If zero, return null with insufficientData=true.
 */
export function calculateDevCycleTime(rows: SprintDataRow[]): KpiCalculationResult {
  const withBothDates = rows.filter((r) => {
    const start = parseDate(r.devStartDate);
    const end = parseDate(r.devEndDate);
    return start !== null && end !== null;
  });

  if (withBothDates.length === 0) {
    return { value: null, insufficientData: true };
  }

  const totalDays = withBothDates.reduce((sum, r) => {
    const start = parseDate(r.devStartDate)!;
    const end = parseDate(r.devEndDate)!;
    return sum + daysBetween(start, end);
  }, 0);

  return {
    value: roundTo(totalDays / withBothDates.length, 1),
    insufficientData: false,
  };
}

/**
 * Story Drop Rate: (non-empty Story Drop Reason / total items) × 100, rounded to 2 decimal places.
 * Denominator = total items. If zero, return null with insufficientData=true.
 */
export function calculateStoryDropRate(rows: SprintDataRow[]): KpiCalculationResult {
  const total = rows.length;
  if (total === 0) {
    return { value: null, insufficientData: true };
  }

  const droppedCount = rows.filter(
    (r) => r.storyDropReason !== null && r.storyDropReason.trim() !== ''
  ).length;

  return {
    value: roundTo((droppedCount / total) * 100, 2),
    insufficientData: false,
  };
}

/**
 * Rollback Rate: (Rollback=Y / non-empty GO Live Date) × 100, rounded to 2 decimal places.
 * Denominator = items with non-empty GO Live Date. If zero, return null with insufficientData=true.
 */
export function calculateRollbackRate(rows: SprintDataRow[]): KpiCalculationResult {
  const withGoLive = rows.filter((r) => r.goLiveDate !== null && r.goLiveDate.trim() !== '');
  const denominator = withGoLive.length;

  if (denominator === 0) {
    return { value: null, insufficientData: true };
  }

  const rollbackCount = withGoLive.filter((r) => r.rollback === 'Y').length;

  return {
    value: roundTo((rollbackCount / denominator) * 100, 2),
    insufficientData: false,
  };
}

/**
 * Map of KPI names to their calculation functions.
 * Capacity Utilization requires additional teamCapacity parameter, so it's handled separately.
 */
export const KPI_CALCULATORS: Record<
  Exclude<KpiName, 'capacity_utilization'>,
  (rows: SprintDataRow[]) => KpiCalculationResult
> = {
  sprint_commitment: calculateSprintCommitment,
  release_success_rate: calculateReleaseSuccessRate,
  deployment_frequency: calculateDeploymentFrequency,
  ai_efficiency: calculateAiEfficiency,
  uat_predictability: calculateUatPredictability,
  dev_cycle_time: calculateDevCycleTime,
  story_drop_rate: calculateStoryDropRate,
  rollback_rate: calculateRollbackRate,
};


/** All 9 KPI names */
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
 * Calculates percent change between current and previous values.
 * Returns null if there is no previous value.
 * Formula: ((current - previous) / previous) * 100, rounded to 2 decimal places.
 */
function calculatePercentChange(currentValue: number | null, previousValue: number | null): number | null {
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null;
  }
  const change = ((currentValue - previousValue) / previousValue) * 100;
  return Math.round(change * 100) / 100;
}

/**
 * KPI Engine Service orchestration class.
 * Queries filtered data, computes all 9 KPIs, calculates percent changes,
 * and persists computed results to the kpi_results table.
 */
export class KpiEngineService implements IKpiEngineService {
  constructor(
    private readonly sprintDataRepo: ISprintDataRepository,
    private readonly kpiResultsRepo: IKpiResultsRepository,
    private readonly configRepo: IConfigRepository,
    private readonly ragService?: IRagService
  ) {}

  /**
   * Calculate all 9 KPIs for the given filter and persist results.
   */
  async calculateAll(filter: KpiFilter): Promise<KpiResult[]> {
    const rows = await this.sprintDataRepo.findByFilter(filter);
    const results: KpiResult[] = [];
    const computedResults: KpiComputedResult[] = [];

    for (const kpiName of ALL_KPI_NAMES) {
      const { kpiResult, computedResult } = await this.computeKpi(kpiName, rows, filter);
      results.push(kpiResult);
      computedResults.push(computedResult);
    }

    // Persist all computed results in a batch
    await this.kpiResultsRepo.saveBatch(computedResults);

    return results;
  }

  /**
   * Calculate a single KPI for the given filter and persist result.
   */
  async calculateSingle(kpiName: KpiName, filter: KpiFilter): Promise<KpiResult> {
    const rows = await this.sprintDataRepo.findByFilter(filter);
    const { kpiResult, computedResult } = await this.computeKpi(kpiName, rows, filter);

    // Persist single computed result
    await this.kpiResultsRepo.save(computedResult);

    return kpiResult;
  }

  /**
   * Internal: compute a single KPI from the provided rows and filter,
   * including RAG status and percent change.
   */
  private async computeKpi(
    kpiName: KpiName,
    rows: SprintDataRow[],
    filter: KpiFilter
  ): Promise<{ kpiResult: KpiResult; computedResult: KpiComputedResult }> {
    // Calculate raw KPI value
    const calcResult = await this.calculateRawKpi(kpiName, rows, filter);

    // Get RAG status
    const ragStatus = this.getRagStatus(kpiName, calcResult.value);

    // Calculate percent change against preceding period
    const percentChange = await this.getPercentChange(kpiName, calcResult.value, filter);

    // Determine period boundaries
    const now = new Date().toISOString();
    const periodStart = filter.startDate ?? now.split('T')[0];
    const periodEnd = filter.endDate ?? now.split('T')[0];

    const kpiResult: KpiResult = {
      kpiName,
      value: calcResult.value,
      ragStatus,
      percentChange,
      insufficientData: calcResult.insufficientData,
    };

    const computedResult: KpiComputedResult = {
      kpiName,
      value: calcResult.value,
      ragStatus,
      percentChange,
      team: filter.team ?? null,
      portfolio: filter.portfolio ?? null,
      sprint: null,
      periodStart,
      periodEnd,
      calculatedAt: now,
      insufficientData: calcResult.insufficientData,
    };

    return { kpiResult, computedResult };
  }

  /**
   * Calculate the raw KPI value using the appropriate calculation function.
   */
  private async calculateRawKpi(
    kpiName: KpiName,
    rows: SprintDataRow[],
    filter: KpiFilter
  ): Promise<KpiCalculationResult> {
    if (kpiName === 'capacity_utilization') {
      // Capacity utilization requires team capacity config
      let teamCapacity = 0;
      if (filter.team) {
        const teamConfig = await this.configRepo.getTeamConfig(filter.team);
        teamCapacity = teamConfig?.capacityHoursPerSprint ?? 0;
      }
      return calculateCapacityUtilization(rows, teamCapacity);
    }

    // All other KPIs use the standard calculators
    const calculator = KPI_CALCULATORS[kpiName as Exclude<KpiName, 'capacity_utilization'>];
    return calculator(rows);
  }

  /**
   * Get RAG status for a KPI value.
   * Uses the injected RAG service if available, otherwise defaults to 'amber'.
   */
  private getRagStatus(kpiName: KpiName, value: number | null): RagStatus {
    if (value === null) {
      return 'amber';
    }
    if (this.ragService) {
      return this.ragService.classify(kpiName, value);
    }
    return 'amber';
  }

  /**
   * Calculate percent change against the immediately preceding period's value.
   * Uses findTrend to get the previous period's result.
   */
  private async getPercentChange(
    kpiName: KpiName,
    currentValue: number | null,
    filter: KpiFilter
  ): Promise<number | null> {
    if (currentValue === null) {
      return null;
    }

    const team = filter.team ?? '';
    // Get the 2 most recent periods (current might not be persisted yet, so we look at history)
    const trend = await this.kpiResultsRepo.findTrend(kpiName, team, 2);

    if (trend.length === 0) {
      // No previous period data
      return null;
    }

    // The first result (most recent) is the previous period since current isn't persisted yet
    const previousValue = trend[0].value;
    return calculatePercentChange(currentValue, previousValue);
  }
}
