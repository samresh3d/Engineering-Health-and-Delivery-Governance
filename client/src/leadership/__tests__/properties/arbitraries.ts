/**
 * Shared fast-check arbitraries for the Leadership Data Management property
 * tests (design "Property-Based Testing Approach", Req 11.3).
 *
 * This is a HELPER module: it exports arbitrary factories only and contains no
 * `describe`/`it` blocks. The individual property tests import these factories
 * to generate parser-consistent `DashboardModel`s, projected `GridRow`s, raw
 * validator inputs, audit trails, and valid `KPIs` workbook buffers.
 *
 * The generators are deliberately kept consistent with what `excel-parser.ts`
 * produces so that export/import round-trip properties (Property 9) hold:
 *  - `Period.key` is derived from year + month exactly as the parser does
 *    (`YYYY-MM`, month as a zero-padded number for recognized month names);
 *  - there is exactly one `KpiDefinition` per distinct KPI;
 *  - metrics are keyed by the (team, kpi, period) tuple;
 *  - dimensions are derived from the generated metrics/definitions in the same
 *    first-seen / sorted order the parser uses.
 */

import * as fc from 'fast-check';
import * as XLSX from 'xlsx';

import type {
  AmberBand,
  DashboardModel,
  Dimensions,
  Direction,
  EngineeringPillar,
  KpiDefinition,
  MetricValue,
  Period,
} from '../../model/types';
import type {
  ApprovalStatus,
  AuditTrail,
  ChangeRecord,
  GridRow,
  KpiType,
} from '../../model/editing-types';
import { rowId, toRows } from '../../services/grid-projector';

// ---------------------------------------------------------------------------
// Shared constants and small helpers
// ---------------------------------------------------------------------------

/** Recognized month labels paired with their 1-based number (parser-consistent). */
const MONTHS: ReadonlyArray<{ label: string; num: number }> = [
  { label: 'Jan', num: 1 },
  { label: 'Feb', num: 2 },
  { label: 'Mar', num: 3 },
  { label: 'Apr', num: 4 },
  { label: 'May', num: 5 },
  { label: 'Jun', num: 6 },
  { label: 'Jul', num: 7 },
  { label: 'Aug', num: 8 },
  { label: 'Sep', num: 9 },
  { label: 'Oct', num: 10 },
  { label: 'Nov', num: 11 },
  { label: 'Dec', num: 12 },
];

const MONTH_LABELS: readonly string[] = MONTHS.map((m) => m.label);
const MONTH_NUM_BY_LABEL = new Map(MONTHS.map((m) => [m.label, m.num]));

const PILLARS: readonly EngineeringPillar[] = [
  'Delivery',
  'Quality',
  'Sustainability',
  'Cost',
];

const DIRECTIONS: readonly Direction[] = ['HigherIsBetter', 'LowerIsBetter'];
const KPI_TYPES: readonly KpiType[] = ['Percentage', 'Currency', 'Number', 'Text'];
const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Rejected',
];
const AUTHORS: readonly string[] = ['alice', 'bob', 'carol', 'dan', 'erin'];

/** Build the stable `Period.key` exactly as `excel-parser.buildPeriod` does. */
function periodKeyOf(year: number, monthLabel: string): string {
  const num = MONTH_NUM_BY_LABEL.get(monthLabel);
  const monthSegment =
    num !== undefined ? String(num).padStart(2, '0') : monthLabel.toLowerCase();
  return `${String(year).padStart(4, '0')}-${monthSegment}`;
}

/** A finite (non-NaN, non-infinite) number in a reasonable range. */
const arbFinite = fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true });

/** A finite number or `null` (absent-value indicator). */
const arbFiniteOrNull = fc.option(arbFinite, { nil: null });

const arbTeamLabel = fc
  .tuple(fc.constantFrom('Team', 'Squad', 'Guild', 'Crew', 'Pod'), fc.integer({ min: 0, max: 40 }))
  .map(([base, n]) => `${base}-${n}`);

const arbKpiLabel = fc
  .tuple(
    fc.constantFrom('Velocity', 'Coverage', 'Cost', 'Rate', 'Count', 'Score', 'Availability'),
    fc.integer({ min: 0, max: 40 })
  )
  .map(([base, n]) => `${base}-${n}`);

const arbBusinessUnit = fc
  .tuple(fc.constantFrom('BU', 'Unit', 'Division'), fc.integer({ min: 0, max: 20 }))
  .map(([base, n]) => `${base}-${n}`);

const arbPillarOrNull = fc.option(fc.constantFrom(...PILLARS), { nil: null });
const arbIsoTimestamp = fc
  .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2025, 0, 1) })
  .map((ms) => new Date(ms).toISOString());

