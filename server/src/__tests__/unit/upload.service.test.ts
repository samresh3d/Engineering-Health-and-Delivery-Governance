import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  UploadService,
  UploadValidationError,
  REQUIRED_COLUMNS,
} from '../../services/upload.service';

/**
 * Helper: creates an Excel buffer with specified headers and rows.
 */
function createExcelBuffer(
  headers: string[],
  rows: (string | number | null)[][] = []
): Buffer {
  const wb = XLSX.utils.book_new();
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Helper: creates valid sample data rows matching the required columns.
 */
function createValidRow(): (string | number | null)[] {
  return [
    1,              // Sno
    'Team Alpha',   // TEAM
    'Backend',      // Track
    'Project X',    // Project
    'Active',       // Status
    'Item 1',       // Items List
    '01-01-2024',   // Walkthrough Given On
    'PROJ-123',     // JIRA ID
    5,              // Estimated Effort Without AI (SP)
    3,              // Actual Effort With AI (Hrs)
    'Y',            // AI Used (Y/N)
    '01-01-2024',   // Dev Start Date
    '15-01-2024',   // Dev End Date
    'Completed',    // Development Status
    '20-01-2024',   // UAT Delivery Date
    '18-01-2024',   // UAT Delivery Target
    'Dev1',         // Resources
    '25-01-2024',   // GO Live Planned Date
    '25-01-2024',   // GO Live Date
    'Live',         // Production Status
    'N',            // Rollback (Y/N)
    null,           // Rollback Reason
    null,           // Story Drop Reason
  ];
}

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(() => {
    service = new UploadService();
  });

  describe('validateFileFormat', () => {
    it('should accept .xlsx files', () => {
      const errors = service.validateFileFormat('data.xlsx');
      expect(errors).toHaveLength(0);
    });

    it('should accept .xls files', () => {
      const errors = service.validateFileFormat('data.xls');
      expect(errors).toHaveLength(0);
    });

    it('should accept filenames with mixed case extensions', () => {
      const errors = service.validateFileFormat('data.XLSX');
      expect(errors).toHaveLength(0);
    });

    it('should reject .csv files', () => {
      const errors = service.validateFileFormat('data.csv');
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('file');
      expect(errors[0].message).toContain('.csv');
    });

    it('should reject .pdf files', () => {
      const errors = service.validateFileFormat('report.pdf');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('.pdf');
    });

    it('should reject files with no extension', () => {
      const errors = service.validateFileFormat('datafile');
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('file');
    });

    it('should reject .txt files', () => {
      const errors = service.validateFileFormat('notes.txt');
      expect(errors).toHaveLength(1);
    });
  });

  describe('validateFileSize', () => {
    it('should accept files under 10 MB', () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024); // 5 MB
      const errors = service.validateFileSize(buffer);
      expect(errors).toHaveLength(0);
    });

    it('should accept files exactly 10 MB', () => {
      const buffer = Buffer.alloc(10 * 1024 * 1024); // 10 MB
      const errors = service.validateFileSize(buffer);
      expect(errors).toHaveLength(0);
    });

    it('should reject files over 10 MB', () => {
      const buffer = Buffer.alloc(10 * 1024 * 1024 + 1); // 10 MB + 1 byte
      const errors = service.validateFileSize(buffer);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('file');
      expect(errors[0].message).toContain('10 MB');
    });

    it('should accept empty buffers', () => {
      const buffer = Buffer.alloc(0);
      const errors = service.validateFileSize(buffer);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateColumns', () => {
    it('should pass when all required columns are present', () => {
      const errors = service.validateColumns([...REQUIRED_COLUMNS]);
      expect(errors).toHaveLength(0);
    });

    it('should report a single missing column', () => {
      const headers = [...REQUIRED_COLUMNS].filter((h) => h !== 'JIRA ID');
      const errors = service.validateColumns(headers);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('JIRA ID');
      expect(errors[0].message).toContain('JIRA ID');
    });

    it('should report multiple missing columns', () => {
      const headers = [...REQUIRED_COLUMNS].filter(
        (h) => h !== 'JIRA ID' && h !== 'TEAM' && h !== 'Track'
      );
      const errors = service.validateColumns(headers);
      expect(errors).toHaveLength(3);
      const fields = errors.map((e) => e.field);
      expect(fields).toContain('JIRA ID');
      expect(fields).toContain('TEAM');
      expect(fields).toContain('Track');
    });

    it('should handle headers with leading/trailing whitespace', () => {
      const headers = REQUIRED_COLUMNS.map((h) => `  ${h}  `);
      const errors = service.validateColumns(headers);
      expect(errors).toHaveLength(0);
    });

    it('should fail when given an empty header list', () => {
      const errors = service.validateColumns([]);
      expect(errors).toHaveLength(REQUIRED_COLUMNS.length);
    });
  });

  describe('validateRows', () => {
    it('should pass when rows have data', () => {
      const errors = service.validateRows([{ sno: 1 }, { sno: 2 }]);
      expect(errors).toHaveLength(0);
    });

    it('should fail when rows array is empty', () => {
      const errors = service.validateRows([]);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('data');
      expect(errors[0].message).toContain('no data rows');
    });
  });

  describe('processFile', () => {
    it('should reject non-xlsx files before parsing', async () => {
      const buffer = Buffer.from('not excel data');
      await expect(
        service.processFile(buffer, 'data.csv', 'user-1')
      ).rejects.toThrow(UploadValidationError);

      try {
        await service.processFile(buffer, 'data.csv', 'user-1');
      } catch (err) {
        expect(err).toBeInstanceOf(UploadValidationError);
        expect((err as UploadValidationError).errors[0].message).toContain('.csv');
      }
    });

    it('should reject files exceeding 10 MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      await expect(
        service.processFile(largeBuffer, 'big.xlsx', 'user-1')
      ).rejects.toThrow(UploadValidationError);

      try {
        await service.processFile(largeBuffer, 'big.xlsx', 'user-1');
      } catch (err) {
        expect(err).toBeInstanceOf(UploadValidationError);
        expect((err as UploadValidationError).errors[0].message).toContain('10 MB');
      }
    });

    it('should reject files with missing required columns', async () => {
      const incompleteHeaders = ['Sno', 'TEAM', 'Track'];
      const buffer = createExcelBuffer(incompleteHeaders, [[1, 'A', 'B']]);

      await expect(
        service.processFile(buffer, 'data.xlsx', 'user-1')
      ).rejects.toThrow(UploadValidationError);

      try {
        await service.processFile(buffer, 'data.xlsx', 'user-1');
      } catch (err) {
        const validationErr = err as UploadValidationError;
        expect(validationErr.errors.length).toBeGreaterThan(0);
        // Should report 20 missing columns (23 - 3 provided)
        expect(validationErr.errors).toHaveLength(REQUIRED_COLUMNS.length - 3);
      }
    });

    it('should reject files with headers but no data rows', async () => {
      const buffer = createExcelBuffer([...REQUIRED_COLUMNS]);

      await expect(
        service.processFile(buffer, 'empty.xlsx', 'user-1')
      ).rejects.toThrow(UploadValidationError);

      try {
        await service.processFile(buffer, 'empty.xlsx', 'user-1');
      } catch (err) {
        const validationErr = err as UploadValidationError;
        expect(validationErr.errors[0].message).toContain('no data rows');
      }
    });

    it('should successfully parse a valid Excel file', async () => {
      const buffer = createExcelBuffer(
        [...REQUIRED_COLUMNS],
        [createValidRow(), createValidRow()]
      );

      const result = await service.processFile(buffer, 'sprint.xlsx', 'user-1');

      expect(result.success).toBe(true);
      expect(result.rowsIngested).toBe(2);
      expect(result.uploadId).toBeDefined();
      expect(result.uploadId).toHaveLength(36); // UUID format
      expect(result.timestamp).toBeDefined();
    });

    it('should work with .xls extension', async () => {
      const buffer = createExcelBuffer(
        [...REQUIRED_COLUMNS],
        [createValidRow()]
      );

      const result = await service.processFile(buffer, 'data.xls', 'user-1');
      expect(result.success).toBe(true);
      expect(result.rowsIngested).toBe(1);
    });

    it('should generate a unique uploadId for each call', async () => {
      const buffer = createExcelBuffer(
        [...REQUIRED_COLUMNS],
        [createValidRow()]
      );

      const result1 = await service.processFile(buffer, 'a.xlsx', 'user-1');
      const result2 = await service.processFile(buffer, 'b.xlsx', 'user-1');

      expect(result1.uploadId).not.toBe(result2.uploadId);
    });
  });

  describe('REQUIRED_COLUMNS', () => {
    it('should contain 23 columns', () => {
      expect(REQUIRED_COLUMNS).toHaveLength(23);
    });

    it('should include key columns', () => {
      expect(REQUIRED_COLUMNS).toContain('Sno');
      expect(REQUIRED_COLUMNS).toContain('JIRA ID');
      expect(REQUIRED_COLUMNS).toContain('TEAM');
      expect(REQUIRED_COLUMNS).toContain('Story Drop Reason');
      expect(REQUIRED_COLUMNS).toContain('Rollback (Y/N)');
    });
  });
});
