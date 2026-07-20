/**
 * Property-based tests for the ImportService
 * (`client/src/leadership/services/import-service.ts`).
 *
 * Uses fast-check + Vitest and the shared, parser-consistent arbitraries in
 * `./arbitraries.ts` (`arbModel`, `arbWorkbookBuffer`). Each property runs at
 * least 100 times.
 *
 * Covers design correctness properties:
 *  - Property 7 — Import modes: replace and merge (Req 4.1, 4.2, 4.3, 4.4)
 *  - Property 8 — Invalid import leaves the model unchanged (Req 4.8)
 *
 * The ImportService delegates all workbook reading to `excelParser.parse`, so
 * the expected merged/replaced model is recomputed here by parsing the buffer
 * independently and re-deriving the (Month, Team, Pillar, KPI) identity keys
 * exactly the way the service does (pillar resolved from the MERGED KPI
 * definitions, parsed values winning for overlapping keys).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { importService, type ImportMode } from '../../services/import-service';
import { excelParser } from '../../services/excel-parser';
import type {
  DashboardModel,
  EngineeringPillar,
  MetricValue,
} from '../../model/types';
import { arbModel, arbWorkbookBuffer } from './arbitraries';

const RUNS = { numRuns: 100 } as const;

/**
 * Resolve pillar-by-KPI from the MERGED KPI definitions exactly as
 * `import-service.mergeModels` does: current definitions first, parsed
 * definitions win for matching names.
 */
function mergedPillarByKpi(
  current: DashboardModel,
  parsed: DashboardModel
): Map<string, EngineeringPillar | null> {
  const map = new Map<string, EngineeringPillar | null>();
  for (const def of current.kpiDefinitions) map.set(def.name, def.pillar);
  for (const def of parsed.kpiDefinitions) map.set(def.name, def.pillar);
  return map;
}

/** Build the identity key for a metric identically to the service. */
function keyOf(
  metric: MetricValue,
  pillarByKpi: ReadonlyMap<string, EngineeringPillar | null>
): string {
  const pillar = pillarByKpi.get(metric.kpi) ?? null;
  return [metric.period.month, metric.team, metric.kpi, pillar ?? ''].join(
    '\u0000'
  );
}

/** Last-wins map of key -> metric over a metric list (matches service iteration). */
function keyedMetrics(
  metrics: readonly MetricValue[],
  pillarByKpi: ReadonlyMap<string, EngineeringPillar | null>
): Map<string, MetricValue> {
  const map = new Map<string, MetricValue>();
  for (const metric of metrics) {
    map.set(keyOf(metric, pillarByKpi), metric);
  }
  return map;
}

describe('ImportService — Property 7: Import modes (replace and merge)', () => {
  // Feature: leadership-data-management, Property 7: Import modes — replace and merge
  it('replace mode returns exactly the parsed model', () => {
    fc.assert(
      fc.property(arbModel(), arbWorkbookBuffer(), (current, buffer) => {
        const parseResult = excelParser.parse(buffer);
        // arbWorkbookBuffer always produces a valid workbook.
        expect(parseResult.ok).toBe(true);
        if (!parseResult.ok) return;

        const result = importService.importWorkbook(current, buffer, 'replace');
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Replace ignores `current` and yields precisely the parsed model.
        expect(result.model).toEqual(parseResult.model);
      }),
      RUNS
    );
  });

  // Feature: leadership-data-management, Property 7: Import modes — replace and merge
  it('merge mode unions current and parsed keys; parsed wins, current-only preserved', () => {
    fc.assert(
      fc.property(arbModel(), arbWorkbookBuffer(), (current, buffer) => {
        const parseResult = excelParser.parse(buffer);
        expect(parseResult.ok).toBe(true);
        if (!parseResult.ok) return;
        const parsed = parseResult.model;

        const result = importService.importWorkbook(current, buffer, 'merge');
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Re-derive identity keys using the merged pillar resolution.
        const pillarByKpi = mergedPillarByKpi(current, parsed);
        const currentMap = keyedMetrics(current.metrics, pillarByKpi);
        const parsedMap = keyedMetrics(parsed.metrics, pillarByKpi);

        // Expected union: current entries overridden by parsed (parsed wins).
        const expected = new Map(currentMap);
        for (const [key, metric] of parsedMap) expected.set(key, metric);

        const resultMap = keyedMetrics(result.model.metrics, pillarByKpi);

        // The merged model has no duplicate identity keys.
        expect(resultMap.size).toBe(result.model.metrics.length);

        // Key-set equals the union of current and parsed keys (no extras, none missing).
        expect([...resultMap.keys()].sort()).toEqual(
          [...expected.keys()].sort()
        );

        // Every parsed key is present with the parsed value (update wins).
        for (const [key, metric] of parsedMap) {
          expect(resultMap.get(key)).toEqual(metric);
        }

        // Every current-only key is preserved with its original value.
        for (const [key, metric] of currentMap) {
          if (!parsedMap.has(key)) {
            expect(resultMap.get(key)).toEqual(metric);
          }
        }
      }),
      RUNS
    );
  });
});

describe('ImportService — Property 8: Invalid import leaves the model unchanged', () => {
  // Feature: leadership-data-management, Property 8: Invalid import leaves the model unchanged
  it('returns an error result and does not alter the current model', () => {
    fc.assert(
      fc.property(
        arbModel(),
        fc.uint8Array({ minLength: 0, maxLength: 64 }),
        fc.constantFrom<ImportMode>('replace', 'merge'),
        (current, bytes, mode) => {
          // Build a standalone ArrayBuffer from the random bytes.
          const invalidBuffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer;

          // Guard: on the off chance the random bytes parse as a valid
          // workbook, this case is not an "invalid import" — skip it.
          fc.pre(!excelParser.parse(invalidBuffer).ok);

          const before = structuredClone(current);
          const result = importService.importWorkbook(
            current,
            invalidBuffer,
            mode
          );

          // The import fails ...
          expect(result.ok).toBe(false);
          // ... and the current model is left deeply unchanged (pure function).
          expect(current).toEqual(before);
        }
      ),
      RUNS
    );
  });
});