// ---------------------------------------------------------------------------
// arbModel — a self-consistent, parser-consistent DashboardModel
// ---------------------------------------------------------------------------

interface KpiSpec {
  name: string;
  pillar: EngineeringPillar | null;
  direction: Direction;
  target: number | null;
  amberBand: AmberBand | null;
}

const arbAmberBand: fc.Arbitrary<AmberBand | null> = fc.option(
  fc.tuple(arbFinite, arbFinite).map(([a, b]) => ({
    lower: Math.min(a, b),
    upper: Math.max(a, b),
  })),
  { nil: null }
);

const arbKpiSpec: fc.Arbitrary<KpiSpec> = fc.record({
  name: arbKpiLabel,
  pillar: arbPillarOrNull,
  direction: fc.constantFrom(...DIRECTIONS),
  target: arbFiniteOrNull,
  amberBand: arbAmberBand,
});

const arbPeriodParts: fc.Arbitrary<Period> = fc
  .tuple(fc.integer({ min: 2000, max: 2099 }), fc.constantFrom(...MONTH_LABELS))
  .map(([year, month]) => ({ year, month, key: periodKeyOf(year, month) }));

/** Per-(team,kpi,period) combination choice. */
interface ComboChoice {
  include: boolean;
  value: number | null;
  buPresent: boolean;
  buIndex: number;
}

const arbComboChoice: fc.Arbitrary<ComboChoice> = fc.record({
  include: fc.boolean(),
  value: arbFiniteOrNull,
  buPresent: fc.boolean(),
  buIndex: fc.nat(),
});

/**
 * Generate a self-consistent {@link DashboardModel}. Teams, KPI definitions,
 * and periods come from small unique pools; metrics are a subset of the full
 * (team × kpi × period) cross-product with present/absent values. Sometimes the
 * model carries a Business Unit dimension (`dimensions.businessUnits` non-null
 * and metrics carrying `businessUnit`) and sometimes not. All dimensions are
 * derived from the generated metrics/definitions the same way the parser does.
 */
export function arbModel(): fc.Arbitrary<DashboardModel> {
  return fc
    .record({
      teams: fc.uniqueArray(arbTeamLabel, { minLength: 1, maxLength: 3 }),
      kpis: fc.uniqueArray(arbKpiSpec, {
        minLength: 1,
        maxLength: 3,
        selector: (k) => k.name,
      }),
      periods: fc.uniqueArray(arbPeriodParts, {
        minLength: 1,
        maxLength: 3,
        selector: (p) => p.key,
      }),
      hasBusinessUnit: fc.boolean(),
      businessUnitPool: fc.uniqueArray(arbBusinessUnit, { minLength: 1, maxLength: 3 }),
    })
    .chain((base) => {
      const combos: Array<{ team: string; kpi: KpiSpec; period: Period }> = [];
      for (const team of base.teams) {
        for (const kpi of base.kpis) {
          for (const period of base.periods) {
            combos.push({ team, kpi, period });
          }
        }
      }
      const choicesArb = fc.tuple(...combos.map(() => arbComboChoice));
      return choicesArb.map((choices) => assembleModel(base, combos, choices));
    });
}

