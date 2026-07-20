/**
 * Integration test for auto-save wiring (task 14.8).
 *
 * Part A verifies that committing an edit through the LeadershipProvider drives
 * the persistence layer: the default `persistenceService` writes the working
 * set to `window.localStorage` under {@link STORAGE_KEY} (Req 10.1).
 *
 * Part B verifies that the {@link importService} never parses workbooks itself
 * but delegates to the shared {@link excelParser} (Req 11.4) — both by observing
 * the delegated call and by observing that its results mirror the parser's.
 *
 * Framework: Vitest + @testing-library/react (`renderHook` / `act`) on jsdom.
 * This is a regular integration test (NOT a property test).
 *
 * Requirements: 10.1, 11.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import * as XLSX from 'xlsx';

import { LeadershipProvider } from '../state/LeadershipProvider';
import { useLeadership } from '../state/useLeadership';
import { toRows } from '../services/grid-projector';
import { STORAGE_KEY } from '../services/persistence-service';
import { excelParser } from '../services/excel-parser';
import { importService } from '../services/import-service';

/** Render the provider hook via a wrapper element. */
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(LeadershipProvider, null, children);

/**
 * Build a fixed, valid `KPIs` workbook in the normalized (long) layout the
 * parser recognizes: header row followed by a single data row.
 */
function makeWorkbookBuffer(): ArrayBuffer {
  const header = [
    'Team',
    'KPI',
    'Value',
    'Target',
    'Year',
    'Month',
    'Pillar',
    'Direction',
  ];
  const row = [
    'Platform',
    'Deployment Frequency',
    50,
    80,
    2025,
    'Jan',
    'Delivery',
    'HigherIsBetter',
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([header, row]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'KPIs');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('auto-save wiring (Req 10.1)', () => {
  it('persists the working set to storage under STORAGE_KEY when an edit is committed', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { result } = renderHook(() => useLeadership(), { wrapper });

    // Load a valid model.
    const buffer = makeWorkbookBuffer();
    act(() => {
      result.current.uploadWorkbook(buffer);
    });
    expect(result.current.model).not.toBeNull();

    // Nothing should have been persisted yet (upload alone does not auto-save).
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    // Pick a row to edit.
    const rows = toRows(result.current.model!);
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];

    // Commit an edit — this should trigger the auto-save side effect.
    act(() => {
      result.current.commitEdit(row.id, 'actual', '123');
    });

    // The storage adapter was invoked with the namespaced key.
    expect(setItemSpy).toHaveBeenCalled();
    expect(setItemSpy.mock.calls.some(([key]) => key === STORAGE_KEY)).toBe(true);

    // The persisted payload exists and is well-formed.
    const persisted = localStorage.getItem(STORAGE_KEY);
    expect(persisted).not.toBeNull();

    const parsed = JSON.parse(persisted!) as {
      model: unknown;
      auditTrail: unknown[];
    };
    expect(parsed.model).toBeTruthy();
    // The commit was recorded and saved as part of the working set.
    expect(Array.isArray(parsed.auditTrail)).toBe(true);
    expect(parsed.auditTrail.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ImportService delegates to excelParser (Req 11.4)', () => {
  it('calls excelParser.parse once with the supplied buffer and returns its model', () => {
    const parseSpy = vi.spyOn(excelParser, 'parse');
    const buffer = makeWorkbookBuffer();

    const result = importService.importWorkbook(null, buffer, 'replace');

    // Delegation: the parser was invoked exactly once with the same buffer.
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledWith(buffer);
    expect(result.ok).toBe(true);
  });

  it('mirrors the parser: a valid replace import equals excelParser.parse(buffer).model', () => {
    const buffer = makeWorkbookBuffer();

    const parseResult = excelParser.parse(buffer);
    expect(parseResult.ok).toBe(true);

    const importResult = importService.importWorkbook(null, buffer, 'replace');
    expect(importResult.ok).toBe(true);

    if (parseResult.ok && importResult.ok) {
      // Replace mode returns exactly the parsed model — proving delegation.
      expect(importResult.model).toEqual(parseResult.model);
    }
  });

  it('mirrors the parser error: an invalid buffer yields the same error code', () => {
    // A buffer that is not a readable workbook.
    const invalid = new TextEncoder().encode('not an excel file').buffer;

    const parseResult = excelParser.parse(invalid);
    const importResult = importService.importWorkbook(null, invalid, 'replace');

    expect(parseResult.ok).toBe(false);
    expect(importResult.ok).toBe(false);

    if (!parseResult.ok && !importResult.ok) {
      expect(importResult.error.code).toBe(parseResult.error.code);
    }
  });
});
