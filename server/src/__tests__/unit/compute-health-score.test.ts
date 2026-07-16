import { describe, it, expect } from 'vitest';
import { computeHealthScore } from '../../services/kpi-engine.service';
import type { KpiResult } from '../../types/index';

/** Helper to create a KpiResult with specified RAG status */
function makeKpiResult(ragStatus: 'green' | 'amber' | 'red', value: number = 75): KpiResult {
  return {
    kpiName: 'sprint_commitment',
    value,
    ragStatus,
    percentChange: null,
    insufficientData: false,
  };
}

describe('computeHealthScore', () => {
  it('should return null when given an empty array', () => {
    expect(computeHealthScore([])).toBeNull();
  });

  it('should return null when all KPI results have null values', () => {
    const results: KpiResult[] = [
      { kpiName: 'sprint_commitment', value: null, ragStatus: 'amber', percentChange: null, insufficientData: false },
      { kpiName: 'release_success_rate', value: null, ragStatus: 'red', percentChange: null, insufficientData: false },
    ];
    expect(computeHealthScore(results)).toBeNull();
  });

  it('should return null when all KPI results have insufficientData=true', () => {
    const results: KpiResult[] = [
      { kpiName: 'sprint_commitment', value: 80, ragStatus: 'green', percentChange: null, insufficientData: true },
      { kpiName: 'release_success_rate', value: 90, ragStatus: 'green', percentChange: null, insufficientData: true },
    ];
    expect(computeHealthScore(results)).toBeNull();
  });

  it('should return 100 with green status when all KPIs are green', () => {
    const results: KpiResult[] = [
      makeKpiResult('green'),
      makeKpiResult('green'),
      makeKpiResult('green'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 100, ragStatus: 'green' });
  });

  it('should return 0 with red status when all KPIs are red', () => {
    const results: KpiResult[] = [
      makeKpiResult('red'),
      makeKpiResult('red'),
      makeKpiResult('red'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 0, ragStatus: 'red' });
  });

  it('should return 50 with amber status when all KPIs are amber', () => {
    const results: KpiResult[] = [
      makeKpiResult('amber'),
      makeKpiResult('amber'),
      makeKpiResult('amber'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 50, ragStatus: 'amber' });
  });

  it('should compute arithmetic mean for mixed RAG statuses', () => {
    // green=100, amber=50, red=0 → mean = (100+50+0)/3 = 50
    const results: KpiResult[] = [
      makeKpiResult('green'),
      makeKpiResult('amber'),
      makeKpiResult('red'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 50, ragStatus: 'amber' });
  });

  it('should classify as green when score is exactly 80', () => {
    // 4 green (400) + 1 amber (50) + no red → mean = 450/5 = 90? No.
    // Need: (green*4 + red*1) / 5 = 400/5 = 80
    const results: KpiResult[] = [
      makeKpiResult('green'),
      makeKpiResult('green'),
      makeKpiResult('green'),
      makeKpiResult('green'),
      makeKpiResult('red'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 80, ragStatus: 'green' });
  });

  it('should classify as amber when score is 79', () => {
    // Need a combination that gives exactly 79 after rounding
    // 3 green (300) + 1 amber (50) + 1 red (0) → 350/5 = 70 (amber)
    // Let's try: green*3 + amber*2 = 300+100 = 400/5 = 80 (green)
    // green*3 + amber*1 + red*1 = 300+50+0 = 350/5 = 70 (amber)
    // We want exactly 79: need sum/n where round(sum/n)=79
    // For 12 items: 11 green + 1 red = 1100/12 = 91.67 → no
    // For result=79 we can do: value = (100*n_g + 50*n_a + 0*n_r) / (n_g+n_a+n_r)
    // With 5 items: 100*3 + 50*1 + 0*1 = 350/5 = 70
    // With 6 items: 100*4 + 50*1 + 0*1 = 450/6 = 75
    // With 19 items: 100*15 + 50*0 + 0*4 = 1500/19 ≈ 78.95 → rounds to 79
    const results: KpiResult[] = [
      ...Array(15).fill(null).map(() => makeKpiResult('green')),
      ...Array(4).fill(null).map(() => makeKpiResult('red')),
    ];
    const score = computeHealthScore(results);
    expect(score!.value).toBe(79);
    expect(score!.ragStatus).toBe('amber');
  });

  it('should classify as red when score is below 50', () => {
    // 1 green (100) + 4 red (0) → 100/5 = 20
    const results: KpiResult[] = [
      makeKpiResult('green'),
      makeKpiResult('red'),
      makeKpiResult('red'),
      makeKpiResult('red'),
      makeKpiResult('red'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 20, ragStatus: 'red' });
  });

  it('should classify as amber when score is exactly 50', () => {
    // 1 green (100) + 1 red (0) → 100/2 = 50
    const results: KpiResult[] = [
      makeKpiResult('green'),
      makeKpiResult('red'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 50, ragStatus: 'amber' });
  });

  it('should exclude results with null value from computation', () => {
    const results: KpiResult[] = [
      makeKpiResult('green'),
      { kpiName: 'release_success_rate', value: null, ragStatus: 'red', percentChange: null, insufficientData: false },
      makeKpiResult('green'),
    ];
    // Only 2 valid green results → 200/2 = 100
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 100, ragStatus: 'green' });
  });

  it('should exclude results with insufficientData from computation', () => {
    const results: KpiResult[] = [
      makeKpiResult('green'),
      { kpiName: 'release_success_rate', value: 80, ragStatus: 'red', percentChange: null, insufficientData: true },
      makeKpiResult('amber'),
    ];
    // Only green + amber valid → (100+50)/2 = 75
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 75, ragStatus: 'amber' });
  });

  it('should round to nearest integer', () => {
    // 2 green + 1 amber = (100+100+50)/3 = 250/3 = 83.33... → rounds to 83
    const results: KpiResult[] = [
      makeKpiResult('green'),
      makeKpiResult('green'),
      makeKpiResult('amber'),
    ];
    const score = computeHealthScore(results);
    expect(score).toEqual({ value: 83, ragStatus: 'green' });
  });
});