function assembleModel(
  base: {
    teams: string[];
    kpis: KpiSpec[];
    periods: Period[];
    hasBusinessUnit: boolean;
    businessUnitPool: string[];
  },
  combos: Array<{ team: string; kpi: KpiSpec; period: Period }>,
  choices: ComboChoice[]
): DashboardModel {
  const specByName = new Map(base.kpis.map((k) => [k.name, k]));
  const metrics: MetricValue[] = [];

  combos.forEach((combo, i) => {
    const choice = choices[i];
    if (!choice.include) return;
    const metric: MetricValue = {
      team: combo.team,
      kpi: combo.kpi.name,
      period: combo.period,
      value: choice.value,
    };
    if (base.hasBusinessUnit) {
      metric.businessUnit = choice.buPresent
        ? base.businessUnitPool[choice.buIndex % base.businessUnitPool.length]
        : null;
    }
    metrics.push(metric);
  });

  // Guarantee at least one metric so the model has content (parser-consistent).
  if (metrics.length === 0) {
    const combo = combos[0];
    const metric: MetricValue = {
      team: combo.team,
      kpi: combo.kpi.name,
      period: combo.period,
      value: null,
    };
    if (base.hasBusinessUnit) metric.businessUnit = null;
    metrics.push(metric);
  }

  // Derive dimensions from the metrics exactly as the parser does.
  const teamOrder = firstSeen(metrics.map((m) => m.team));
  const kpiOrder = firstSeen(metrics.map((m) => m.kpi));

  const periodByKey = new Map<string, Period>();
  const yearSet = new Set<number>();
  const buOrder: string[] = [];
  const buSeen = new Set<string>();
  for (const m of metrics) {
    if (!periodByKey.has(m.period.key)) periodByKey.set(m.period.key, m.period);
    yearSet.add(m.period.year);
    if (base.hasBusinessUnit && m.businessUnit != null && !buSeen.has(m.businessUnit)) {
      buSeen.add(m.businessUnit);
      buOrder.push(m.businessUnit);
    }
  }

  const periods = Array.from(periodByKey.values()).sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );
  const years = Array.from(yearSet).sort((a, b) => a - b);

  // One KpiDefinition per distinct KPI, in first-seen order.
  const kpiDefinitions: KpiDefinition[] = kpiOrder.map((name) => {
    const spec = specByName.get(name)!;
    return {
      name: spec.name,
      pillar: spec.pillar,
      direction: spec.direction,
      target: spec.target,
      amberBand: spec.amberBand,
    };
  });

  const pillars = PILLARS.filter((p) => kpiDefinitions.some((d) => d.pillar === p));

  const dimensions: Dimensions = {
    teams: teamOrder,
    kpis: kpiOrder,
    periods,
    years,
    pillars,
    businessUnits: base.hasBusinessUnit ? buOrder : null,
  };

  const sourceColumns = base.hasBusinessUnit
    ? ['Team', 'KPI', 'Value', 'Target', 'Year', 'Month', 'Pillar', 'Direction', 'Business Unit']
    : ['Team', 'KPI', 'Value', 'Target', 'Year', 'Month', 'Pillar', 'Direction'];

  return { kpiDefinitions, metrics, dimensions, sourceColumns };
}

