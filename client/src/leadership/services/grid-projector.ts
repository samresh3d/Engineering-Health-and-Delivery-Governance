/**
 * GridProjector — pure projection of the `DashboardModel` into flat `GridRow`s
 * and immutable application of committed edits back to a new model.
 *
 * Responsibilities (Requirements 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 8.4, 11.3):
 *  - `toRows(model, meta?)` produces exactly one `GridRow` per `MetricValue`,
 *    deriving Month/Year/Team/Pillar/KPI, Target (from the KPI definition),
 *    Actual Value (from the metric), and the derived KPI_Type (Assumption A5).
 *    Per-row `lastUpdated`/`updatedBy`/`approvalStatus`/`source` are supplied by
 *    the optional `RowMetaLookup`; when absent those cells are `null`
 *    (absent-value indicator, Req 1.6).
 *  - `rowId(month, team, pillar, kpi)` produces the stable identity used to
 *    address a row for edits and deletes.
 *  - `applyActual` / `applyTarget` / `removeRows` each return a NEW
 *    `DashboardModel`, never mutating the input, so the model remains the single
 *    source of truth and undo/redo snapshots stay independent.
 *
 * KPI_Type derivation intentionally falls back to a local implementation that
 * mirrors Assumption A5 (Percentage when the values are fractional or `%`
 * semantics are present, otherwise Number, and Text for non-numeric input).
 * When the Validator's `deriveKpiType` (task 3.1) is available, the state layer
 * may supply a richer type; the projector never fails if it is not yet present.
 */

import type {
  DashboardModel,
  EngineeringPillar,
  KpiDefinition,
  MetricValue,
} from '../model/types';
import type { ApprovalStatus, GridRow, KpiType } from '../model/editing-types';

/**
 * Per-row metadata that cannot be derived from the normalized model alone: the
 * latest audit-trail timestamp/author, the optional approval status, and the
 * source label. Every field is optional; missing fields resolve to `null`
 * (absent-value indicator).
 */
export interface RowMeta {
  lastUpdated?: string | null;
  updatedBy?: string | null;
  approvalStatus?: ApprovalStatus;
  source?: string | null;
}

/**
 * Supplies per-row `RowMeta` derived from the audit trail and source columns.
 * Implemented as a pure lookup function keyed by the row's stable id.
 */
export type RowMetaLookup = (rowId: string) => RowMeta | undefined;

export interface IGridProjector {
  /** One GridRow per MetricValue; derives Month/Team/Pillar/KPI, Target, Actual, KPI_Type. */
  toRows(model: DashboardModel, meta?: RowMetaLookup): GridRow[];
  /** Stable row id from the identity tuple. */
  rowId(month: string, team: string, pillar: EngineeringPillar | null, kpi: string): string;
  /** Apply an Actual edit → returns a new model with MetricValue.value updated. */
  applyActual(model: DashboardModel, rowId: string, value: number | null): DashboardModel;
  /** Apply a Target edit → returns a new model with KpiDefinition.target updated (per-KPI). */
  applyTarget(model: DashboardModel, kpi: string, target: number | null): DashboardModel;
  /** Remove the rows for the given ids → returns a new model without those metrics. */
  removeRows(model: DashboardModel, rowIds: string[]): DashboardModel;
}

/**
 * Field delimiter for the identity tuple. `\u0001` cannot appear in a month,
 * team, pillar, or KPI label, so the composed id is collision-free for distinct
 * tuples. The pillar is a fixed enum (or `null`), so no escaping is required.
 */
export const ID_DELIMITER = '\u0001';

/** Sentinel for an absent (unknown) pillar within a composed row id. */
const NULL_PILLAR = '\u0000';

/**
 * Compose the stable row id from the (Month, Team, Pillar, KPI) identity tuple.
 * The same tuple always yields the same id, and distinct tuples always yield
 * distinct ids.
 */
export function rowId(
  month: string,
  team: string,
  pillar: EngineeringPillar | null,
  kpi: string
): string {
  return [month, team, pillar ?? NULL_PILLAR, kpi].join(ID_DELIMITER);
}

/**
 * Project the model into flat grid rows — exactly one per `MetricValue`.
 *
 * Month/Year/Team/KPI come straight from the metric's period and identity
 * fields. Pillar and Target are resolved from the metric's KPI definition
 * (Target is per-KPI, so every row for a KPI shares its target). KPI_Type is
 * derived once per KPI from its definition and value samples (Assumption A5).
 * Absent metadata resolves to `null` so the grid renders the absent-value
 * indicator (Req 1.6).
 */
export function toRows(model: DashboardModel, meta?: RowMetaLookup): GridRow[] {
  const defByName = indexDefinitions(model.kpiDefinitions);
  const samplesByKpi = collectSamples(model.metrics);
  const kpiTypeByName = new Map<string, KpiType>();

  return model.metrics.map((metric) => {
    const def = defByName.get(metric.kpi);
    const pillar = def?.pillar ?? null;
    const id = rowId(metric.period.month, metric.team, pillar, metric.kpi);

    let kpiType = kpiTypeByName.get(metric.kpi);
    if (kpiType === undefined) {
      kpiType = deriveKpiTypeFallback(def, samplesByKpi.get(metric.kpi) ?? []);
      kpiTypeByName.set(metric.kpi, kpiType);
    }

    const rowMeta = meta?.(id);

    const row: GridRow = {
      id,
      month: metric.period.month,
      year: metric.period.year,
      periodKey: metric.period.key,
      team: metric.team,
      pillar,
      kpi: metric.kpi,
      kpiType,
      target: def?.target ?? null,
      actualValue: metric.value,
      source: rowMeta?.source ?? null,
      lastUpdated: rowMeta?.lastUpdated ?? null,
      updatedBy: rowMeta?.updatedBy ?? null,
    };

    if (rowMeta?.approvalStatus !== undefined) {
      row.approvalStatus = rowMeta.approvalStatus;
    }

    return row;
  });
}

