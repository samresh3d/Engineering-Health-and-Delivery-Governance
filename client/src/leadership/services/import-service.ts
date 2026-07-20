/**
 * ImportService — replace/merge import built on top of the existing
 * {@link excelParser}.
 *
 * The service never parses workbooks itself; it delegates to
 * `excelParser.parse`, which is schema-agnostic, preserves the Excel matrix
 * layout / normalized parsers / fraction normalization, and NEVER throws
 * (Requirement 4.7, Property 1). This keeps import behaviour identical to the
 * dashboard's existing upload path.
 *
 * Behaviour (Requirements 4.1–4.4, 4.8; Properties 7 and 8):
 *  - On parse failure → return `{ ok: false, error }` and leave `current`
 *    untouched (Req 4.8, Property 8).
 *  - `replace` → return exactly the parsed model (Req 4.1).
 *  - `merge` → union the parsed metrics into `current` by the identity tuple
 *    (Month, Team, Pillar, KPI): matching rows are updated with parsed values
 *    (Req 4.3), non-matching parsed rows are added (Req 4.4), and current-only
 *    rows are preserved unchanged (Property 7). When `current` is `null`,
 *    merge behaves like replace.
 *
 * The service is pure and immutable: inputs are never mutated and a fresh
 * model is returned.
 */
import type {
  DashboardModel,
  Dimensions,
  EngineeringPillar,
  KpiDefinition,
  MetricValue,
  Period,
} from '../model/types';
import { excelParser, type ParseError } from './excel-parser';

export type ImportMode = 'replace' | 'merge';

export type ImportResult =
  | { ok: true; model: DashboardModel }
  | { ok: false; error: ParseError };

export interface IImportService {
  importWorkbook(
    current: DashboardModel | null,
    buffer: ArrayBuffer,
    mode: ImportMode
  ): ImportResult;
}

/** The four Engineering Pillars, in canonical display order. */
const ENGINEERING_PILLARS: readonly EngineeringPillar[] = [
  'Delivery',
  'Quality',
  'Sustainability',
  'Cost',
];

/**
 * Build the identity key for a metric from (Month, Team, Pillar, KPI).
 *
 * Pillar is resolved from the (merged) KPI definitions rather than the metric
 * itself, since metrics do not carry a pillar. Unknown KPIs resolve to an empty
 * pillar segment so they still participate in merging deterministically.
 */
function metricKey(
  metric: MetricValue,
  pillarByKpi: ReadonlyMap<string, EngineeringPillar | null>
): string {
  const pillar = pillarByKpi.get(metric.kpi) ?? null;
  // A tab separator avoids collisions between values that contain the joiner.
  return [metric.period.month, metric.team, metric.kpi, pillar ?? ''].join(
    '\u0000'
  );
}

/**
 * Merge KPI definitions: start from the current definitions and let parsed
 * definitions win for matching names (by exact name) while appending new ones.
 * First-seen order is preserved (current definitions first, then new parsed).
 */
function mergeKpiDefinitions(
  current: readonly KpiDefinition[],
  parsed: readonly KpiDefinition[]
): KpiDefinition[] {
  const order: string[] = [];
  const byName = new Map<string, KpiDefinition>();

  for (const def of current) {
    if (!byName.has(def.name)) {
      order.push(def.name);
    }
    byName.set(def.name, def);
  }
  for (const def of parsed) {
    if (!byName.has(def.name)) {
      order.push(def.name);
    }
    // Parsed definition wins for a matching KPI name.
    byName.set(def.name, def);
  }

  return order.map((name) => byName.get(name)!);
}