/** Preserve first-seen order while de-duplicating. */
function firstSeen(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// arbGridRows — flat GridRows with present/absent metadata and stable ids
// ---------------------------------------------------------------------------

/**
 * Generate an array of {@link GridRow}s with present/absent (`null`)
 * target/actualValue/source/lastUpdated/updatedBy, a valid `kpiType`, and
 * stable ids derived from the (month, team, pillar, kpi) identity tuple (unique
 * per generated array).
 */
export function arbGridRows(): fc.Arbitrary<GridRow[]> {
  const arbRow: fc.Arbitrary<GridRow> = fc
    .record({
      month: fc.constantFrom(...MONTH_LABELS),
      year: fc.integer({ min: 2000, max: 2099 }),
      team: arbTeamLabel,
      pillar: arbPillarOrNull,
      kpi: arbKpiLabel,
      kpiType: fc.constantFrom(...KPI_TYPES),
      target: arbFiniteOrNull,
      actualValue: arbFiniteOrNull,
      source: fc.option(fc.constantFrom('Manual', 'Import', 'System'), { nil: null }),
      lastUpdated: fc.option(arbIsoTimestamp, { nil: null }),
      updatedBy: fc.option(fc.constantFrom(...AUTHORS), { nil: null }),
      approvalStatus: fc.option(fc.constantFrom(...APPROVAL_STATUSES), { nil: undefined }),
    })
    .map((r) => {
      const row: GridRow = {
        id: rowId(r.month, r.team, r.pillar, r.kpi),
        month: r.month,
        year: r.year,
        periodKey: periodKeyOf(r.year, r.month),
        team: r.team,
        pillar: r.pillar,
        kpi: r.kpi,
        kpiType: r.kpiType,
        target: r.target,
        actualValue: r.actualValue,
        source: r.source,
        lastUpdated: r.lastUpdated,
        updatedBy: r.updatedBy,
      };
      if (r.approvalStatus !== undefined) row.approvalStatus = r.approvalStatus;
      return row;
    });

  return fc.uniqueArray(arbRow, { maxLength: 8, selector: (r) => r.id });
}

// ---------------------------------------------------------------------------
// arbRawInput — raw string inputs for the Validator, biased for a KPI type
// ---------------------------------------------------------------------------

/**
 * Generate raw string inputs appropriate for exercising the validator against
 * `kpiType`. For numeric types this mixes valid numbers, percentage forms
 * (`"85"`, `"85%"`, `"0.85"`), empty/whitespace, and invalid non-numeric
 * strings. For `Text` any string is valid input.
 */
export function arbRawInput(kpiType: KpiType): fc.Arbitrary<string> {
  if (kpiType === 'Text') {
    return fc.string();
  }

  const validNumber = arbFinite.map((n) => String(n));
  const percentBare = fc.integer({ min: 0, max: 100 }).map((n) => String(n));
  const percentSuffixed = fc.integer({ min: 0, max: 100 }).map((n) => `${n}%`);
  const percentFraction = fc
    .double({ min: 0, max: 1, noNaN: true })
    .map((n) => String(n));
  const blank = fc.constantFrom('', ' ', '   ', '\t');
  const nonNumeric = fc.constantFrom('n/a', 'abc', 'pending', '--', 'TBD', 'null');

  return fc.oneof(
    validNumber,
    percentBare,
    percentSuffixed,
    percentFraction,
    blank,
    nonNumeric
  );
}

// ---------------------------------------------------------------------------
// arbAuditTrail — ordered change records referencing real row ids
// ---------------------------------------------------------------------------

const arbChangeValue: fc.Arbitrary<number | string | null> = fc.oneof(
  arbFinite,
  fc.constantFrom('n/a', 'pending', 'reviewed'),
  fc.constant(null)
);

/**
 * Generate an ordered {@link AuditTrail} whose `rowId`s reference rows derivable
 * from `model` (via the same `rowId` scheme used by the grid projector). Records
 * carry valid ISO timestamps in chronological (non-decreasing) order, an author,
 * and optional comments / approval status.
 */
export function arbAuditTrail(model: DashboardModel): fc.Arbitrary<AuditTrail> {
  const rowIds = toRows(model).map((r) => r.id);
  const arbRowId =
    rowIds.length > 0
      ? fc.constantFrom(...rowIds)
      : fc.constant(rowId('Jan', 'Team-0', null, 'Score-0'));

  const arbEntry = fc.record({
    rowId: arbRowId,
    field: fc.constantFrom<'target' | 'actual'>('target', 'actual'),
    previousValue: arbChangeValue,
    newValue: arbChangeValue,
    updatedBy: fc.constantFrom(...AUTHORS),
    delta: fc.integer({ min: 1000, max: 7 * 24 * 60 * 60 * 1000 }),
    comments: fc.option(fc.string(), { nil: undefined }),
    approvalStatus: fc.option(fc.constantFrom(...APPROVAL_STATUSES), { nil: undefined }),
  });

  return fc
    .record({
      base: fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2024, 0, 1) }),
      entries: fc.array(arbEntry, { maxLength: 8 }),
    })
    .map(({ base, entries }) => {
      let clock = base;
      return entries.map((e, i): ChangeRecord => {
        clock += e.delta;
        const record: ChangeRecord = {
          id: `chg-${i}`,
          rowId: e.rowId,
          field: e.field,
          previousValue: e.previousValue,
          newValue: e.newValue,
          updatedBy: e.updatedBy,
          timestamp: new Date(clock).toISOString(),
        };
        if (e.comments !== undefined) record.comments = e.comments;
        if (e.approvalStatus !== undefined) record.approvalStatus = e.approvalStatus;
        return record;
      });
    });
}

// ---------------------------------------------------------------------------
// arbWorkbookBuffer — a valid KPIs workbook ArrayBuffer
// ---------------------------------------------------------------------------

/**
 * Generate an `ArrayBuffer` for a valid `KPIs` workbook in the normalized
 * (long) layout the parser recognizes: header row
 * `Team, KPI, Value, Target, Year, Month, Pillar, Direction` followed by data
 * rows. Absent values/targets are written as empty cells (which re-parse to
 * `null`). Suitable for driving import / round-trip tests via `excelParser`.
 */
export function arbWorkbookBuffer(): fc.Arbitrary<ArrayBuffer> {
  const arbSheetRow = fc.record({
    team: arbTeamLabel,
    kpi: arbKpiLabel,
    value: arbFiniteOrNull,
    target: arbFiniteOrNull,
    year: fc.integer({ min: 2000, max: 2099 }),
    month: fc.constantFrom(...MONTH_LABELS),
    pillar: fc.constantFrom(...PILLARS),
    direction: fc.constantFrom(...DIRECTIONS),
  });

  return fc.array(arbSheetRow, { minLength: 1, maxLength: 8 }).map((rows) => {
    const header = ['Team', 'KPI', 'Value', 'Target', 'Year', 'Month', 'Pillar', 'Direction'];
    const aoa: unknown[][] = [
      header,
      ...rows.map((r) => [
        r.team,
        r.kpi,
        r.value ?? '',
        r.target ?? '',
        r.year,
        r.month,
        r.pillar,
        r.direction,
      ]),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'KPIs');
    return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  });
}
