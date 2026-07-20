/**
 * Matrix (pivot / cross-tab) workbook parser for the Leadership Dashboard.
 *
 * Many governance workbooks are authored as a WIDE matrix rather than a
 * normalized long table:
 *
 *   | KPI | How to Measure | Target | Source | Apr .............. | May ......... |
 *   |     |                |        |        | mpro Ecomm ... IVC | mpro Ecomm ... |
 *   | Pillar 1: Engineering Health (Delivery Governance) ...                     |
 *   | Sprint Commitment | (SP done / committed) x 100 | >90% | Jira | 81 85 ...  |
 *   | Pillar 2: Engineering Quality ...                                          |
 *   | ...                                                                        |
 *
 * Key traits handled here:
 *  - A two-row header: a MONTH row (months merged across a block of team
 *    columns) and a TEAM row directly beneath it.
 *  - Fixed leading columns: KPI, How to Measure, Target, Source (order/labels
 *    detected by header text, not fixed positions).
 *  - Pillar SECTION rows ("Pillar 1 ...", "Pillar 2 ...", "Sustain", "COST")
 *    that assign every following KPI row to a pillar.
 *  - Dirty value cells: "100%", "₹ 1,297,676.08", "S1-0  S2-0  S3-0", "2.1hr",
 *    "0 Hr", blanks — coerced to numbers (or null) without aborting.
 *
 * This module never throws; the caller wraps it and returns a ParseResult.
 */
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

/** Default year used to build periods when the matrix omits a year. */
export const MATRIX_DEFAULT_YEAR = new Date().getFullYear();

/** Month name/abbreviation → 1-based month number. */
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

/** Canonical display label per month number. */
const MONTH_LABEL: Readonly<Record<number, string>> = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
};

/** Section-header patterns → the pillar they introduce. */
const SECTION_PILLARS: { test: RegExp; pillar: EngineeringPillar }[] = [
  { test: /engineering health|delivery governance|pillar\s*1/i, pillar: 'Delivery' },
  { test: /engineering quality|pillar\s*2/i, pillar: 'Quality' },
  { test: /sustain/i, pillar: 'Sustainability' },
  { test: /^cost\b|run\/cloud cost|pillar\s*4/i, pillar: 'Cost' },
];

function normalize(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Parse a month token to its 1-based number, or null when unrecognized. */
function monthNumber(token: unknown): number | null {
  const n = normalize(token);
  if (n in MONTH_TO_NUMBER) return MONTH_TO_NUMBER[n];
  return null;
}

/**
 * Coerce a dirty matrix cell into a finite number, or null when it carries no
 * usable numeric content. Handles:
 *  - blanks / null                            -> null
 *  - percentages "100%" / "0%"                -> 100 / 0
 *  - currency "₹ 1,297,676.08" / "1,269,233" -> 1297676.08 / 1269233
 *  - durations "2.1hr" / "0 Hr" / "0.5 Hr"    -> 2.1 / 0 / 0.5
 *  - severity strings "S1-0  S2-1  S3-1"      -> 2 (sum of the counts)
 *  - plain numbers                            -> as-is
 */
export function cleanNumber(cell: unknown): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;

  const raw = String(cell).trim();
  if (raw === '') return null;

  // Severity notation, e.g. "S1-0  S2-1  S3-1" -> sum of the counts.
  const sevMatches = raw.match(/s\d\s*-\s*(\d+(?:\.\d+)?)/gi);
  if (sevMatches && sevMatches.length > 0) {
    let sum = 0;
    for (const m of sevMatches) {
      const num = m.match(/-\s*(\d+(?:\.\d+)?)/);
      if (num) sum += Number(num[1]);
    }
    return Number.isFinite(sum) ? sum : null;
  }

  // Strip currency symbols, commas, spaces, and unit suffixes (hr, %, etc.),
  // keeping digits, sign, and decimal point.
  const isPercent = /%/.test(raw);
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  // A percentage keeps its face value (100% -> 100), matching numeric-percent
  // targets like ">90%".
  return isPercent ? value : value;
}

