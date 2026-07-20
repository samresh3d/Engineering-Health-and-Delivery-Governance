/**
 * ExcelParser — reads a workbook from an `ArrayBuffer` and produces a
 * {@link DashboardModel}.
 *
 * The parser is schema-agnostic: it detects columns by header name
 * (case-insensitive, trimmed) per the "KPIs Sheet Contract" and derives all
 * structure (teams, KPIs, periods, years, pillars, and the optional Business
 * Unit dimension) from the sheet content. Absent value/target cells are
 * recorded as `null` rather than terminating parsing (Requirements 2.7, 2.8).
 *
 * `parse` NEVER throws. It always returns a {@link ParseResult} discriminated
 * union — either `{ ok: true, model }` or `{ ok: false, error }` (Requirement
 * 2.1, 2.2, Property 1).
 */
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
} from '../model/types';
import { lookupKpiPillar } from '../model/pillars';
import { parseMatrix } from './matrix-parser';

/** The canonical sheet name that holds the KPI data (single source of truth). */
const KPIS_SHEET_NAME = 'KPIs';

/** The four Engineering Pillars, used when validating a sheet-provided pillar. */
const ENGINEERING_PILLARS: readonly EngineeringPillar[] = [
  'Delivery',
  'Quality',
  'Sustainability',
  'Cost',
];

export interface IExcelParser {
  parse(buffer: ArrayBuffer): ParseResult;
}

export type ParseResult =
  | { ok: true; model: DashboardModel }
  | { ok: false; error: ParseError };

export interface ParseError {
  code:
    | 'INVALID_WORKBOOK' // Req 2.2
    | 'MISSING_KPIS_SHEET' // Req 2.4
    | 'EMPTY_KPIS_SHEET'; // Req 2.6
  message: string;
}

/** Recognized header names (normalized) for each logical column. */
const HEADER_ALIASES = {
  team: ['team'],
  kpi: ['kpi', 'metric'],
  value: ['value', 'actual'],
  target: ['target', 'goal'],
  year: ['year'],
  month: ['month', 'period'],
  pillar: ['pillar', 'engineering pillar'],
  direction: ['direction', 'better'],
  amberLower: ['amber min', 'amber lower', 'amber minimum'],
  amberUpper: ['amber max', 'amber upper', 'amber maximum'],
  businessUnit: ['business unit', 'bu'],
} as const;

