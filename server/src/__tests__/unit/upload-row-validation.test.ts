import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadService, UploadValidationError } from '../../services/upload.service';
import type { ISprintDataRepository, IConfigRepository } from '../../repositories/interfaces';
import type { IUploadRepository } from '../../services/upload.service';

/**
 * Unit tests for the UploadService row-level Zod validation logic (task 7.2).
 * Tests validateRowsWithSchema and the persistence orchestration pipeline.
 */

describe('UploadService - Row-level validation (validateRowsWithSchema)', () => {
  let service: UploadService;

  beforeEach(() => {
    service = new UploadService();
  });

  it('should return no errors for valid rows', () => {
    const validRows = [
      {
        sno: 1,
        team: 'TeamAlpha',
        track: 'IBPS-POS',
        project: 'ProjectX',
        status: 'Active',
        itemsList: 'Item 1',
        walkthroughGivenOn: '15-01-2024',
        jiraId: 'PROJ-123',
        estimatedEffortWithoutAi: 5,
        actualEffortWithAi: 3,
        aiUsed: 'Y',
        devStartDate: '01-01-2024',
        devEndDate: '15-01-2024',
        developmentStatus: 'Complete',
        uatDeliveryDate: '20-01-2024',
        uatDeliveryTarget: '22-01-2024',
        resources: 'Dev1',
        goLivePlannedDate: '25-01-2024',
        goLiveDate: '25-01-2024',
        productionStatus: 'Live',
        rollback: 'N',
        rollbackReason: null,
        storyDropReason: null,
      },
    ];

    const errors = service.validateRowsWithSchema(validRows);
    expect(errors).toHaveLength(0);
  });

  it('should return no errors when nullable fields are null', () => {
    const rows = [
      {
        sno: 1,
        team: 'TeamBeta',
        track: 'mPro',
        project: 'ProjectY',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'BETA-456',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors).toHaveLength(0);
  });

  it('should report error for invalid sno (non-integer)', () => {
    const rows = [
      {
        sno: 1.5,
        team: 'TeamA',
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'PROJ-1',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].row).toBe(1);
    expect(errors[0].field).toBe('sno');
  });

  it('should report error for invalid jiraId pattern', () => {
    const rows = [
      {
        sno: 1,
        team: 'TeamA',
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'invalid-jira-id',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].row).toBe(1);
    expect(errors[0].field).toBe('jiraId');
  });

  it('should report error for invalid date format', () => {
    const rows = [
      {
        sno: 1,
        team: 'TeamA',
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: 'not-a-date',
        jiraId: 'PROJ-1',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].row).toBe(1);
    expect(errors[0].field).toBe('walkthroughGivenOn');
  });

  it('should report error for invalid aiUsed value', () => {
    const rows = [
      {
        sno: 1,
        team: 'TeamA',
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'PROJ-1',
        estimatedEffortWithoutAi: null,
        actualEffortWithAi: null,
        aiUsed: 'Maybe',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].row).toBe(1);
    expect(errors[0].field).toBe('aiUsed');
  });

  it('should report error for out-of-range estimatedEffortWithoutAi', () => {
    const rows = [
      {
        sno: 1,
        team: 'TeamA',
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'PROJ-1',
        estimatedEffortWithoutAi: 1000,
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].row).toBe(1);
    expect(errors[0].field).toBe('estimatedEffortWithoutAi');
  });

  it('should report errors from multiple rows with correct row numbers', () => {
    const rows = [
      {
        sno: 1,
        team: 'TeamA',
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'PROJ-1',
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
      },
      {
        sno: -1, // Invalid: not positive
        team: 'TeamB',
        track: 'Track2',
        project: 'Proj2',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'PROJ-2',
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
      },
      {
        sno: 3,
        team: '', // Invalid: empty
        track: 'Track3',
        project: 'Proj3',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'PROJ-3',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors.length).toBe(2);
    expect(errors[0].row).toBe(2);
    expect(errors[0].field).toBe('sno');
    expect(errors[1].row).toBe(3);
    expect(errors[1].field).toBe('team');
  });

  it('should cap errors at 100 maximum', () => {
    // Create 150 rows with invalid data
    const rows = Array.from({ length: 150 }, (_, i) => ({
      sno: -1, // Invalid
      team: '', // Invalid
      track: '', // Invalid
      project: '', // Invalid
      status: null,
      itemsList: null,
      walkthroughGivenOn: null,
      jiraId: 'invalid', // Invalid
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
    }));

    const errors = service.validateRowsWithSchema(rows);
    expect(errors.length).toBe(100);
  });

  it('should report error for missing required team field', () => {
    const rows = [
      {
        sno: 1,
        team: undefined, // Missing required field
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: null,
        jiraId: 'PROJ-1',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].row).toBe(1);
    expect(errors[0].field).toBe('team');
  });

  it('should accept ISO 8601 date format', () => {
    const rows = [
      {
        sno: 1,
        team: 'TeamA',
        track: 'Track1',
        project: 'Proj1',
        status: null,
        itemsList: null,
        walkthroughGivenOn: '2024-01-15',
        jiraId: 'PROJ-1',
        estimatedEffortWithoutAi: null,
        actualEffortWithAi: null,
        aiUsed: null,
        devStartDate: '2024-01-01',
        devEndDate: '2024-01-15',
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
      },
    ];

    const errors = service.validateRowsWithSchema(rows);
    expect(errors).toHaveLength(0);
  });
});

describe('UploadService - Persistence orchestration', () => {
  let service: UploadService;
  let mockSprintDataRepo: ISprintDataRepository;
  let mockConfigRepo: IConfigRepository;
  let mockUploadRepo: IUploadRepository;

  beforeEach(() => {
    mockSprintDataRepo = {
      bulkUpsert: vi.fn().mockResolvedValue(3),
      findByFilter: vi.fn().mockResolvedValue([]),
      findByJiraIdAndTeam: vi.fn().mockResolvedValue(null),
      countByUpload: vi.fn().mockResolvedValue(0),
    };

    mockConfigRepo = {
      getThresholds: vi.fn().mockResolvedValue([]),
      getThreshold: vi.fn().mockResolvedValue(null),
      updateThreshold: vi.fn().mockResolvedValue(undefined),
      getTeamConfig: vi.fn().mockResolvedValue(null),
      getAllTeams: vi.fn().mockResolvedValue([]),
      upsertTeamConfig: vi.fn().mockResolvedValue(undefined),
      getTrackPortfolioMapping: vi.fn().mockResolvedValue({
        'IBPS-POS': 'IBPS-POS',
        'IBPS-Dolphin': 'IBPS-Dolphin',
        'mPro': 'mPro',
      }),
    };

    mockUploadRepo = {
      createUploadRecord: vi.fn().mockResolvedValue(undefined),
      updateUploadStatus: vi.fn().mockResolvedValue(undefined),
    };

    service = new UploadService(mockSprintDataRepo, mockConfigRepo, mockUploadRepo);
  });

  it('should map Track to Portfolio using config mapping', async () => {
    // We need to create an actual Excel buffer for processFile
    const XLSX = await import('xlsx');
    const data = [
      {
        Sno: 1,
        TEAM: 'TeamAlpha',
        Track: 'IBPS-POS',
        Project: 'Proj1',
        Status: 'Active',
        'Items List': 'Item 1',
        'Walkthrough Given On': '15-01-2024',
        'JIRA ID': 'PROJ-123',
        'Estimated Effort Without AI (SP)': 5,
        'Actual Effort With AI (Hrs)': 3,
        'AI Used (Y/N)': 'Y',
        'Dev Start Date': '01-01-2024',
        'Dev End Date': '15-01-2024',
        'Development Status': 'Complete',
        'UAT Delivery Date': '20-01-2024',
        'UAT Delivery Target': '22-01-2024',
        Resources: 'Dev1',
        'GO Live Planned Date': '25-01-2024',
        'GO Live Date': '25-01-2024',
        'Production Status': 'Live',
        'Rollback (Y/N)': 'N',
        'Rollback Reason': null,
        'Story Drop Reason': null,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = await service.processFile(buffer, 'test.xlsx', 'user-1');

    expect(result.success).toBe(true);
    expect(result.rowsIngested).toBe(3); // mock returns 3
    expect(mockSprintDataRepo.bulkUpsert).toHaveBeenCalledTimes(1);

    // Verify the rows passed to bulkUpsert have portfolio mapped
    const callArgs = (mockSprintDataRepo.bulkUpsert as any).mock.calls[0];
    const rows = callArgs[0];
    expect(rows[0].portfolio).toBe('IBPS-POS');
    expect(rows[0].track).toBe('IBPS-POS');
  });

  it('should fall back to track name when no portfolio mapping exists', async () => {
    const XLSX = await import('xlsx');
    const data = [
      {
        Sno: 1,
        TEAM: 'TeamBeta',
        Track: 'UnknownTrack',
        Project: 'Proj2',
        Status: null,
        'Items List': null,
        'Walkthrough Given On': null,
        'JIRA ID': 'UNK-1',
        'Estimated Effort Without AI (SP)': null,
        'Actual Effort With AI (Hrs)': null,
        'AI Used (Y/N)': null,
        'Dev Start Date': null,
        'Dev End Date': null,
        'Development Status': null,
        'UAT Delivery Date': null,
        'UAT Delivery Target': null,
        Resources: null,
        'GO Live Planned Date': null,
        'GO Live Date': null,
        'Production Status': null,
        'Rollback (Y/N)': null,
        'Rollback Reason': null,
        'Story Drop Reason': null,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    await service.processFile(buffer, 'test.xlsx', 'user-1');

    const callArgs = (mockSprintDataRepo.bulkUpsert as any).mock.calls[0];
    const rows = callArgs[0];
    expect(rows[0].portfolio).toBe('UnknownTrack');
  });

  it('should create upload record before persisting data', async () => {
    const XLSX = await import('xlsx');
    const data = [
      {
        Sno: 1,
        TEAM: 'TeamA',
        Track: 'mPro',
        Project: 'Proj1',
        Status: null,
        'Items List': null,
        'Walkthrough Given On': null,
        'JIRA ID': 'MP-1',
        'Estimated Effort Without AI (SP)': null,
        'Actual Effort With AI (Hrs)': null,
        'AI Used (Y/N)': null,
        'Dev Start Date': null,
        'Dev End Date': null,
        'Development Status': null,
        'UAT Delivery Date': null,
        'UAT Delivery Target': null,
        Resources: null,
        'GO Live Planned Date': null,
        'GO Live Date': null,
        'Production Status': null,
        'Rollback (Y/N)': null,
        'Rollback Reason': null,
        'Story Drop Reason': null,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    await service.processFile(buffer, 'data.xlsx', 'user-42');

    // Upload record should be created with status 'processing'
    expect(mockUploadRepo.createUploadRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'data.xlsx',
        uploadedBy: 'user-42',
        status: 'processing',
        rowsIngested: 0,
      })
    );

    // Then status updated to 'success'
    expect(mockUploadRepo.updateUploadStatus).toHaveBeenCalledWith(
      expect.any(String),
      'success',
      3 // mock bulkUpsert returns 3
    );
  });

  it('should update upload record to failed on persistence error', async () => {
    (mockSprintDataRepo.bulkUpsert as any).mockRejectedValue(new Error('DB error'));

    const XLSX = await import('xlsx');
    const data = [
      {
        Sno: 1,
        TEAM: 'TeamA',
        Track: 'mPro',
        Project: 'Proj1',
        Status: null,
        'Items List': null,
        'Walkthrough Given On': null,
        'JIRA ID': 'MP-1',
        'Estimated Effort Without AI (SP)': null,
        'Actual Effort With AI (Hrs)': null,
        'AI Used (Y/N)': null,
        'Dev Start Date': null,
        'Dev End Date': null,
        'Development Status': null,
        'UAT Delivery Date': null,
        'UAT Delivery Target': null,
        Resources: null,
        'GO Live Planned Date': null,
        'GO Live Date': null,
        'Production Status': null,
        'Rollback (Y/N)': null,
        'Rollback Reason': null,
        'Story Drop Reason': null,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    await expect(service.processFile(buffer, 'data.xlsx', 'user-1')).rejects.toThrow('DB error');

    expect(mockUploadRepo.updateUploadStatus).toHaveBeenCalledWith(
      expect.any(String),
      'failed',
      0,
      'DB error'
    );
  });

  it('should throw UploadValidationError when row validation fails', async () => {
    const XLSX = await import('xlsx');
    const data = [
      {
        Sno: -1, // Invalid: not positive
        TEAM: 'TeamA',
        Track: 'Track1',
        Project: 'Proj1',
        Status: null,
        'Items List': null,
        'Walkthrough Given On': null,
        'JIRA ID': 'bad-id', // Invalid pattern
        'Estimated Effort Without AI (SP)': null,
        'Actual Effort With AI (Hrs)': null,
        'AI Used (Y/N)': null,
        'Dev Start Date': null,
        'Dev End Date': null,
        'Development Status': null,
        'UAT Delivery Date': null,
        'UAT Delivery Target': null,
        Resources: null,
        'GO Live Planned Date': null,
        'GO Live Date': null,
        'Production Status': null,
        'Rollback (Y/N)': null,
        'Rollback Reason': null,
        'Story Drop Reason': null,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    try {
      await service.processFile(buffer, 'test.xlsx', 'user-1');
      expect.fail('Should have thrown UploadValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(UploadValidationError);
      const validationError = error as UploadValidationError;
      expect(validationError.errors.length).toBeGreaterThan(0);
      // Should not have called persistence methods
      expect(mockSprintDataRepo.bulkUpsert).not.toHaveBeenCalled();
      // Should not have created upload record (validation fails before persistence)
      expect(mockUploadRepo.createUploadRecord).not.toHaveBeenCalled();
    }
  });

  it('should return UploadResult with correct structure on success', async () => {
    const XLSX = await import('xlsx');
    const data = [
      {
        Sno: 1,
        TEAM: 'TeamA',
        Track: 'mPro',
        Project: 'Proj1',
        Status: null,
        'Items List': null,
        'Walkthrough Given On': null,
        'JIRA ID': 'MP-1',
        'Estimated Effort Without AI (SP)': null,
        'Actual Effort With AI (Hrs)': null,
        'AI Used (Y/N)': null,
        'Dev Start Date': null,
        'Dev End Date': null,
        'Development Status': null,
        'UAT Delivery Date': null,
        'UAT Delivery Target': null,
        Resources: null,
        'GO Live Planned Date': null,
        'GO Live Date': null,
        'Production Status': null,
        'Rollback (Y/N)': null,
        'Rollback Reason': null,
        'Story Drop Reason': null,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = await service.processFile(buffer, 'test.xlsx', 'user-1');

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('rowsIngested', 3);
    expect(result).toHaveProperty('uploadId');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.uploadId).toBe('string');
    expect(result.uploadId.length).toBeGreaterThan(0);
    expect(typeof result.timestamp).toBe('string');
  });
});
