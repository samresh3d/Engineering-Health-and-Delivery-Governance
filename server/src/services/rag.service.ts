import type { KpiName, RagStatus, ThresholdConfig } from '../types/index';
import type { IConfigRepository } from '../repositories/interfaces';
import type { IRagService } from './kpi-engine.service';

/**
 * RAG Classification Service.
 *
 * Classifies KPI values into Red/Amber/Green status based on configurable thresholds
 * loaded from the config repository. Supports three classification modes:
 * - 'above': higher values are better (e.g., Sprint Commitment)
 * - 'below': lower values are better (e.g., Story Drop Rate)
 * - 'trend': improvement over previous period determines status (e.g., Deployment Frequency)
 */
export class RagService implements IRagService {
  private thresholdCache: Map<KpiName, ThresholdConfig> = new Map();
  private cacheLoaded = false;

  constructor(private readonly configRepo: IConfigRepository) {}

  /**
   * Classify a KPI value into a RAG status.
   *
   * For threshold-based KPIs (comparisonType 'above' or 'below'), uses the value directly.
   * For trend-based KPIs (comparisonType 'trend'), requires a previousValue to compute
   * the percentage change. If previousValue is null/undefined for a trend-based KPI,
   * returns 'amber' (insufficient data).
   */
  classify(kpiName: KpiName, value: number, previousValue?: number | null): RagStatus {
    const threshold = this.thresholdCache.get(kpiName);

    if (!threshold) {
      // If thresholds haven't been loaded yet, default to amber
      return 'amber';
    }

    if (threshold.comparisonType === 'trend') {
      // Trend-based: requires previous value
      if (previousValue === null || previousValue === undefined) {
        return 'amber'; // Insufficient data for trend calculation
      }
      return this.classifyWithTrend(kpiName, value, previousValue);
    }

    if (threshold.comparisonType === 'above') {
      return this.classifyAbove(value, threshold);
    }

    // comparisonType === 'below'
    return this.classifyBelow(value, threshold);
  }

  /**
   * Classify a trend-based KPI by comparing current and previous values.
   *
   * For Deployment_Frequency: improvement = ((current - previous) / previous) * 100
   *   - Green: improvement > 5% (more deployments)
   *   - Amber: within ±5%
   *   - Red: regression > 5% (fewer deployments)
   *
   * For Dev_Cycle_Time: improvement = ((previous - current) / previous) * 100
   *   - Green: reduction > 5% (faster cycles)
   *   - Amber: within ±5%
   *   - Red: increase > 5% (slower cycles)
   */
  classifyWithTrend(kpiName: KpiName, currentValue: number, previousValue: number): RagStatus {
    if (previousValue === 0) {
      // Cannot compute percentage change with zero previous value
      return 'amber';
    }

    let percentChange: number;

    if (kpiName === 'dev_cycle_time') {
      // For Dev Cycle Time, reduction is improvement
      // improvement = ((previous - current) / previous) * 100
      percentChange = ((previousValue - currentValue) / previousValue) * 100;
    } else {
      // For Deployment Frequency, increase is improvement
      // improvement = ((current - previous) / previous) * 100
      percentChange = ((currentValue - previousValue) / previousValue) * 100;
    }

    if (percentChange > 5) {
      return 'green';
    } else if (percentChange >= -5) {
      // Within ±5% (inclusive)
      return 'amber';
    } else {
      return 'red';
    }
  }

  /**
   * Load thresholds from the config repository into the in-memory cache.
   * Should be called during service initialization.
   */
  async loadThresholds(): Promise<void> {
    const thresholds = await this.configRepo.getThresholds();
    this.thresholdCache.clear();
    for (const t of thresholds) {
      this.thresholdCache.set(t.kpiName, t);
    }
    this.cacheLoaded = true;
  }

  /**
   * Check if thresholds have been loaded.
   */
  isLoaded(): boolean {
    return this.cacheLoaded;
  }

  /**
   * Classify using 'above' comparison type.
   * Higher values are better: value above greenThreshold = green, below amberThreshold = red.
   *
   * greenThreshold is the boundary above which the KPI is green.
   * amberThreshold is the boundary below which the KPI is red.
   * Between amberThreshold (inclusive) and greenThreshold (inclusive) = amber.
   */
  private classifyAbove(value: number, threshold: ThresholdConfig): RagStatus {
    if (value > threshold.greenThreshold) {
      return 'green';
    } else if (value >= threshold.amberThreshold) {
      return 'amber';
    } else {
      return 'red';
    }
  }

  /**
   * Classify using 'below' comparison type.
   * Lower values are better: value below greenThreshold = green, above amberThreshold = red.
   *
   * greenThreshold is the boundary below which the KPI is green.
   * amberThreshold is the boundary above which the KPI is red.
   * Between greenThreshold (inclusive) and amberThreshold (inclusive) = amber.
   */
  private classifyBelow(value: number, threshold: ThresholdConfig): RagStatus {
    if (value < threshold.greenThreshold) {
      return 'green';
    } else if (value <= threshold.amberThreshold) {
      return 'amber';
    } else {
      return 'red';
    }
  }
}