/** Full and abbreviated month names → 1-based month number. */
const MONTH_TO_NUMBER: Readonly<Record<string, number>> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/** Normalize a header/label: trim, collapse internal whitespace, lower-case. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Return the first column index whose normalized header matches an alias. */
function findColumnIndex(
  normalizedHeaders: string[],
  aliases: readonly string[]
): number {
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (aliases.includes(normalizedHeaders[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Coerce a raw cell into a finite number, or `null` when the cell is absent,
 * empty, or non-numeric. Absent values/targets must be recorded as `null`
 * without terminating parsing (Req 2.7, 2.8).
 */
function toNumberOrNull(cell: unknown): number | null {
  if (cell === null || cell === undefined) {
    return null;
  }
  if (typeof cell === 'number') {
    return Number.isFinite(cell) ? cell : null;
  }
  if (typeof cell === 'string') {
    const trimmed = cell.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Coerce a raw cell into a trimmed non-empty string, or `null`. */
function toStringOrNull(cell: unknown): string | null {
  if (cell === null || cell === undefined) {
    return null;
  }
  const text = String(cell).trim();
  return text === '' ? null : text;
}

/** Parse a sheet-provided pillar value into an EngineeringPillar, or `null`. */
function parsePillar(cell: unknown): EngineeringPillar | null {
  const normalized = normalizeHeader(cell);
  if (normalized === '') {
    return null;
  }
  return (
    ENGINEERING_PILLARS.find((p) => p.toLowerCase() === normalized) ?? null
  );
}

/** Parse a sheet-provided direction value into a Direction, or `null`. */
function parseDirection(cell: unknown): Direction | null {
  const normalized = normalizeHeader(cell);
  if (normalized === '') {
    return null;
  }
  if (normalized.includes('low')) {
    return 'LowerIsBetter';
  }
  if (normalized.includes('high')) {
    return 'HigherIsBetter';
  }
  return null;
}

/**
 * Build a stable, sortable Period from raw year and month cells.
 *
 * When the month is a recognized name/number, the key uses a zero-padded month
 * number (e.g. "2025-01"); otherwise it falls back to the raw month token so
 * distinct months remain distinguishable.
 */
function buildPeriod(yearCell: unknown, monthCell: unknown): Period {
  const yearNum = toNumberOrNull(yearCell);
  const year = yearNum === null ? 0 : Math.trunc(yearNum);

  const rawMonth = toStringOrNull(monthCell);
  const month = rawMonth ?? '';

  let monthNumber: number | null = null;
  const normalizedMonth = normalizeHeader(month);
  if (normalizedMonth in MONTH_TO_NUMBER) {
    monthNumber = MONTH_TO_NUMBER[normalizedMonth];
  } else {
    const asNumber = toNumberOrNull(month);
    if (asNumber !== null && asNumber >= 1 && asNumber <= 12) {
      monthNumber = Math.trunc(asNumber);
    }
  }

  const monthSegment =
    monthNumber !== null
      ? String(monthNumber).padStart(2, '0')
      : normalizedMonth;
  const key = `${String(year).padStart(4, '0')}-${monthSegment}`;

  return { year, month, key };
}

/**
 * ExcelParser implementation. Stateless: each call derives structure solely
 * from the supplied buffer, independent of any previously parsed workbook
 * (Requirements 4.1–4.4).
 */
export class ExcelParser implements IExcelParser {
  parse(buffer: ArrayBuffer): ParseResult {
    let workbook: XLSX.WorkBook;

    // Req 2.1/2.2 — confirm the buffer is a readable workbook before anything
    // else. A read failure (or a workbook with no sheets) is INVALID_WORKBOOK.
    try {
      workbook = XLSX.read(buffer, { type: 'array' });
    } catch {
      return invalidWorkbook();
    }

    try {
      if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
        return invalidWorkbook();
      }

      // Req 2.3 — locate the `KPIs` sheet by name (prefer exact, then a
      // case-insensitive/trimmed match for robustness). When no sheet is named
      // `KPIs`, fall back to the first sheet so real governance workbooks
      // (whose sheet may be named differently) still parse.
      const sheetName =
        workbook.SheetNames.find((name) => name === KPIS_SHEET_NAME) ??
        workbook.SheetNames.find(
          (name) => normalizeHeader(name) === KPIS_SHEET_NAME.toLowerCase()
        ) ??
        workbook.SheetNames[0];

      if (!sheetName) {
        // Req 2.4 — valid workbook without any usable sheet.
        return {
          ok: false,
          error: {
            code: 'MISSING_KPIS_SHEET',
            message: `The workbook does not contain a "${KPIS_SHEET_NAME}" sheet.`,
          },
        };
      }

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        return {
          ok: false,
          error: {
            code: 'MISSING_KPIS_SHEET',
            message: `The "${KPIS_SHEET_NAME}" sheet could not be read.`,
          },
        };
      }

      // Rows as arrays: row 0 is the header; subsequent rows are data. Blank
      // rows are dropped; missing cells default to null.
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        blankrows: false,
        defval: null,
        raw: true,
      });

      if (rows.length === 0) {
        return emptyKpisSheet();
      }

      const headerRow = rows[0] ?? [];
      const sourceColumns = headerRow.map((cell) => String(cell ?? ''));

      const dataRows = rows.slice(1).filter((row) => rowHasContent(row));
      if (dataRows.length === 0) {
        // Req 2.6 — header only / no data rows.
        return emptyKpisSheet();
      }

      // Choose the layout. A normalized (long) sheet exposes Team + KPI + Value
      // columns in its header. Otherwise, attempt the wide matrix layout
      // (KPIs as rows; a month×team column header; pillar section rows).
      const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell));
      const hasNormalizedLayout =
        findColumnIndex(normalizedHeaders, HEADER_ALIASES.team) >= 0 &&
        findColumnIndex(normalizedHeaders, HEADER_ALIASES.kpi) >= 0 &&
        findColumnIndex(normalizedHeaders, HEADER_ALIASES.value) >= 0;

      if (hasNormalizedLayout) {
        const model = buildModel(sourceColumns, headerRow, dataRows);
        return { ok: true, model };
      }

      const matrixModel = parseMatrix(rows, sourceColumns);
      if (matrixModel !== null) {
        return { ok: true, model: matrixModel };
      }

      // Neither layout matched: as a last resort, try the normalized builder
      // (it tolerates missing columns) so we never silently drop a readable
      // sheet.
      const fallback = buildModel(sourceColumns, headerRow, dataRows);
      if (fallback.metrics.length > 0) {
        return { ok: true, model: fallback };
      }

      return emptyKpisSheet();
    } catch {
      // Guarantee `parse` never throws for any input (Property 1).
      return invalidWorkbook();
    }
  }
}

