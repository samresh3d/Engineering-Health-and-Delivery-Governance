import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KpiEngineService, type IRagService } from '../../services/kpi-engine.service';
import type { ISprintDataRepository, IKpiResultsRepository, IConfigRepository } from '../../repositories/interfaces';
import type { SprintDataRow, KpiComputedResult, KpiFilter, KpiName, TeamConfig } from '../../types/index';

/**
 * Creates a minimal SprintDataRow with defaults for testing.
 */
function createRow(overrides: Partial<SprintDataRow> = {}): SprintDataRow {
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

function createMockSprintDataRepo(rows: SprintDataRow[] = []): ISprintDataRepository {
  return {
    bulkUpsert: vi.fn().mockResolvedValue(0),
    findByFilter: vi.fn().mockResolvedValue(rows),
    findByJiraIdAndTeam: vi.fn().mockResolvedValue(null),
    countByUpload: vi.fn().mockResolvedValue(0),
  };
}

function createMockKpiResultsRepo(trendResults: KpiComputedResult[] = []): IKpiResultsRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    saveBatch: vi.fn().mockResolvedValue(undefined),
    findLatest: vi.fn().mockResolvedValue([]),
    findTrend: vi.fn().mockResolvedValue(trendResults),
  };
}

function createMockConfigRepo(teamConfig: TeamConfig | null = null): IConfigRepository {
  return {
    getThresholds: vi.fn().mockResolvedValue([]),
    getThreshold: vi.fn().mockResolvedValue(null),
    updateThreshold: vi.fn().mockResolvedValue(undefined),
    getTeamConfig: vi.fn().mockResolvedValue(teamConfig),
    getAllTeams: vi.fn().mockResolvedValue([]),
    upsertTeamConfig: vi.fn().mockResolvedValue(undefined),
    getTrackPortfolioMapping: vi.fn().mockResolvedValue({}),
  };
}

