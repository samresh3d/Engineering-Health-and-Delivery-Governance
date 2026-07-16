import { describe, it, expect } from 'vitest';
import {
  dateStringSchema,
  yesNoSchema,
  revisedExcelRowSchema,
  JIRA_ID_PATTERN,
} from '../../validators/upload.validator';

describe('Upload Validator - dateStringSchema', () => {
  it('accepts DD-MM-YYYY format', () => {
    expect(dateStringSchema.safeParse('25-12-2024').success).toBe(true);
  });

  it('accepts ISO 8601 format', () => {
    expect(dateStringSchema.safeParse('2024-12-25').success).toBe(true);
    expect(dateStringSchema.safeParse('2024-12-25T10:30:00Z').success).toBe(true);
  });

  it('accepts DD-MMM-YY format', () => {
    expect(dateStringSchema.safeParse('25-Dec-24').success).toBe(true);
    expect(dateStringSchema.safeParse('1-Jan-99').success).toBe(true);
  });

  it('accepts DD-MMM-YYYY format', () => {
    expect(dateStringSchema.safeParse('25-Dec-2024').success).toBe(true);
    expect(dateStringSchema.safeParse('1-Jan-2000').success).toBe(true);
  });

  it('accepts Excel serial numbers', () => {
    expect(dateStringSchema.safeParse(45651).success).toBe(true);
    expect(dateStringSchema.safeParse(1).success).toBe(true);
  });

  it('rejects invalid date strings', () => {
    expect(dateStringSchema.safeParse('not-a-date').success).toBe(false);
    expect(dateStringSchema.safeParse('12/25/2024').success).toBe(false);
    expect(dateStringSchema.safeParse('').success).toBe(false);
  });

  it('rejects invalid Excel serials', () => {
    expect(dateStringSchema.safeParse(0).success).toBe(false);
    expect(dateStringSchema.safeParse(-1).success).toBe(false);
    expect(dateStringSchema.safeParse(Infinity).success).toBe(false);
  });
});

describe('Upload Validator - JIRA_ID_PATTERN', () => {
  it('matches valid JIRA IDs', () => {
    expect(JIRA_ID_PATTERN.test('ECOM-1234')).toBe(true);
    expect(JIRA_ID_PATTERN.test('SPS1-12456')).toBe(true);
    expect(JIRA_ID_PATTERN.test('ABC-1')).toBe(true);
    expect(JIRA_ID_PATTERN.test('A1B2-99')).toBe(true);
  });

  it('rejects invalid JIRA IDs', () => {
    expect(JIRA_ID_PATTERN.test('ecom-1234')).toBe(false);  // lowercase
    expect(JIRA_ID_PATTERN.test('ECOM1234')).toBe(false);   // no hyphen
    expect(JIRA_ID_PATTERN.test('-1234')).toBe(false);       // no key
    expect(JIRA_ID_PATTERN.test('ECOM-')).toBe(false);      // no number
    expect(JIRA_ID_PATTERN.test('ECOM-abc')).toBe(false);   // non-numeric after hyphen
  });
});

describe('Upload Validator - yesNoSchema', () => {
  it('accepts uppercase Y/N', () => {
    expect(yesNoSchema.safeParse('Y').success).toBe(true);
    expect(yesNoSchema.safeParse('N').success).toBe(true);
  });

  it('accepts lowercase y/n and normalizes to uppercase', () => {
    const yResult = yesNoSchema.safeParse('y');
    expect(yResult.success).toBe(true);
    if (yResult.success) expect(yResult.data).toBe('Y');

    const nResult = yesNoSchema.safeParse('n');
    expect(nResult.success).toBe(true);
    if (nResult.success) expect(nResult.data).toBe('N');
  });

  it('rejects other values', () => {
    expect(yesNoSchema.safeParse('Yes').success).toBe(false);
    expect(yesNoSchema.safeParse('No').success).toBe(false);
    expect(yesNoSchema.safeParse('1').success).toBe(false);
    expect(yesNoSchema.safeParse('').success).toBe(false);
  });
});

describe('Upload Validator - revisedExcelRowSchema', () => {
  const validRow = {
    sno: 1,
    function: 'E-Com',
    team: 'Retail',
    storyName: 'Implement checkout flow',
    walkthroughGivenOn: '25-12-2024',
    jiraId: 'ECOM-1234',
    devStartDate: '2024-01-15',
    devCompleteDate: null,
    withAiStoryPoints: 5,
    uatDeliveryDate: null,
    uatDeliveryTarget: null,
    resources: 'John, Jane',
    goLivePlannedDate: null,
    goLiveDate: null,
    productionStatus: 'Live',
    rollback: 'N',
    rollbackReason: null,
    aiUsed: 'Y',
    estimatedEffortWithoutAi: 40.5,
    actualEffort: 35.0,
    actualEffortWithAi: 28.5,
    storyStatus: 'Done',
    storyDropReason: null,
    definitionOfReady: 'Y',
    definitionOfDone: 'Y',
    refinementClosureDate: '10-Jan-2024',
    uatStartDate: null,
    uatCompleteDate: null,
    delayReason: null,
    delayReasonDescription: null,
  };

  it('accepts a fully valid row', () => {
    const result = revisedExcelRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('has exactly 30 fields (29 columns + sno)', () => {
    // The schema defines 30 keys matching the 29-column template + sno
    const keys = Object.keys(revisedExcelRowSchema.shape);
    expect(keys).toHaveLength(30);
  });

  it('rejects function exceeding 100 characters', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      function: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty function', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      function: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects numeric fields exceeding 99999.99', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      withAiStoryPoints: 100000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative numeric fields', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      actualEffort: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid JIRA ID', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      jiraId: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts case-insensitive Y/N and normalizes', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      rollback: 'y',
      aiUsed: 'n',
      definitionOfReady: 'Y',
      definitionOfDone: 'N',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rollback).toBe('Y');
      expect(result.data.aiUsed).toBe('N');
    }
  });

  it('rejects delayReasonDescription exceeding 2000 characters', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      delayReasonDescription: 'A'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts delayReasonDescription at exactly 2000 characters', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      delayReasonDescription: 'A'.repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it('accepts nullable sno', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      sno: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts Excel serial for date fields', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      walkthroughGivenOn: 45651,
      devStartDate: 45000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects text fields exceeding 500 characters', () => {
    const result = revisedExcelRowSchema.safeParse({
      ...validRow,
      team: 'A'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