/**
 * Apply an Actual edit addressed by `rowId`, returning a NEW model in which only
 * the addressed `MetricValue.value` changes. All other metrics, every KPI
 * definition, the dimensions, and the source columns are preserved by reference
 * so the result is a structurally valid `DashboardModel` (Req 2.3, 11.3). When
 * no metric matches the id the model is returned unchanged.
 */
export function applyActual(
  model: DashboardModel,
  targetRowId: string,
  value: number | null
): DashboardModel {
  const defByName = indexDefinitions(model.kpiDefinitions);
  let changed = false;

  const metrics = model.metrics.map((metric) => {
    if (changed) return metric;
    const pillar = defByName.get(metric.kpi)?.pillar ?? null;
    const id = rowId(metric.period.month, metric.team, pillar, metric.kpi);
    if (id !== targetRowId) return metric;
    changed = true;
    return { ...metric, value };
  });

  if (!changed) return model;
  return { ...model, metrics };
}

/**
 * Apply a Target edit for a KPI, returning a NEW model in which only that KPI's
 * `KpiDefinition.target` changes (Req 2.4). Because Target lives on the shared
 * KPI definition, the edit is per-KPI and affects every row of that KPI. All
 * metrics, other definitions, dimensions, and source columns are preserved.
 * When no definition matches the KPI name the model is returned unchanged.
 */
export function applyTarget(
  model: DashboardModel,
  kpi: string,
  target: number | null
): DashboardModel {
  let changed = false;

  const kpiDefinitions = model.kpiDefinitions.map((def) => {
    if (def.name !== kpi) return def;
    changed = true;
    return { ...def, target };
  });

  if (!changed) return model;
  return { ...model, kpiDefinitions };
}

/**
 * Remove every metric whose row id is in `rowIds`, returning a NEW model without
 * those metrics (Req 8.4). KPI definitions, dimensions, and source columns are
 * preserved — deleting a measured cell does not retract a KPI's definition or a
 * discovered dimension. When no row matches, the model is returned unchanged.
 */
export function removeRows(model: DashboardModel, rowIds: string[]): DashboardModel {
  if (rowIds.length === 0) return model;

  const remove = new Set(rowIds);
  const defByName = indexDefinitions(model.kpiDefinitions);
  let changed = false;

  const metrics = model.metrics.filter((metric) => {
    const pillar = defByName.get(metric.kpi)?.pillar ?? null;
    const id = rowId(metric.period.month, metric.team, pillar, metric.kpi);
    if (remove.has(id)) {
      changed = true;
      return false;
    }
    return true;
  });

  if (!changed) return model;
  return { ...model, metrics };
}

/** The projector as an `IGridProjector` object for injection where an instance is preferred. */
export const gridProjector: IGridProjector = {
  toRows,
  rowId,
  applyActual,
  applyTarget,
  removeRows,
};

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

/** Build a KPI name → definition lookup so per-row derivation is O(1). */
function indexDefinitions(definitions: KpiDefinition[]): Map<string, KpiDefinition> {
  const map = new Map<string, KpiDefinition>();
  for (const def of definitions) {
    if (!map.has(def.name)) {
      map.set(def.name, def);
    }
  }
  return map;
}

/** Collect the non-null value samples for each KPI, used for type inference. */
function collectSamples(metrics: MetricValue[]): Map<string, number[]> {
  const samples = new Map<string, number[]>();
  for (const metric of metrics) {
    if (metric.value === null || !Number.isFinite(metric.value)) continue;
    const list = samples.get(metric.kpi);
    if (list) {
      list.push(metric.value);
    } else {
      samples.set(metric.kpi, [metric.value]);
    }
  }
  return samples;
}

/**
 * Local KPI_Type derivation mirroring Assumption A5. Priority:
 *  1. An explicit KPI name carrying `%` semantics → Percentage.
 *  2. Numeric samples all within the fractional range [0, 1] → Percentage.
 *  3. Any finite numeric sample present → Number.
 *  4. Otherwise → Text.
 *
 * This is a deliberate fallback for when the Validator's `deriveKpiType`
 * (task 3.1) is not yet wired; it never throws and always returns a type.
 */
function deriveKpiTypeFallback(
  def: KpiDefinition | undefined,
  samples: number[]
): KpiType {
  if (def && /%|percent/i.test(def.name)) {
    return 'Percentage';
  }

  const numeric = samples.filter((n) => Number.isFinite(n));
  if (numeric.length === 0) {
    // No numeric evidence at all. A defined KPI still represents a numeric
    // measure by default; only a truly empty/undefined KPI is treated as Text.
    return def ? 'Number' : 'Text';
  }

  const allFractional = numeric.every((n) => n >= 0 && n <= 1);
  if (allFractional) {
    return 'Percentage';
  }

  return 'Number';
}