describe('KpiEngineService', () => {
  let sprintDataRepo: ISprintDataRepository;
  let kpiResultsRepo: IKpiResultsRepository;
  let configRepo: IConfigRepository;
  let service: KpiEngineService;

  const filter: KpiFilter = {
    team: 'TeamA',
    startDate: '2024-01-01',
    endDate: '2024-01-31',
  };

  beforeEach(() => {
    sprintDataRepo = createMockSprintDataRepo();
    kpiResultsRepo = createMockKpiResultsRepo();
    configRepo = createMockConfigRepo();
    service = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo);
  });

  describe('calculateAll', () => {
    it('should return results for all 9 KPIs', async () => {
      const rows = [
        createRow({ developmentStatus: 'Complete', goLiveDate: '01-01-2024', rollback: 'N' }),
        createRow({ developmentStatus: 'In Progress', jiraId: 'PROJ-2' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const results = await service.calculateAll(filter);

      expect(results).toHaveLength(9);
      const kpiNames = results.map((r) => r.kpiName);
      expect(kpiNames).toContain('sprint_commitment');
      expect(kpiNames).toContain('release_success_rate');
      expect(kpiNames).toContain('deployment_frequency');
      expect(kpiNames).toContain('capacity_utilization');
      expect(kpiNames).toContain('ai_efficiency');
      expect(kpiNames).toContain('uat_predictability');
      expect(kpiNames).toContain('dev_cycle_time');
      expect(kpiNames).toContain('story_drop_rate');
      expect(kpiNames).toContain('rollback_rate');
    });

    it('should query data using the provided filter', async () => {
      await service.calculateAll(filter);

      expect(sprintDataRepo.findByFilter).toHaveBeenCalledWith(filter);
    });

    it('should persist results via saveBatch', async () => {
      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      await service.calculateAll(filter);

      expect(kpiResultsRepo.saveBatch).toHaveBeenCalledTimes(1);
      const savedBatch = (kpiResultsRepo.saveBatch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedBatch).toHaveLength(9);
    });

    it('should persist results with correct team, portfolio, period from filter', async () => {
      const filterWithPortfolio: KpiFilter = {
        team: 'TeamA',
        portfolio: 'PortfolioA',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };
      const rows = [createRow()];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      await service.calculateAll(filterWithPortfolio);

      const savedBatch = (kpiResultsRepo.saveBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as KpiComputedResult[];
      for (const result of savedBatch) {
        expect(result.team).toBe('TeamA');
        expect(result.portfolio).toBe('PortfolioA');
        expect(result.periodStart).toBe('2024-01-01');
        expect(result.periodEnd).toBe('2024-01-31');
        expect(result.calculatedAt).toBeDefined();
      }
    });

    it('should set team and portfolio to null when not in filter', async () => {
      const noTeamFilter: KpiFilter = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const rows = [createRow()];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      await service.calculateAll(noTeamFilter);

      const savedBatch = (kpiResultsRepo.saveBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as KpiComputedResult[];
      for (const result of savedBatch) {
        expect(result.team).toBeNull();
        expect(result.portfolio).toBeNull();
      }
    });

    it('should calculate sprint commitment correctly', async () => {
      const rows = [
        createRow({ developmentStatus: 'Complete', jiraId: 'PROJ-1' }),
        createRow({ developmentStatus: 'Complete', jiraId: 'PROJ-2' }),
        createRow({ developmentStatus: 'In Progress', jiraId: 'PROJ-3' }),
        createRow({ developmentStatus: 'In Progress', jiraId: 'PROJ-4' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const results = await service.calculateAll(filter);
      const sc = results.find((r) => r.kpiName === 'sprint_commitment');

      expect(sc?.value).toBe(50);
      expect(sc?.insufficientData).toBe(false);
    });

    it('should return insufficientData when no rows returned', async () => {
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const results = await service.calculateAll(filter);

      for (const result of results) {
        expect(result.value).toBeNull();
        expect(result.insufficientData).toBe(true);
      }
    });

    it('should default RAG status to amber when no RAG service provided', async () => {
      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const results = await service.calculateAll(filter);

      for (const result of results) {
        expect(result.ragStatus).toBe('amber');
      }
    });

    it('should use RAG service when provided', async () => {
      const mockRagService: IRagService = {
        classify: vi.fn().mockReturnValue('green'),
      };
      const serviceWithRag = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo, mockRagService);
      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const results = await serviceWithRag.calculateAll(filter);

      // KPIs with non-null values should use the RAG service
      const withValues = results.filter((r) => r.value !== null);
      for (const result of withValues) {
        expect(result.ragStatus).toBe('green');
      }
      // KPIs with null values should default to 'amber' regardless
      const withNull = results.filter((r) => r.value === null);
      for (const result of withNull) {
        expect(result.ragStatus).toBe('amber');
      }
    });
  });

  describe('calculateSingle', () => {
    it('should return a single KPI result', async () => {
      const rows = [
        createRow({ developmentStatus: 'Complete', jiraId: 'PROJ-1' }),
        createRow({ developmentStatus: 'In Progress', jiraId: 'PROJ-2' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('sprint_commitment', filter);

      expect(result.kpiName).toBe('sprint_commitment');
      expect(result.value).toBe(50);
      expect(result.insufficientData).toBe(false);
    });

    it('should persist result via save (not saveBatch)', async () => {
      const rows = [createRow()];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      await service.calculateSingle('sprint_commitment', filter);

      expect(kpiResultsRepo.save).toHaveBeenCalledTimes(1);
      expect(kpiResultsRepo.saveBatch).not.toHaveBeenCalled();
    });

    it('should query sprint data with the provided filter', async () => {
      await service.calculateSingle('sprint_commitment', filter);

      expect(sprintDataRepo.findByFilter).toHaveBeenCalledWith(filter);
    });
  });

  describe('capacity utilization', () => {
    it('should use team config for capacity hours', async () => {
      const teamConfig: TeamConfig = {
        teamName: 'TeamA',
        portfolio: 'PortfolioA',
        capacityHoursPerSprint: 100,
        updatedAt: '2024-01-01T00:00:00Z',
      };
      configRepo = createMockConfigRepo(teamConfig);
      service = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo);

      const rows = [
        createRow({ actualEffortWithAi: 45, jiraId: 'PROJ-1' }),
        createRow({ actualEffortWithAi: 35, jiraId: 'PROJ-2' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('capacity_utilization', filter);

      expect(configRepo.getTeamConfig).toHaveBeenCalledWith('TeamA');
      expect(result.value).toBe(80); // (45+35)/100 * 100
      expect(result.insufficientData).toBe(false);
    });

    it('should return insufficient data when no team in filter', async () => {
      const noTeamFilter: KpiFilter = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const rows = [createRow({ actualEffortWithAi: 45 })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('capacity_utilization', noTeamFilter);

      expect(result.value).toBeNull();
      expect(result.insufficientData).toBe(true);
    });

    it('should return insufficient data when team config not found', async () => {
      const rows = [createRow({ actualEffortWithAi: 45 })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('capacity_utilization', filter);

      // configRepo returns null by default
      expect(result.value).toBeNull();
      expect(result.insufficientData).toBe(true);
    });
  });

  describe('percent change calculation', () => {
    it('should calculate percent change when previous period exists', async () => {
      const previousResult: KpiComputedResult = {
        kpiName: 'sprint_commitment',
        value: 80,
        ragStatus: 'amber',
        percentChange: null,
        team: 'TeamA',
        portfolio: null,
        sprint: null,
        periodStart: '2023-12-01',
        periodEnd: '2023-12-31',
        calculatedAt: '2024-01-01T00:00:00Z',
        insufficientData: false,
      };
      kpiResultsRepo = createMockKpiResultsRepo([previousResult]);
      service = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo);

      const rows = [
        createRow({ developmentStatus: 'Complete', jiraId: 'PROJ-1' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('sprint_commitment', filter);

      // current = 100 (1/1 complete), previous = 80
      // percent change = ((100 - 80) / 80) * 100 = 25
      expect(result.percentChange).toBe(25);
    });

    it('should return null percent change when no previous period', async () => {
      kpiResultsRepo = createMockKpiResultsRepo([]); // no trend data
      service = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo);

      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('sprint_commitment', filter);

      expect(result.percentChange).toBeNull();
    });

    it('should return null percent change when previous value is null', async () => {
      const previousResult: KpiComputedResult = {
        kpiName: 'sprint_commitment',
        value: null,
        ragStatus: 'amber',
        percentChange: null,
        team: 'TeamA',
        portfolio: null,
        sprint: null,
        periodStart: '2023-12-01',
        periodEnd: '2023-12-31',
        calculatedAt: '2024-01-01T00:00:00Z',
        insufficientData: true,
      };
      kpiResultsRepo = createMockKpiResultsRepo([previousResult]);
      service = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo);

      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('sprint_commitment', filter);

      expect(result.percentChange).toBeNull();
    });

    it('should return null percent change when previous value is zero', async () => {
      const previousResult: KpiComputedResult = {
        kpiName: 'sprint_commitment',
        value: 0,
        ragStatus: 'red',
        percentChange: null,
        team: 'TeamA',
        portfolio: null,
        sprint: null,
        periodStart: '2023-12-01',
        periodEnd: '2023-12-31',
        calculatedAt: '2024-01-01T00:00:00Z',
        insufficientData: false,
      };
      kpiResultsRepo = createMockKpiResultsRepo([previousResult]);
      service = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo);

      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('sprint_commitment', filter);

      expect(result.percentChange).toBeNull();
    });

    it('should round percent change to 2 decimal places', async () => {
      const previousResult: KpiComputedResult = {
        kpiName: 'sprint_commitment',
        value: 75,
        ragStatus: 'red',
        percentChange: null,
        team: 'TeamA',
        portfolio: null,
        sprint: null,
        periodStart: '2023-12-01',
        periodEnd: '2023-12-31',
        calculatedAt: '2024-01-01T00:00:00Z',
        insufficientData: false,
      };
      kpiResultsRepo = createMockKpiResultsRepo([previousResult]);
      service = new KpiEngineService(sprintDataRepo, kpiResultsRepo, configRepo);

      // 2 of 3 complete = 66.67%
      const rows = [
        createRow({ developmentStatus: 'Complete', jiraId: 'PROJ-1' }),
        createRow({ developmentStatus: 'Complete', jiraId: 'PROJ-2' }),
        createRow({ developmentStatus: 'In Progress', jiraId: 'PROJ-3' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const result = await service.calculateSingle('sprint_commitment', filter);

      // current = 66.67, previous = 75
      // change = ((66.67 - 75) / 75) * 100 = -11.106...
      expect(result.percentChange).toBe(-11.11);
    });

    it('should use empty string for team in findTrend when no team in filter', async () => {
      const noTeamFilter: KpiFilter = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      await service.calculateSingle('sprint_commitment', noTeamFilter);

      expect(kpiResultsRepo.findTrend).toHaveBeenCalledWith('sprint_commitment', '', 2);
    });

    it('should use team from filter in findTrend', async () => {
      const rows = [createRow({ developmentStatus: 'Complete' })];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      await service.calculateSingle('sprint_commitment', filter);

      expect(kpiResultsRepo.findTrend).toHaveBeenCalledWith('sprint_commitment', 'TeamA', 2);
    });
  });

  describe('all individual KPI calculations via calculateAll', () => {
    it('should calculate release success rate correctly', async () => {
      const rows = [
        createRow({ goLiveDate: '01-01-2024', rollback: 'N', jiraId: 'PROJ-1' }),
        createRow({ goLiveDate: '02-01-2024', rollback: 'Y', jiraId: 'PROJ-2' }),
        createRow({ goLiveDate: '03-01-2024', rollback: 'N', jiraId: 'PROJ-3' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const results = await service.calculateAll(filter);
      const rsr = results.find((r) => r.kpiName === 'release_success_rate');

      // 2/3 * 100 = 66.67
      expect(rsr?.value).toBe(66.67);
    });

    it('should calculate deployment frequency correctly', async () => {
      const rows = [
        createRow({ goLiveDate: '01-01-2024', jiraId: 'PROJ-1' }),
        createRow({ goLiveDate: '01-01-2024', jiraId: 'PROJ-2' }), // same date
        createRow({ goLiveDate: '05-01-2024', jiraId: 'PROJ-3' }),
        createRow({ goLiveDate: null, jiraId: 'PROJ-4' }), // no go live
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const results = await service.calculateAll(filter);
      const df = results.find((r) => r.kpiName === 'deployment_frequency');

      // 2 distinct dates
      expect(df?.value).toBe(2);
    });

    it('should calculate story drop rate correctly', async () => {
      const rows = [
        createRow({ storyDropReason: 'Scope change', jiraId: 'PROJ-1' }),
        createRow({ storyDropReason: null, jiraId: 'PROJ-2' }),
        createRow({ storyDropReason: '', jiraId: 'PROJ-3' }),
        createRow({ storyDropReason: 'Priority shift', jiraId: 'PROJ-4' }),
      ];
      (sprintDataRepo.findByFilter as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

      const results = await service.calculateAll(filter);
      const sdr = results.find((r) => r.kpiName === 'story_drop_rate');

      // 2/4 * 100 = 50
      expect(sdr?.value).toBe(50);
    });
  });
});