/** True when a data row contains at least one non-empty cell. */
function rowHasContent(row: unknown[]): boolean {
  return row.some((cell) => toStringOrNull(cell) !== null);
}

function invalidWorkbook(): ParseResult {
  return {
    ok: false,
    error: {
      code: 'INVALID_WORKBOOK',
      message: 'The file is not a valid, readable Excel workbook.',
    },
  };
}

function emptyKpisSheet(): ParseResult {
  return {
    ok: false,
    error: {
      code: 'EMPTY_KPIS_SHEET',
      message: `The "${KPIS_SHEET_NAME}" sheet contains no data rows.`,
    },
  };
}

/**
 * Build the DashboardModel from the located header and data rows. Assumes the
 * data rows are non-empty (empty-sheet detection happens before this call).
 */
function buildModel(
  sourceColumns: string[],
  headerRow: unknown[],
  dataRows: unknown[][]
): DashboardModel {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell));

  const col = {
    team: findColumnIndex(normalizedHeaders, HEADER_ALIASES.team),
    kpi: findColumnIndex(normalizedHeaders, HEADER_ALIASES.kpi),
    value: findColumnIndex(normalizedHeaders, HEADER_ALIASES.value),
    target: findColumnIndex(normalizedHeaders, HEADER_ALIASES.target),
    year: findColumnIndex(normalizedHeaders, HEADER_ALIASES.year),
    month: findColumnIndex(normalizedHeaders, HEADER_ALIASES.month),
    pillar: findColumnIndex(normalizedHeaders, HEADER_ALIASES.pillar),
    direction: findColumnIndex(normalizedHeaders, HEADER_ALIASES.direction),
    amberLower: findColumnIndex(normalizedHeaders, HEADER_ALIASES.amberLower),
    amberUpper: findColumnIndex(normalizedHeaders, HEADER_ALIASES.amberUpper),
    businessUnit: findColumnIndex(normalizedHeaders, HEADER_ALIASES.businessUnit),
  };

  const hasBusinessUnit = col.businessUnit >= 0;

  const metrics: MetricValue[] = [];
  // Preserve first-seen order while de-duplicating.
  const teamOrder: string[] = [];
  const teamSeen = new Set<string>();
  const kpiOrder: string[] = [];
  const kpiSeen = new Set<string>();
  const periodByKey = new Map<string, Period>();
  const yearSet = new Set<number>();
  const businessUnitOrder: string[] = [];
  const businessUnitSeen = new Set<string>();

  // Per-KPI accumulated definition data (first non-null wins for target/amber).
  const kpiDefMap = new Map<
    string,
    {
      pillarFromSheet: EngineeringPillar | null;
      directionFromSheet: Direction | null;
      target: number | null;
      amberLower: number | null;
      amberUpper: number | null;
    }
  >();

  const cellAt = (row: unknown[], index: number): unknown =>
    index >= 0 && index < row.length ? row[index] : null;

  for (const row of dataRows) {
    const team = col.team >= 0 ? toStringOrNull(cellAt(row, col.team)) : null;
    const kpi = col.kpi >= 0 ? toStringOrNull(cellAt(row, col.kpi)) : null;

    // Team and KPI are required to place a metric; skip rows lacking either.
    if (team === null || kpi === null) {
      continue;
    }

    if (!teamSeen.has(team)) {
      teamSeen.add(team);
      teamOrder.push(team);
    }
    if (!kpiSeen.has(kpi)) {
      kpiSeen.add(kpi);
      kpiOrder.push(kpi);
    }

    const period = buildPeriod(cellAt(row, col.year), cellAt(row, col.month));
    if (!periodByKey.has(period.key)) {
      periodByKey.set(period.key, period);
    }
    yearSet.add(period.year);

    const value = col.value >= 0 ? toNumberOrNull(cellAt(row, col.value)) : null;

    const metric: MetricValue = { team, kpi, period, value };
    if (hasBusinessUnit) {
      metric.businessUnit = toStringOrNull(cellAt(row, col.businessUnit));
      if (metric.businessUnit !== null) {
        if (!businessUnitSeen.has(metric.businessUnit)) {
          businessUnitSeen.add(metric.businessUnit);
          businessUnitOrder.push(metric.businessUnit);
        }
      }
    }
    metrics.push(metric);

    // Accumulate KPI definition data from this row.
    const existing =
      kpiDefMap.get(kpi) ??
      {
        pillarFromSheet: null,
        directionFromSheet: null,
        target: null,
        amberLower: null,
        amberUpper: null,
      };

    if (existing.pillarFromSheet === null && col.pillar >= 0) {
      existing.pillarFromSheet = parsePillar(cellAt(row, col.pillar));
    }
    if (existing.directionFromSheet === null && col.direction >= 0) {
      existing.directionFromSheet = parseDirection(cellAt(row, col.direction));
    }
    if (existing.target === null && col.target >= 0) {
      existing.target = toNumberOrNull(cellAt(row, col.target));
    }
    if (existing.amberLower === null && col.amberLower >= 0) {
      existing.amberLower = toNumberOrNull(cellAt(row, col.amberLower));
    }
    if (existing.amberUpper === null && col.amberUpper >= 0) {
      existing.amberUpper = toNumberOrNull(cellAt(row, col.amberUpper));
    }
    kpiDefMap.set(kpi, existing);
  }

  // Build KPI definitions in first-seen order. Sheet values override the
  // static pillar/direction mapping; unknown KPIs fall back to the mapping.
  const kpiDefinitions: KpiDefinition[] = kpiOrder.map((name) => {
    const acc = kpiDefMap.get(name)!;
    const fallback = lookupKpiPillar(name);

    const pillar = acc.pillarFromSheet ?? fallback.pillar;
    const direction = acc.directionFromSheet ?? fallback.direction;

    let amberBand: AmberBand | null = null;
    if (acc.amberLower !== null && acc.amberUpper !== null) {
      const lower = Math.min(acc.amberLower, acc.amberUpper);
      const upper = Math.max(acc.amberLower, acc.amberUpper);
      amberBand = { lower, upper };
    }

    return {
      name,
      pillar,
      direction,
      target: acc.target,
      amberBand,
    };
  });

  // Distinct pillars actually present among the KPI definitions.
  const pillarsPresent: EngineeringPillar[] = ENGINEERING_PILLARS.filter(
    (pillar) => kpiDefinitions.some((def) => def.pillar === pillar)
  );

  const periods = Array.from(periodByKey.values()).sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );

  const years = Array.from(yearSet).sort((a, b) => a - b);

  const dimensions: Dimensions = {
    teams: [...teamOrder],
    kpis: [...kpiOrder],
    periods,
    years,
    pillars: pillarsPresent,
    businessUnits: hasBusinessUnit ? [...businessUnitOrder] : null,
  };

  return {
    kpiDefinitions,
    metrics,
    dimensions,
    sourceColumns,
  };
}

/** Default parser instance for convenient import. */
export const excelParser: IExcelParser = new ExcelParser();
