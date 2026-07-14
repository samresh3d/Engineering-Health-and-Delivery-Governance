import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RagService } from '../../services/rag.service';
import type { IConfigRepository } from '../../repositories/interfaces';
import type { ThresholdConfig } from '../../types/index';

/** Mock thresholds matching the task specification */
const mockThresholds: ThresholdConfig[] = [
  { kpiName: 'sprint_commitment', greenThreshold: 90, amberThreshold: 80, redThreshold: 0, comparisonType: 'above' },
  { kpiName: 'release_success_rate', greenThreshold: 98, amberThreshold: 95, redThreshold: 0, comparisonType: 'above' },
  { kpiName: 'deployment_frequency', greenThreshold: 5, amberThreshold: -5, redThreshold: 0, comparisonType: 'trend' },
  { kpiName: 'capacity_utilization', greenThreshold: 90, amberThreshold: 75, redThreshold: 0, comparisonType: 'above' },
  { kpiName: 'ai_efficiency', greenThreshold: 20, amberThreshold: 15, redThreshold: 0, comparisonType: 'above' },
  { kpiName: 'uat_predictability', greenThreshold: 95, amberThreshold: 85, redThreshold: 0, comparisonType: 'above' },
  { kpiName: 'dev_cycle_time', greenThreshold: -5, amberThreshold: 5, redThreshold: 0, comparisonType: 'trend' },
  { kpiName: 'story_drop_rate', greenThreshold: 5, amberThreshold: 10, redThreshold: 0, comparisonType: 'below' },
  { kpiName: 'rollback_rate', greenThreshold: 2, amberThreshold: 5, redThreshold: 0, comparisonType: 'below' },
];

function createMockConfigRepo(): IConfigRepository {
  return {
    getThresholds: vi.fn().mockResolvedValue(mockThresholds),
    getThreshold: vi.fn(),
    updateThreshold: vi.fn(),
    getTeamConfig: vi.fn(),
    getAllTeams: vi.fn(),
    upsertTeamConfig: vi.fn(),
    getTrackPortfolioMapping: vi.fn(),
  };
}