/**
 * A percentage value at or below this magnitude is treated as a 0–1 fraction
 * and scaled to a 0–100 percentage (e.g. 0.75 → 75, 1.16 → 116, 1.00 → 100).
 * Chosen above 1 so ratios that slightly exceed 100% (utilization) still scale,
 * while genuine 0–100 percentages (e.g. 58, 81) are left untouched.
 */
export const FRACTION_UPPER_BOUND = 1.5;

/** True when a KPI's target text denotes a percentage metric (contains "%"). */
export function isPercentTarget(targetText: unknown): boolean {
  return /%/.test(String(targetText ?? ''));
}

/**
 * Normalize a percentage KPI's value: when the KPI is a percentage metric and
 * the value looks like a 0–1 fraction (|v| ≤ {@link FRACTION_UPPER_BOUND}),
 * scale it to a 0–100 percentage. Non-percentage KPIs and already-0–100 values
 * are returned unchanged. `null` passes through.
 */
export function normalizePercentValue(
  value: number | null,
  isPercent: boolean
): number | null {
  if (value === null || !isPercent) return value;
  const magnitude = Math.abs(value);
  if (magnitude > 0 && magnitude <= FRACTION_UPPER_BOUND) {
    return value * 100;
  }
  return value;
}

/** Extract a representative numeric target from free-text like ">90%", "<4 hours". */
export function parseTargetText(text: unknown): number | null {
  const raw = String(text ?? '').trim();
  if (raw === '') return null;
  if (/zero/i.test(raw)) return 0;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Is this row a pillar/section header (KPI cell matches a section pattern)? */
function sectionPillar(text: unknown): EngineeringPillar | null {
  const raw = String(text ?? '').trim();
  if (raw === '') return null;
  for (const { test, pillar } of SECTION_PILLARS) {
    if (test.test(raw)) return pillar;
  }
  return null;
}

/** Column roles for the fixed leading columns. */
interface FixedColumns {
  kpi: number;
  howToMeasure: number;
  target: number;
  source: number;
  /** First column that holds team/month data (after the fixed columns). */
  firstDataCol: number;
}

/**
 * Result of detecting the matrix header: the fixed columns, the month row and
 * team row indices, and a per-column month/team map for the data columns.
 */
export interface MatrixHeader {
  fixed: FixedColumns;
  monthByCol: Map<number, number>; // col -> 1-based month
  teamByCol: Map<number, string>; // col -> team name
  headerEndRow: number; // last header row index (team row)
}

/**
 * Detect the matrix header from the first several rows. Returns null when the
 * sheet does not look like a supported matrix layout.
 */
export function detectMatrixHeader(rows: unknown[][]): MatrixHeader | null {
  const scanLimit = Math.min(rows.length, 8);

  // 1) Find the KPI column + row by locating a header cell equal to "kpi".
  let kpiRow = -1;
  let kpiCol = -1;
  for (let r = 0; r < scanLimit && kpiRow < 0; r += 1) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      if (normalize(row[c]) === 'kpi') {
        kpiRow = r;
        kpiCol = c;
        break;
      }
    }
  }
  if (kpiRow < 0) return null;

  // 2) Locate the other fixed columns near the KPI header (same row).
  const kpiRowCells = rows[kpiRow] ?? [];
  const findCol = (aliases: string[]): number => {
    for (let c = 0; c < kpiRowCells.length; c += 1) {
      if (aliases.includes(normalize(kpiRowCells[c]))) return c;
    }
    return -1;
  };
  const howToMeasure = findCol(['how to measure', 'measure', 'how to measure ']);
  const target = findCol(['target', 'target ']);

  // 3) Find the MONTH row: a row (kpiRow or below) containing >= 2 month tokens
  //    in columns to the right of the fixed columns.
  const fixedEndGuess = Math.max(kpiCol, howToMeasure, target);
  let monthRow = -1;
  for (let r = kpiRow; r < scanLimit && monthRow < 0; r += 1) {
    const row = rows[r] ?? [];
    let count = 0;
    for (let c = fixedEndGuess + 1; c < row.length; c += 1) {
      if (monthNumber(row[c]) !== null) count += 1;
    }
    if (count >= 1) monthRow = r;
  }
  if (monthRow < 0) return null;

  // 4) The TEAM row is the row directly beneath the month row.
  const teamRow = monthRow + 1;
  if (teamRow >= rows.length) return null;
  const teamCells = rows[teamRow] ?? [];

  // 5) Detect "Source" (optional) and compute the first data column: the first
  //    column with a team label at/after the fixed columns.
  const source = (() => {
    for (let c = 0; c <= fixedEndGuess + 2 && c < teamCells.length; c += 1) {
      if (normalize(teamCells[c]) === 'source' || normalize(kpiRowCells[c]) === 'source') {
        return c;
      }
    }
    return -1;
  })();

  const firstDataCol = Math.max(fixedEndGuess, source) + 1;

  // 6) Forward-fill months across each block and read team per column.
  const monthRowCells = rows[monthRow] ?? [];
  const monthByCol = new Map<number, number>();
  const teamByCol = new Map<number, string>();
  const lastCol = Math.max(monthRowCells.length, teamCells.length);
  let currentMonth: number | null = null;
  for (let c = firstDataCol; c < lastCol; c += 1) {
    const m = monthNumber(monthRowCells[c]);
    if (m !== null) currentMonth = m;
    const team = String(teamCells[c] ?? '').trim();
    if (currentMonth !== null && team !== '') {
      monthByCol.set(c, currentMonth);
      teamByCol.set(c, team);
    }
  }

  if (monthByCol.size === 0 || teamByCol.size === 0) return null;

  return {
    fixed: { kpi: kpiCol, howToMeasure, target, source, firstDataCol },
    monthByCol,
    teamByCol,
    headerEndRow: teamRow,
  };
}

