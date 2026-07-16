import { describe, it, expect } from 'vitest';
import {
  calculateSprintCommitment,
  calculateReleaseSuccessRate,
  calculateDeploymentFrequency,
  calculateCapacityUtilization,
  calculateAiEfficiency,
  calculateUatPredictability,
  calculateDevCycleTime,
  calculateStoryDropRate,
  calculateRollbackRate,
  parseDate,
} from '../../services/kpi-engine.service';
import type { SprintDataRow } from '../../types/index';

/** Helper to create a minimal SprintDataRow with overrides */
function makeRow(overrides: Partial<SprintDataRow> = {}): SprintDataRow {
  return {
    uploadId: 'upload-1',
    sno: 1,
    team: 'TeamA',
    track: 'TrackA',
    project: 'ProjectA',
    portfolio: 'PortfolioA',
    status: null,
    itemsList: null,
    walkthroughGivenOn: null,
    jiraId: 'PROJ-1',
    estimatedEffortWithAi: null,
    estimatedEffortWithoutAi: null,
    actualEffortWithAi: null,
    aiUsed: null,
    devStartDate: null,
    devEndDate: null,
    developmentStatus: null,
    uatDeliveryDate: null,
    uatDeliveryTarget: null,
    resources: null,
    goLivePlannedDate: null,
    goLiveDate: null,
    productionStatus: null,
    rollback: null,
    rollbackReason: null,
    storyDropReason: null,
    ingestedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('parseDate', () => {
  it('parses DD-MM-YYYY format', () => {
    const d = parseDate('15-03-2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(2); // zero-based
    expect(d!.getDate()).toBe(15);
  });

  it('parses YYYY-MM-DD format', () => {
    const d = parseDate('2024-03-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(15);
  });

  it('returns null for null input', () => {
    expect(parseDate(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('   ')).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('2024/03/15')).toBeNull();
  });
});

describe('calculateSprintCommitment', () => {
  it('returns null with insufficientData=true for empty array', () => {
    const result = calculateSprintCommitment([]);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns 100% when all items are Complete', () => {
    const rows = [
      makeRow({ developmentStatus: 'Complete' }),
      makeRow({ developmentStatus: 'Complete' }),
      makeRow({ developmentStatus: 'Complete' }),
    ];
    const result = calculateSprintCommitment(rows);
    expect(result.value).toBe(100);
    expect(result.insufficientData).toBe(false);
  });

  it('returns 0% when no items are Complete', () => {
    const rows = [
      makeRow({ developmentStatus: 'In Progress' }),
      makeRow({ developmentStatus: 'Not Started' }),
    ];
    const result = calculateSprintCommitment(rows);
    expect(result.value).toBe(0);
    expect(result.insufficientData).toBe(false);
  });

  it('calculates correct percentage for mixed statuses', () => {
    const rows = [
      makeRow({ developmentStatus: 'Complete' }),
      makeRow({ developmentStatus: 'Complete' }),
      makeRow({ developmentStatus: 'In Progress' }),
    ];
    const result = calculateSprintCommitment(rows);
    expect(result.value).toBe(66.67);
    expect(result.insufficientData).toBe(false);
  });

  it('is case-insensitive for "Complete"', () => {
    const rows = [
      makeRow({ developmentStatus: 'complete' }),
      makeRow({ developmentStatus: 'COMPLETE' }),
      makeRow({ developmentStatus: 'In Progress' }),
    ];
    const result = calculateSprintCommitment(rows);
    expect(result.value).toBe(66.67);
  });
});

describe('calculateReleaseSuccessRate', () => {
  it('returns null with insufficientData=true when no items have GO Live Date', () => {
    const rows = [
      makeRow({ goLiveDate: null }),
      makeRow({ goLiveDate: '' }),
    ];
    const result = calculateReleaseSuccessRate(rows);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns 100% when all deployed items have Rollback=N', () => {
    const rows = [
      makeRow({ goLiveDate: '01-01-2024', rollback: 'N' }),
      makeRow({ goLiveDate: '02-01-2024', rollback: 'N' }),
    ];
    const result = calculateReleaseSuccessRate(rows);
    expect(result.value).toBe(100);
    expect(result.insufficientData).toBe(false);
  });

  it('calculates correct rate with mixed rollback values', () => {
    const rows = [
      makeRow({ goLiveDate: '01-01-2024', rollback: 'N' }),
      makeRow({ goLiveDate: '02-01-2024', rollback: 'Y' }),
      makeRow({ goLiveDate: '03-01-2024', rollback: 'N' }),
      makeRow({ goLiveDate: null, rollback: 'N' }), // excluded - no go live date
    ];
    const result = calculateReleaseSuccessRate(rows);
    // 2 successes / 3 with go live date = 66.67%
    expect(result.value).toBe(66.67);
  });

  it('ignores items without GO Live Date in the denominator', () => {
    const rows = [
      makeRow({ goLiveDate: '01-01-2024', rollback: 'N' }),
      makeRow({ goLiveDate: null, rollback: 'Y' }),
    ];
    const result = calculateReleaseSuccessRate(rows);
    expect(result.value).toBe(100);
  });
});

describe('calculateDeploymentFrequency', () => {
  it('returns null with insufficientData=true for empty array', () => {
    const result = calculateDeploymentFrequency([]);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('counts distinct non-empty GO Live Dates', () => {
    const rows = [
      makeRow({ goLiveDate: '01-01-2024' }),
      makeRow({ goLiveDate: '01-01-2024' }), // duplicate
      makeRow({ goLiveDate: '02-01-2024' }),
      makeRow({ goLiveDate: '03-01-2024' }),
      makeRow({ goLiveDate: null }), // excluded
      makeRow({ goLiveDate: '' }), // excluded
    ];
    const result = calculateDeploymentFrequency(rows);
    expect(result.value).toBe(3);
    expect(result.insufficientData).toBe(false);
  });

  it('returns 0 when no items have GO Live Date but rows exist', () => {
    const rows = [
      makeRow({ goLiveDate: null }),
      makeRow({ goLiveDate: '' }),
    ];
    const result = calculateDeploymentFrequency(rows);
    expect(result.value).toBe(0);
    expect(result.insufficientData).toBe(false);
  });
});

describe('calculateCapacityUtilization', () => {
  it('returns null with insufficientData=true when capacity is 0', () => {
    const rows = [makeRow({ actualEffortWithAi: 10 })];
    const result = calculateCapacityUtilization(rows, 0);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns null with insufficientData=true when capacity is negative', () => {
    const rows = [makeRow({ actualEffortWithAi: 10 })];
    const result = calculateCapacityUtilization(rows, -100);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns null with insufficientData=true for empty rows', () => {
    const result = calculateCapacityUtilization([], 100);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('calculates correct utilization percentage', () => {
    const rows = [
      makeRow({ actualEffortWithAi: 30 }),
      makeRow({ actualEffortWithAi: 20 }),
      makeRow({ actualEffortWithAi: 40 }),
    ];
    // sum = 90, capacity = 100 => 90%
    const result = calculateCapacityUtilization(rows, 100);
    expect(result.value).toBe(90);
    expect(result.insufficientData).toBe(false);
  });

  it('treats null actualEffort as 0', () => {
    const rows = [
      makeRow({ actualEffortWithAi: 50 }),
      makeRow({ actualEffortWithAi: null }),
    ];
    // sum = 50, capacity = 200 => 25%
    const result = calculateCapacityUtilization(rows, 200);
    expect(result.value).toBe(25);
  });

  it('can exceed 100% for over-utilized teams', () => {
    const rows = [makeRow({ actualEffortWithAi: 150 })];
    const result = calculateCapacityUtilization(rows, 100);
    expect(result.value).toBe(150);
  });
});

describe('calculateAiEfficiency', () => {
  it('returns null with insufficientData=true when no items have AI Used=Y', () => {
    const rows = [
      makeRow({ aiUsed: 'N', estimatedEffortWithoutAi: 10, actualEffortWithAi: 8 }),
      makeRow({ aiUsed: null, estimatedEffortWithoutAi: 10, actualEffortWithAi: 8 }),
    ];
    const result = calculateAiEfficiency(rows);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns null when AI Used=Y but estimated effort is 0', () => {
    const rows = [
      makeRow({ aiUsed: 'Y', estimatedEffortWithoutAi: 0, actualEffortWithAi: 5 }),
    ];
    const result = calculateAiEfficiency(rows);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns null when AI Used=Y but estimated effort is null', () => {
    const rows = [
      makeRow({ aiUsed: 'Y', estimatedEffortWithoutAi: null, actualEffortWithAi: 5 }),
    ];
    const result = calculateAiEfficiency(rows);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('calculates correct efficiency for a single item', () => {
    const rows = [
      makeRow({ aiUsed: 'Y', estimatedEffortWithoutAi: 10, actualEffortWithAi: 7 }),
    ];
    // (10 - 7) / 10 * 100 = 30%
    const result = calculateAiEfficiency(rows);
    expect(result.value).toBe(30);
    expect(result.insufficientData).toBe(false);
  });

  it('calculates average efficiency across multiple items', () => {
    const rows = [
      makeRow({ aiUsed: 'Y', estimatedEffortWithoutAi: 10, actualEffortWithAi: 7 }), // 30%
      makeRow({ aiUsed: 'Y', estimatedEffortWithoutAi: 20, actualEffortWithAi: 10 }), // 50%
      makeRow({ aiUsed: 'N', estimatedEffortWithoutAi: 10, actualEffortWithAi: 5 }), // excluded
    ];
    // average = (30 + 50) / 2 = 40%
    const result = calculateAiEfficiency(rows);
    expect(result.value).toBe(40);
  });

  it('can produce negative efficiency when actual > estimated', () => {
    const rows = [
      makeRow({ aiUsed: 'Y', estimatedEffortWithoutAi: 10, actualEffortWithAi: 15 }),
    ];
    // (10 - 15) / 10 * 100 = -50%
    const result = calculateAiEfficiency(rows);
    expect(result.value).toBe(-50);
  });
});

describe('calculateUatPredictability', () => {
  it('returns null with insufficientData=true when no items have both dates', () => {
    const rows = [
      makeRow({ uatDeliveryDate: '01-01-2024', uatDeliveryTarget: null }),
      makeRow({ uatDeliveryDate: null, uatDeliveryTarget: '01-01-2024' }),
    ];
    const result = calculateUatPredictability(rows);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns 100% when all deliveries are on or before target', () => {
    const rows = [
      makeRow({ uatDeliveryDate: '01-03-2024', uatDeliveryTarget: '05-03-2024' }),
      makeRow({ uatDeliveryDate: '05-03-2024', uatDeliveryTarget: '05-03-2024' }), // equal = on time
    ];
    const result = calculateUatPredictability(rows);
    expect(result.value).toBe(100);
    expect(result.insufficientData).toBe(false);
  });

  it('returns 0% when all deliveries are after target', () => {
    const rows = [
      makeRow({ uatDeliveryDate: '10-03-2024', uatDeliveryTarget: '05-03-2024' }),
      makeRow({ uatDeliveryDate: '06-03-2024', uatDeliveryTarget: '05-03-2024' }),
    ];
    const result = calculateUatPredictability(rows);
    expect(result.value).toBe(0);
  });

  it('calculates correct percentage for mixed items', () => {
    const rows = [
      makeRow({ uatDeliveryDate: '01-03-2024', uatDeliveryTarget: '05-03-2024' }), // on time
      makeRow({ uatDeliveryDate: '10-03-2024', uatDeliveryTarget: '05-03-2024' }), // late
      makeRow({ uatDeliveryDate: '04-03-2024', uatDeliveryTarget: '05-03-2024' }), // on time
    ];
    // 2/3 = 66.67%
    const result = calculateUatPredictability(rows);
    expect(result.value).toBe(66.67);
  });

  it('works with YYYY-MM-DD date format', () => {
    const rows = [
      makeRow({ uatDeliveryDate: '2024-03-01', uatDeliveryTarget: '2024-03-05' }), // on time
      makeRow({ uatDeliveryDate: '2024-03-10', uatDeliveryTarget: '2024-03-05' }), // late
    ];
    const result = calculateUatPredictability(rows);
    expect(result.value).toBe(50);
  });
});

describe('calculateDevCycleTime', () => {
  it('returns null with insufficientData=true when no items have both dates', () => {
    const rows = [
      makeRow({ devStartDate: '01-03-2024', devEndDate: null }),
      makeRow({ devStartDate: null, devEndDate: '05-03-2024' }),
    ];
    const result = calculateDevCycleTime(rows);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('calculates average days for items with both dates', () => {
    const rows = [
      makeRow({ devStartDate: '01-03-2024', devEndDate: '05-03-2024' }), // 4 days
      makeRow({ devStartDate: '01-03-2024', devEndDate: '11-03-2024' }), // 10 days
    ];
    // average = (4 + 10) / 2 = 7.0
    const result = calculateDevCycleTime(rows);
    expect(result.value).toBe(7);
    expect(result.insufficientData).toBe(false);
  });

  it('rounds to 1 decimal place', () => {
    const rows = [
      makeRow({ devStartDate: '01-03-2024', devEndDate: '04-03-2024' }), // 3 days
      makeRow({ devStartDate: '01-03-2024', devEndDate: '05-03-2024' }), // 4 days
    ];
    // average = (3 + 4) / 2 = 3.5
    const result = calculateDevCycleTime(rows);
    expect(result.value).toBe(3.5);
  });

  it('returns 0 when start and end date are the same', () => {
    const rows = [
      makeRow({ devStartDate: '01-03-2024', devEndDate: '01-03-2024' }),
    ];
    const result = calculateDevCycleTime(rows);
    expect(result.value).toBe(0);
  });

  it('works with YYYY-MM-DD format', () => {
    const rows = [
      makeRow({ devStartDate: '2024-03-01', devEndDate: '2024-03-06' }), // 5 days
    ];
    const result = calculateDevCycleTime(rows);
    expect(result.value).toBe(5);
  });
});

describe('calculateStoryDropRate', () => {
  it('returns null with insufficientData=true for empty array', () => {
    const result = calculateStoryDropRate([]);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns 0% when no items have Story Drop Reason', () => {
    const rows = [
      makeRow({ storyDropReason: null }),
      makeRow({ storyDropReason: '' }),
      makeRow({ storyDropReason: '   ' }),
    ];
    const result = calculateStoryDropRate(rows);
    expect(result.value).toBe(0);
    expect(result.insufficientData).toBe(false);
  });

  it('returns 100% when all items have Story Drop Reason', () => {
    const rows = [
      makeRow({ storyDropReason: 'Requirement changed' }),
      makeRow({ storyDropReason: 'Not feasible' }),
    ];
    const result = calculateStoryDropRate(rows);
    expect(result.value).toBe(100);
  });

  it('calculates correct percentage for mixed items', () => {
    const rows = [
      makeRow({ storyDropReason: 'Out of scope' }),
      makeRow({ storyDropReason: null }),
      makeRow({ storyDropReason: '' }),
      makeRow({ storyDropReason: 'Blocked' }),
    ];
    // 2 dropped / 4 total = 50%
    const result = calculateStoryDropRate(rows);
    expect(result.value).toBe(50);
  });
});

describe('calculateRollbackRate', () => {
  it('returns null with insufficientData=true when no items have GO Live Date', () => {
    const rows = [
      makeRow({ goLiveDate: null, rollback: 'Y' }),
      makeRow({ goLiveDate: '', rollback: 'Y' }),
    ];
    const result = calculateRollbackRate(rows);
    expect(result.value).toBeNull();
    expect(result.insufficientData).toBe(true);
  });

  it('returns 0% when no deployed items had rollback', () => {
    const rows = [
      makeRow({ goLiveDate: '01-01-2024', rollback: 'N' }),
      makeRow({ goLiveDate: '02-01-2024', rollback: 'N' }),
    ];
    const result = calculateRollbackRate(rows);
    expect(result.value).toBe(0);
    expect(result.insufficientData).toBe(false);
  });

  it('calculates correct rollback rate', () => {
    const rows = [
      makeRow({ goLiveDate: '01-01-2024', rollback: 'Y' }),
      makeRow({ goLiveDate: '02-01-2024', rollback: 'N' }),
      makeRow({ goLiveDate: '03-01-2024', rollback: 'N' }),
      makeRow({ goLiveDate: null, rollback: 'Y' }), // excluded - no go live date
    ];
    // 1 rollback / 3 with go live = 33.33%
    const result = calculateRollbackRate(rows);
    expect(result.value).toBe(33.33);
  });

  it('returns 100% when all deployed items had rollback', () => {
    const rows = [
      makeRow({ goLiveDate: '01-01-2024', rollback: 'Y' }),
      makeRow({ goLiveDate: '02-01-2024', rollback: 'Y' }),
    ];
    const result = calculateRollbackRate(rows);
    expect(result.value).toBe(100);
  });
});