describe('RagService', () => {
  let service: RagService;
  let mockConfigRepo: IConfigRepository;

  beforeEach(async () => {
    mockConfigRepo = createMockConfigRepo();
    service = new RagService(mockConfigRepo);
    await service.loadThresholds();
  });

  describe('loadThresholds()', () => {
    it('properly caches thresholds from config repo', async () => {
      expect(mockConfigRepo.getThresholds).toHaveBeenCalledOnce();
      expect(service.isLoaded()).toBe(true);
    });

    it('loads all 9 KPI thresholds', async () => {
      // Verify classification works for each KPI after loading
      expect(service.classify('sprint_commitment', 95)).toBe('green');
      expect(service.classify('release_success_rate', 99)).toBe('green');
      expect(service.classify('capacity_utilization', 95)).toBe('green');
      expect(service.classify('ai_efficiency', 25)).toBe('green');
      expect(service.classify('uat_predictability', 96)).toBe('green');
      expect(service.classify('story_drop_rate', 3)).toBe('green');
      expect(service.classify('rollback_rate', 1)).toBe('green');
    });
  });

  describe('returns amber when thresholds not loaded', () => {
    it('returns amber for any KPI when thresholds are not loaded', () => {
      const freshService = new RagService(mockConfigRepo);
      expect(freshService.classify('sprint_commitment', 95)).toBe('amber');
      expect(freshService.classify('release_success_rate', 99)).toBe('amber');
      expect(freshService.classify('deployment_frequency', 10, 5)).toBe('amber');
    });
  });

  describe("threshold-based 'above' classification", () => {
    describe('sprint_commitment: >90 green, 80-90 amber, <80 red', () => {
      it('returns green when value > 90', () => {
        expect(service.classify('sprint_commitment', 91)).toBe('green');
        expect(service.classify('sprint_commitment', 95)).toBe('green');
        expect(service.classify('sprint_commitment', 100)).toBe('green');
      });

      it('returns amber when value is between 80 and 90 (inclusive)', () => {
        expect(service.classify('sprint_commitment', 80)).toBe('amber');
        expect(service.classify('sprint_commitment', 85)).toBe('amber');
        expect(service.classify('sprint_commitment', 90)).toBe('amber');
      });

      it('returns red when value < 80', () => {
        expect(service.classify('sprint_commitment', 79)).toBe('red');
        expect(service.classify('sprint_commitment', 50)).toBe('red');
        expect(service.classify('sprint_commitment', 0)).toBe('red');
      });
    });

    describe('release_success_rate: >98 green, 95-98 amber, <95 red', () => {
      it('returns green when value > 98', () => {
        expect(service.classify('release_success_rate', 99)).toBe('green');
        expect(service.classify('release_success_rate', 100)).toBe('green');
      });

      it('returns amber when value is between 95 and 98 (inclusive)', () => {
        expect(service.classify('release_success_rate', 95)).toBe('amber');
        expect(service.classify('release_success_rate', 96)).toBe('amber');
        expect(service.classify('release_success_rate', 98)).toBe('amber');
      });

      it('returns red when value < 95', () => {
        expect(service.classify('release_success_rate', 94)).toBe('red');
        expect(service.classify('release_success_rate', 80)).toBe('red');
      });
    });

    describe('capacity_utilization: >90 green, 75-90 amber, <75 red', () => {
      it('returns green when value > 90', () => {
        expect(service.classify('capacity_utilization', 91)).toBe('green');
        expect(service.classify('capacity_utilization', 100)).toBe('green');
      });

      it('returns amber when value is between 75 and 90 (inclusive)', () => {
        expect(service.classify('capacity_utilization', 75)).toBe('amber');
        expect(service.classify('capacity_utilization', 82)).toBe('amber');
        expect(service.classify('capacity_utilization', 90)).toBe('amber');
      });

      it('returns red when value < 75', () => {
        expect(service.classify('capacity_utilization', 74)).toBe('red');
        expect(service.classify('capacity_utilization', 50)).toBe('red');
      });
    });

    describe('ai_efficiency: >20 green, 15-20 amber, <15 red', () => {
      it('returns green when value > 20', () => {
        expect(service.classify('ai_efficiency', 21)).toBe('green');
        expect(service.classify('ai_efficiency', 50)).toBe('green');
      });

      it('returns amber when value is between 15 and 20 (inclusive)', () => {
        expect(service.classify('ai_efficiency', 15)).toBe('amber');
        expect(service.classify('ai_efficiency', 18)).toBe('amber');
        expect(service.classify('ai_efficiency', 20)).toBe('amber');
      });

      it('returns red when value < 15', () => {
        expect(service.classify('ai_efficiency', 14)).toBe('red');
        expect(service.classify('ai_efficiency', 0)).toBe('red');
      });
    });

    describe('uat_predictability: >95 green, 85-95 amber, <85 red', () => {
      it('returns green when value > 95', () => {
        expect(service.classify('uat_predictability', 96)).toBe('green');
        expect(service.classify('uat_predictability', 100)).toBe('green');
      });

      it('returns amber when value is between 85 and 95 (inclusive)', () => {
        expect(service.classify('uat_predictability', 85)).toBe('amber');
        expect(service.classify('uat_predictability', 90)).toBe('amber');
        expect(service.classify('uat_predictability', 95)).toBe('amber');
      });

      it('returns red when value < 85', () => {
        expect(service.classify('uat_predictability', 84)).toBe('red');
        expect(service.classify('uat_predictability', 60)).toBe('red');
      });
    });
  });

  describe("threshold-based 'below' classification", () => {
    describe('story_drop_rate: <5 green, 5-10 amber, >10 red', () => {
      it('returns green when value < 5', () => {
        expect(service.classify('story_drop_rate', 4)).toBe('green');
        expect(service.classify('story_drop_rate', 0)).toBe('green');
        expect(service.classify('story_drop_rate', 2.5)).toBe('green');
      });

      it('returns amber when value is between 5 and 10 (inclusive)', () => {
        expect(service.classify('story_drop_rate', 5)).toBe('amber');
        expect(service.classify('story_drop_rate', 7)).toBe('amber');
        expect(service.classify('story_drop_rate', 10)).toBe('amber');
      });

      it('returns red when value > 10', () => {
        expect(service.classify('story_drop_rate', 11)).toBe('red');
        expect(service.classify('story_drop_rate', 25)).toBe('red');
      });
    });

    describe('rollback_rate: <2 green, 2-5 amber, >5 red', () => {
      it('returns green when value < 2', () => {
        expect(service.classify('rollback_rate', 1)).toBe('green');
        expect(service.classify('rollback_rate', 0)).toBe('green');
        expect(service.classify('rollback_rate', 1.5)).toBe('green');
      });

      it('returns amber when value is between 2 and 5 (inclusive)', () => {
        expect(service.classify('rollback_rate', 2)).toBe('amber');
        expect(service.classify('rollback_rate', 3.5)).toBe('amber');
        expect(service.classify('rollback_rate', 5)).toBe('amber');
      });

      it('returns red when value > 5', () => {
        expect(service.classify('rollback_rate', 6)).toBe('red');
        expect(service.classify('rollback_rate', 15)).toBe('red');
      });
    });
  });

  describe('trend-based classification', () => {
    describe('deployment_frequency: >5% improvement green, ±5% amber, >5% regression red', () => {
      it('returns green when improvement > 5%', () => {
        // 10 -> 11 = +10% improvement
        expect(service.classify('deployment_frequency', 11, 10)).toBe('green');
        // 20 -> 25 = +25% improvement
        expect(service.classify('deployment_frequency', 25, 20)).toBe('green');
      });

      it('returns amber when change is within ±5%', () => {
        // 10 -> 10 = 0% change
        expect(service.classify('deployment_frequency', 10, 10)).toBe('amber');
        // 100 -> 104 = +4% improvement (within ±5)
        expect(service.classify('deployment_frequency', 104, 100)).toBe('amber');
        // 100 -> 96 = -4% regression (within ±5)
        expect(service.classify('deployment_frequency', 96, 100)).toBe('amber');
      });

      it('returns red when regression > 5%', () => {
        // 10 -> 9 = -10% regression
        expect(service.classify('deployment_frequency', 9, 10)).toBe('red');
        // 20 -> 15 = -25% regression
        expect(service.classify('deployment_frequency', 15, 20)).toBe('red');
      });
    });

    describe('dev_cycle_time: >5% reduction green, ±5% amber, >5% increase red', () => {
      it('returns green when reduction > 5%', () => {
        // 10 -> 9 = 10% reduction (improvement for cycle time)
        expect(service.classify('dev_cycle_time', 9, 10)).toBe('green');
        // 20 -> 15 = 25% reduction
        expect(service.classify('dev_cycle_time', 15, 20)).toBe('green');
      });

      it('returns amber when change is within ±5%', () => {
        // 10 -> 10 = 0% change
        expect(service.classify('dev_cycle_time', 10, 10)).toBe('amber');
        // 100 -> 97 = 3% reduction (within ±5)
        expect(service.classify('dev_cycle_time', 97, 100)).toBe('amber');
        // 100 -> 104 = 4% increase (within ±5)
        expect(service.classify('dev_cycle_time', 104, 100)).toBe('amber');
      });

      it('returns red when increase > 5%', () => {
        // 10 -> 11 = 10% increase (regression for cycle time)
        expect(service.classify('dev_cycle_time', 11, 10)).toBe('red');
        // 20 -> 25 = 25% increase
        expect(service.classify('dev_cycle_time', 25, 20)).toBe('red');
      });
    });

    describe('returns amber when previousValue is null/undefined', () => {
      it('returns amber when previousValue is null', () => {
        expect(service.classify('deployment_frequency', 10, null)).toBe('amber');
        expect(service.classify('dev_cycle_time', 5, null)).toBe('amber');
      });

      it('returns amber when previousValue is undefined', () => {
        expect(service.classify('deployment_frequency', 10, undefined)).toBe('amber');
        expect(service.classify('dev_cycle_time', 5, undefined)).toBe('amber');
        expect(service.classify('deployment_frequency', 10)).toBe('amber');
      });
    });

    describe('returns amber when previousValue is 0', () => {
      it('returns amber when previousValue is 0 (cannot compute percentage change)', () => {
        expect(service.classify('deployment_frequency', 10, 0)).toBe('amber');
        expect(service.classify('dev_cycle_time', 5, 0)).toBe('amber');
      });
    });
  });
});