/** Build a Period for a month number under the default year. */
function buildPeriod(month: number, year: number): Period {
  return {
    year,
    month: MONTH_LABEL[month] ?? String(month),
    key: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
  };
}

/**
 * Parse a matrix-layout sheet into a DashboardModel. Returns null when the
 * sheet is not a recognizable matrix (the caller then tries other strategies).
 *
 * @param rows sheet as array-of-arrays (row 0 = first sheet row)
 * @param sourceColumns the raw first-row header, preserved for export fidelity
 * @param year the year to stamp periods with (matrix omits year)
 */
export function parseMatrix(
  rows: unknown[][],
  sourceColumns: string[],
  year: number = MATRIX_DEFAULT_YEAR
): DashboardModel | null {
  const header = detectMatrixHeader(rows);
  if (header === null) return null;

  const { fixed, monthByCol, teamByCol, headerEndRow } = header;

  const metrics: MetricValue[] = [];
  const teamOrder: string[] = [];
  const teamSeen = new Set<string>();
  const kpiOrder: string[] = [];
  const kpiSeen = new Set<string>();
  const periodByKey = new Map<string, Period>();
  const yearSet = new Set<number>();

  // Register teams in first-seen (column) order.
  for (const [, team] of [...teamByCol.entries()].sort((a, b) => a[0] - b[0])) {
    if (!teamSeen.has(team)) {
      teamSeen.add(team);
      teamOrder.push(team);
    }
  }

  const kpiPillar = new Map<string, EngineeringPillar | null>();
  const kpiTargetText = new Map<string, string>();
  // Descriptor metadata retained per-KPI (first-seen row) for the pivot view.
  const kpiHowToMeasure = new Map<string, string | null>();
  const kpiSource = new Map<string, string | null>();

  let currentPillar: EngineeringPillar | null = null;

  for (let r = headerEndRow + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const kpiCell = row[fixed.kpi];
    const kpiName = String(kpiCell ?? '').trim();
    if (kpiName === '') continue;

    // Section header row → switch the current pillar, emit no metrics.
    const section = sectionPillar(kpiName);
    if (section !== null && isSectionRow(row, monthByCol)) {
      currentPillar = section;
      continue;
    }

    // Regular KPI row.
    const rowTargetText = fixed.target >= 0 ? String(row[fixed.target] ?? '').trim() : '';
    if (!kpiSeen.has(kpiName)) {
      kpiSeen.add(kpiName);
      kpiOrder.push(kpiName);
      const fallback = lookupKpiPillar(kpiName);
      kpiPillar.set(kpiName, currentPillar ?? fallback.pillar);
      if (fixed.target >= 0) {
        kpiTargetText.set(kpiName, rowTargetText);
      }
      // Capture descriptor metadata from the first-seen row of this KPI.
      const howToMeasure =
        fixed.howToMeasure >= 0
          ? String(row[fixed.howToMeasure] ?? '').trim()
          : '';
      kpiHowToMeasure.set(kpiName, howToMeasure !== '' ? howToMeasure : null);
      const sourceText =
        fixed.source >= 0 ? String(row[fixed.source] ?? '').trim() : '';
      kpiSource.set(kpiName, sourceText !== '' ? sourceText : null);
    }

    // Percentage KPIs may store values as 0–1 fractions; normalize those to a
    // 0–100 scale so they compare correctly against percentage targets.
    const percentKpi = isPercentTarget(kpiTargetText.get(kpiName) ?? rowTargetText);

    for (const [col, month] of monthByCol.entries()) {
      const team = teamByCol.get(col);
      if (team === undefined) continue;
      const period = buildPeriod(month, year);
      if (!periodByKey.has(period.key)) periodByKey.set(period.key, period);
      yearSet.add(period.year);

      const value = normalizePercentValue(cleanNumber(row[col]), percentKpi);
      metrics.push({ team, kpi: kpiName, period, value });
    }
  }

  if (kpiOrder.length === 0 || metrics.length === 0) return null;

  const kpiDefinitions: KpiDefinition[] = kpiOrder.map((name) => {
    const fallback = lookupKpiPillar(name);
    const pillar = kpiPillar.get(name) ?? fallback.pillar;
    const direction: Direction = fallback.direction;
    const rawTargetText = kpiTargetText.get(name);
    const target = parseTargetText(rawTargetText);
    const amberBand: AmberBand | null = null;
    return {
      name,
      pillar,
      direction,
      target,
      amberBand,
      howToMeasure: kpiHowToMeasure.get(name) ?? null,
      targetText: rawTargetText && rawTargetText !== '' ? rawTargetText : null,
      source: kpiSource.get(name) ?? null,
    };
  });

  const ENGINEERING_PILLARS: EngineeringPillar[] = [
    'Delivery', 'Quality', 'Sustainability', 'Cost',
  ];
  const pillarsPresent = ENGINEERING_PILLARS.filter((p) =>
    kpiDefinitions.some((d) => d.pillar === p)
  );

  const periods = [...periodByKey.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );
  const years = [...yearSet].sort((a, b) => a - b);

  const dimensions: Dimensions = {
    teams: teamOrder,
    kpis: kpiOrder,
    periods,
    years,
    pillars: pillarsPresent,
    businessUnits: null,
  };

  return { kpiDefinitions, metrics, dimensions, sourceColumns };
}

/**
 * A section row is one whose data columns are essentially empty (the pillar
 * label spans the row). This guards against a KPI literally named like a
 * section by requiring the data cells to be blank.
 */
function isSectionRow(
  row: unknown[],
  monthByCol: Map<number, number>
): boolean {
  let nonEmpty = 0;
  for (const col of monthByCol.keys()) {
    if (cleanNumber(row[col]) !== null) nonEmpty += 1;
  }
  return nonEmpty === 0;
}
