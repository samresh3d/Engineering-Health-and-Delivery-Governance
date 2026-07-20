/**
 * Property-based tests for the CSV export service
 * (`client/src/leadership/services/csv-export.ts`).
 *
 * Uses fast-check + Vitest. The generated rows combine the shared,
 * parser-consistent `arbGridRows()` arbitrary with a supplementary arbitrary
 * that deliberately puts commas, double quotes, and CR/LF into the string
 * fields so the RFC-4180 escaping path is exercised (the shared generator uses
 * only safe label alphabets). Each property runs at least 100 times.
 *
 * Covers design correctness property:
 *  - Property 10 — CSV export contains every row and its fields (Req 4.6)
 *
 * The test parses `toCsv` output with a self-contained, correct RFC-4180 parser
 * (quoted fields, doubled quotes, embedded commas, embedded CR/LF, CRLF record
 * separators) and asserts a faithful round-trip of every field.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { toCsv, CSV_HEADERS } from '../../services/csv-export';
import { rowId } from '../../services/grid-projector';
import { arbGridRows } from './arbitraries';
import type { GridRow, KpiType } from '../../model/editing-types';
import type { EngineeringPillar } from '../../model/types';

const RUNS = { numRuns: 200 } as const;

// ---------------------------------------------------------------------------
// A minimal, correct RFC-4180 parser (test-local, independent of the SUT).
//
// Grammar handled:
//  - fields separated by commas, records separated by CRLF (`\r\n`);
//  - a field may be quoted with double quotes; inside a quoted field a literal
//    double quote is written as two double quotes (`""`), and commas / CR / LF
//    are literal content;
//  - the final record is NOT terminated by a trailing CRLF (matches `toCsv`).
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
    } else if (c === ',') {
      record.push(field);
      field = '';
      i += 1;
    } else if (c === '\r' && i + 1 < n && text[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 2;
    } else {
      field += c;
      i += 1;
    }
  }

  // Flush the final field/record (no trailing CRLF is emitted by `toCsv`).
  record.push(field);
  records.push(record);
  return records;
}

/** Expected string form of a single cell: null/undefined -> '', numbers via String(). */
function cell(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** The nine field values a row must round-trip through the CSV, in column order. */
function expectedFields(row: GridRow): string[] {
  return [
    cell(row.month),
    cell(row.team),
    cell(row.pillar),
    cell(row.kpi),
    cell(row.target),
    cell(row.actualValue),
    cell(row.source),
    cell(row.lastUpdated),
    cell(row.updatedBy),
  ];
}

// ---------------------------------------------------------------------------
// Supplementary arbitrary: rows whose string fields carry tricky characters
// (commas, double quotes, CR, LF, plus ordinary text) to exercise escaping.
// ---------------------------------------------------------------------------
const TRICKY_CHARS = ['a', 'B', '7', ' ', ',', '"', '\r', '\n', ';', 'é', '\t'] as const;
const KPI_TYPES: readonly KpiType[] = ['Percentage', 'Currency', 'Number', 'Text'];
const PILLARS: readonly EngineeringPillar[] = ['Delivery', 'Quality', 'Sustainability', 'Cost'];

const arbTrickyString = fc
  .array(fc.constantFrom(...TRICKY_CHARS), { maxLength: 16 })
  .map((chars) => chars.join(''));

const arbTrickyOrNull = fc.option(arbTrickyString, { nil: null });
const arbFinite = fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true });
const arbFiniteOrNull = fc.option(arbFinite, { nil: null });

const arbTrickyRow: fc.Arbitrary<GridRow> = fc
  .record({
    month: arbTrickyString,
    year: fc.integer({ min: 2000, max: 2099 }),
    team: arbTrickyString,
    pillar: fc.option(fc.constantFrom(...PILLARS), { nil: null }),
    kpi: arbTrickyString,
    kpiType: fc.constantFrom(...KPI_TYPES),
    target: arbFiniteOrNull,
    actualValue: arbFiniteOrNull,
    source: arbTrickyOrNull,
    lastUpdated: arbTrickyOrNull,
    updatedBy: arbTrickyOrNull,
  })
  .map((r) => ({
    id: rowId(r.month, r.team, r.pillar, r.kpi),
    month: r.month,
    year: r.year,
    periodKey: `${r.year}-${r.month}`,
    team: r.team,
    pillar: r.pillar,
    kpi: r.kpi,
    kpiType: r.kpiType,
    target: r.target,
    actualValue: r.actualValue,
    source: r.source,
    lastUpdated: r.lastUpdated,
    updatedBy: r.updatedBy,
  }));

const arbTrickyRows: fc.Arbitrary<GridRow[]> = fc.array(arbTrickyRow, { maxLength: 8 });

/** Rows to serialize: either the shared safe rows or the tricky escaping rows. */
const arbCsvRows: fc.Arbitrary<GridRow[]> = fc.oneof(arbGridRows(), arbTrickyRows);

describe('CSV export properties', () => {
  // Feature: leadership-data-management, Property 10: CSV export contains every row and its fields
  it('Property 10: toCsv emits a header + one faithful data line per row (round-trip through RFC-4180 escaping)', () => {
    fc.assert(
      fc.property(arbCsvRows, (rows) => {
        const csv = toCsv(rows);
        const records = parseCsv(csv);

        // Exactly one header record plus one data record per row.
        expect(records.length).toBe(rows.length + 1);

        // Header record matches the fixed column order.
        expect(records[0]).toEqual([...CSV_HEADERS]);

        // Each data record recovers exactly the row's expected field values.
        rows.forEach((row, i) => {
          const parsed = records[i + 1];
          expect(parsed).toEqual(expectedFields(row));
          // Every record has the full nine-column shape.
          expect(parsed.length).toBe(CSV_HEADERS.length);
        });
      }),
      RUNS
    );
  });
});