/** Recompute the model dimensions to cover the union of the merged data. */
function recomputeDimensions(
  metrics: readonly MetricValue[],
  kpiDefinitions: readonly KpiDefinition[],
  hasBusinessUnit: boolean
): Dimensions {
  const teamOrder: string[] = [];
  const teamSeen = new Set<string>();
  const periodByKey = new Map<string, Period>();
  const yearSet = new Set<number>();
  const businessUnitOrder: string[] = [];
  const businessUnitSeen = new Set<string>();

  for (const metric of metrics) {
    if (!teamSeen.has(metric.team)) {
      teamSeen.add(metric.team);
      teamOrder.push(metric.team);
    }
    if (!periodByKey.has(metric.period.key)) {
      periodByKey.set(metric.period.key, metric.period);
    }
    yearSet.add(metric.period.year);

    const bu = metric.businessUnit;
    if (bu !== null && bu !== undefined && !businessUnitSeen.has(bu)) {
      businessUnitSeen.add(bu);
      businessUnitOrder.push(bu);
    }
  }

  // KPIs follow the definition order (which itself preserves first-seen order).
  const kpis = kpiDefinitions.map((def) => def.name);

  const periods = Array.from(periodByKey.values()).sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );

  const years = Array.from(yearSet).sort((a, b) => a - b);

  const pillars = ENGINEERING_PILLARS.filter((pillar) =>
    kpiDefinitions.some((def) => def.pillar === pillar)
  );

  return {
    teams: teamOrder,
    kpis,
    periods,
    years,
    pillars,
    businessUnits: hasBusinessUnit ? businessUnitOrder : null,
  };
}

/** Union the parsed source columns onto the current ones for export fidelity. */
function mergeSourceColumns(
  current: readonly string[],
  parsed: readonly string[]
): string[] {
  const seen = new Set(current);
  const merged = [...current];
  for (const column of parsed) {
    if (!seen.has(column)) {
      seen.add(column);
      merged.push(column);
    }
  }
  return merged;
}

/**
 * Merge a parsed model into the current model by the (Month, Team, Pillar, KPI)
 * identity tuple. Pure: neither input is mutated.
 */
function mergeModels(
  current: DashboardModel,
  parsed: DashboardModel
): DashboardModel {
  const kpiDefinitions = mergeKpiDefinitions(
    current.kpiDefinitions,
    parsed.kpiDefinitions
  );

  // Pillar-by-KPI resolved from the merged definitions so both current and
  // parsed metrics key consistently.
  const pillarByKpi = new Map<string, EngineeringPillar | null>();
  for (const def of kpiDefinitions) {
    pillarByKpi.set(def.name, def.pillar);
  }

  // Preserve current order; update matching keys in place; append new keys.
  const order: string[] = [];
  const byKey = new Map<string, MetricValue>();

  for (const metric of current.metrics) {
    const key = metricKey(metric, pillarByKpi);
    if (!byKey.has(key)) {
      order.push(key);
    }
    byKey.set(key, metric);
  }
  for (const metric of parsed.metrics) {
    const key = metricKey(metric, pillarByKpi);
    if (!byKey.has(key)) {
      order.push(key);
    }
    // Parsed value wins for a matching identity tuple (Req 4.3).
    byKey.set(key, metric);
  }

  const metrics = order.map((key) => byKey.get(key)!);

  const hasBusinessUnit =
    current.dimensions.businessUnits !== null ||
    parsed.dimensions.businessUnits !== null;

  const dimensions = recomputeDimensions(
    metrics,
    kpiDefinitions,
    hasBusinessUnit
  );

  return {
    kpiDefinitions,
    metrics,
    dimensions,
    sourceColumns: mergeSourceColumns(
      current.sourceColumns,
      parsed.sourceColumns
    ),
  };
}

/**
 * ImportService implementation. Stateless; delegates all workbook reading to
 * the shared {@link excelParser}.
 */
export class ImportService implements IImportService {
  importWorkbook(
    current: DashboardModel | null,
    buffer: ArrayBuffer,
    mode: ImportMode
  ): ImportResult {
    // Delegate to the existing parser (never throws). On failure, surface the
    // error and leave the current model untouched (Req 4.8, Property 8).
    const result = excelParser.parse(buffer);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const parsed = result.model;

    // Replace mode, or merge with no existing model, returns the parsed model
    // exactly (Req 4.1).
    if (mode === 'replace' || current === null) {
      return { ok: true, model: parsed };
    }

    // Merge mode (Req 4.2, 4.3, 4.4; Property 7).
    return { ok: true, model: mergeModels(current, parsed) };
  }
}

/** Default service instance for convenient import. */
export const importService: IImportService = new ImportService();
